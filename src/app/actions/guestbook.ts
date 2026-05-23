/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { Filter } from "bad-words";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

// --- 1. CONFIGURATION ---
const filter = new Filter();

// Common profanity evasions, acronyms & leetspeak
const evasions = [
  // F-Word Variants
  "fk",
  "fck",
  "fuk",
  "fuhk",
  "fugh",
  "f.u.c.k",
  "f u c k",
  "f*ck",
  "f@ck",
  "dafuk",
  "dafuq",
  "mf",
  "mfer",
  "mofo",

  // S-Word Variants
  "sh1t",
  "sh!t",
  "shyt",
  "shiit",
  "sh*t",
  "sh.it",
  "sheet",

  // B-Word Variants
  "b1tch",
  "b!tch",
  "biatch",
  "b*tch",
  "b.i.t.c.h",

  // Anatomy / Sexual
  "dik",
  "d1k",
  "d1ck",
  "c0ck",
  "pp",
  "puss",
  "pussi",
  "pussy",
  "wank",
  "wanker",
  "jerko",
  "bj",
  "succ",

  // Insults / Ableist / Hate
  "smooth brain",
  "regarded",
  "rtd",
  "autist",
  "spaz",
  "mong",
  "simp",
  "incel",
  "virgin",
  "cuck",
  "soyboy",
  "retard",

  // Hostile Acronyms
  "stfu",
  "gtfo",
  "kys",
  "oms",
  "diaf",
  "idgaf",
  "retard",
  "regarded",
  "mong",
  "simp",
  "incel",
];
filter.addWords(...evasions);

const normalizeText = (text: string) =>
  text.replace(/[\s.]+/g, "").toLowerCase();

// --- Types ---
interface HuggingFaceScore {
  label: string;
  score: number;
}

export type GuestbookEntry = {
  name: string;
  message: string;
  timestamp: number;
  avatar?: string;
  verified?: boolean;
  provider?: "github" | "discord" | "google";
};

export interface GuestbookState {
  success: boolean;
  message?: string;
  errors?: {
    message?: string[];
  };
  timestamp?: number;
  newEntry?: GuestbookEntry;
}

function sanitizeEntry(entry: GuestbookEntry) {
  return Object.fromEntries(
    Object.entries(entry).filter(([_, v]) => v != null),
  );
}

// --- VALIDATION (Message Only) ---
// English (ASCII) + Emojis. No other scripts.
const englishWithEmojisRegex =
  /^[\x20-\x7E\n\r\p{Extended_Pictographic}\p{Emoji_Component}]+$/u;

const messageSchema = z
  .string()
  .trim()
  .min(3, "Message is too short (min 3 chars)")
  .max(200, "Message is too long (max 200 chars)")
  .regex(
    englishWithEmojisRegex,
    "Only English letters, numbers, symbols, and emojis are allowed.",
  );

// --- CACHED READ ---
export async function fetchGuestbookEntries(
  offset: number,
  limit: number = 20,
): Promise<GuestbookEntry[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("guestbook-entries", "guestbook");

  const start = offset;
  const end = offset + limit - 1;

  try {
    const entries = await redis.lrange<GuestbookEntry>("guestbook", start, end);
    return entries ?? [];
  } catch (error) {
    console.error("Redis Read Error:", error);
    return [];
  }
}

// --- SECURE WRITE ACTION ---
export async function signGuestbook(
  prevState: GuestbookState,
  formData: FormData,
): Promise<GuestbookState> {
  // 1. AUTH GATE - Rejects bots immediately
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return {
      success: false,
      message: "Unauthorized: Please login to sign.",
      timestamp: Date.now(),
    };
  }

  // 2. Identify User (From Secure Session)
  const name = session.user.name || "Verified User";
  const avatar = session.user.image || undefined;
  const verified = true; // Always true since we require auth
  let provider: "github" | "discord" | "google" | undefined;

  if (avatar?.includes("github")) provider = "github";
  else if (avatar?.includes("discord")) provider = "discord";
  else if (avatar?.includes("google")) provider = "google";

  // 3. Rate Limit
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for") || "unknown";
  try {
    await checkRateLimit(ip, "guestbook");
  } catch (error) {
    logger.warn({ ip }, "Guestbook rate limit exceeded");
    return {
      success: false,
      message: error instanceof Error ? error.message : "Rate limit exceeded",
      timestamp: Date.now(),
    };
  }

  // 4. Validate Message
  const rawMessage = formData.get("message");
  const messageValidation = messageSchema.safeParse(rawMessage);

  if (!messageValidation.success) {
    return {
      success: false,
      errors: { message: [messageValidation.error.issues[0].message] },
      timestamp: Date.now(),
    };
  }
  const message = messageValidation.data;

  // 5. Moderation (Local + Pattern)
  try {
    if (filter.isProfane(message) || filter.isProfane(name)) {
      return {
        success: false,
        message: "Profanity detected. Please keep it clean.",
        timestamp: Date.now(),
      };
    }
    if (filter.isProfane(normalizeText(message))) {
      return {
        success: false,
        message: "Nice try. Please keep it clean.",
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    logger.error({ error }, "Moderation error");
  }

  // 6. AI Safety Filter (Toxic-BERT)
  const hfToken = process.env.HUGGING_FACE_TOKEN;
  if (hfToken) {
    try {
      const response = await fetch(
        "https://router.huggingface.co/hf-inference/models/unitary/toxic-bert",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: `${name}: ${message}` }),
        },
      );

      if (response.ok) {
        const result = await response.json();
        const scores = result[0];
        const toxicScore = scores.find((s: HuggingFaceScore) => s.score > 0.7);

        if (toxicScore) {
          return {
            success: false,
            message: "Message blocked by AI safety filters.",
            timestamp: Date.now(),
          };
        }
      }
    } catch (error) {
      logger.error({ error }, "AI Moderation network error");
      // Fail safe: reject if we can't verify safety?
      // Or fail open? Usually fail open for reliability, but fail safe for strictness.
      // Currently failing open (logging error but continuing would be default unless we return)
      // Let's return error to be strict since you want "bot proofing".
      return {
        success: false,
        message: "Safety verification unavailable. Try again.",
        timestamp: Date.now(),
      };
    }
  }

  // 7. Persist
  const entry: GuestbookEntry = {
    name,
    message,
    timestamp: Date.now(),
    avatar,
    verified,
    provider,
  };

  try {
    await redis.lpush("guestbook", entry);
    logger.info({ name, verified }, "Guestbook signed successfully");

    revalidateTag("guestbook", { expire: 0 });

    return {
      success: true,
      message: "Signature encoded successfully.",
      newEntry: entry,
      timestamp: Date.now(),
    };
  } catch (error) {
    Sentry.captureException(error);
    return {
      success: false,
      message: "Database write error.",
      timestamp: Date.now(),
    };
  }
}

// --- ADMIN ACTIONS ---
export async function deleteGuestbookEntry(entry: GuestbookEntry) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.isAdmin) return { error: "Access Denied" };

  try {
    const cleanEntry = sanitizeEntry(entry);
    await redis.lrem("guestbook", 1, JSON.stringify(cleanEntry));
    revalidateTag("guestbook", { expire: 0 });
    return { success: true };
  } catch (error) {
    return { error: "Delete failed" };
  }
}

export async function purgeGuestbook() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.isAdmin) return { error: "Access Denied" };

  try {
    await redis.del("guestbook");
    revalidateTag("guestbook", { expire: 0 });
    return { success: true };
  } catch (error) {
    return { error: "Purge failed" };
  }
}
