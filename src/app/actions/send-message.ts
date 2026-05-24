"use server";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";
import { contactSchema } from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import logger from "@/lib/logger";
import { ContactTemplate } from "@/components/email/contact-template";
import { redis } from "@/lib/redis";
import { unlockServerAchievement } from "@/app/actions/achievements";

const resend = new Resend(process.env.RESEND_API_KEY);

// Env-driven sender/recipient. Defaults are the Resend sandbox sender
// and the maintainer's address — keep these in env so per-environment
// inboxes (staging vs. prod) are a config change, not a deploy.
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Portfolio Contact <onboarding@resend.dev>";
const CONTACT_RECIPIENT = process.env.CONTACT_RECIPIENT_EMAIL;

export interface ContactState {
  success: boolean;
  message?: string;
  errors?: {
    name?: string[];
    email?: string[];
    message?: string[];
  };
  timestamp?: number;
}

export async function sendMessage(
  prevState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for") || "unknown";
  const userAgent = headerStore.get("user-agent") || "unknown";

  // 1. HONEYPOT CHECK
  const honeypot = formData.get("_gotcha");
  if (honeypot && honeypot.toString().length > 0) {
    logger.warn({ ip, userAgent }, "Bot detected via honeypot");
    return {
      success: true,
      message: "Transmission sent successfully.",
      timestamp: Date.now(),
    };
  }

  // 2. Rate Limit (Strict: "contact" type)
  try {
    await checkRateLimit(ip, "contact");
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Rate limit exceeded";
    logger.warn({ ip, userAgent }, `Contact rate limit exceeded: ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
      timestamp: Date.now(),
    };
  }

  // 3. Validation
  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  };

  const visitorId = formData.get("visitorId")?.toString();
  const validatedFields = contactSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed. Check your inputs.",
      timestamp: Date.now(),
    };
  }

  const { name, email, message } = validatedFields.data;

  // 4. Execution
  try {
    // BLACK BOX RECORDING: Save to Redis first
    await redis.lpush("inbox", {
      name,
      email,
      message,
      ip,
      userAgent,
      timestamp: Date.now(),
      status: "received",
    });

    // Fail soft if CONTACT_RECIPIENT_EMAIL is unset — the message is
    // already in Redis (the inbox archive), so the user's transmission
    // isn't lost. Surface a clear server log so the misconfig is
    // diagnosable.
    if (!CONTACT_RECIPIENT) {
      logger.error(
        { email },
        "CONTACT_RECIPIENT_EMAIL is unset; message saved to inbox but not emailed",
      );
      return {
        success: true,
        message:
          "Transmission saved to archive. (Operator inbox not configured — message stored, no email sent.)",
        timestamp: Date.now(),
      };
    }

    // Send Email
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to: CONTACT_RECIPIENT,
      replyTo: email,
      subject: `New Transmission from ${name}`,
      react: ContactTemplate({ name, email, message }),
    });

    if (data.error) {
      logger.error({ error: data.error, email }, "Resend API Error");
      return {
        success: false,
        message:
          "Signal jamming detected (API Error). Message saved to archive.",
        timestamp: Date.now(),
      };
    }

    // 5. UNLOCK ACHIEVEMENT (Server-Side)
    if (visitorId) {
      try {
        await unlockServerAchievement(visitorId, "SOCIAL_ENGINEER");
      } catch (achError) {
        console.error("Failed to unlock achievement:", achError);
        // Don't fail the contact form just because achievement failed
      }
    }

    logger.info({ email }, "Email sent successfully");
    return {
      success: true,
      message: "Transmission sent successfully.",
      timestamp: Date.now(),
    };
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag("action", "send-message");
      scope.setUser({ ip_address: ip });
      scope.setContext("headers", { user_agent: userAgent });
      scope.setContext("payload", { email, name });
      Sentry.captureException(error);
    });

    logger.error({ error }, "Unexpected error in sendMessage");
    return {
      success: false,
      message: "Critical transmission error. Please retry.",
      timestamp: Date.now(),
    };
  }
}
