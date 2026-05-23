"use server";

import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";

// Sign-in / sign-out are client-side under Better Auth (see
// src/lib/auth-client.ts and the popup page); they don't need server-action
// wrappers anymore.
//
// verifyAdminSecret remains a server action because the comparison must run
// against ADMIN_SECRET, which is never exposed to the client. Rate-limited
// against brute-force.

export async function verifyAdminSecret(secret: string) {
  try {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for") || "unknown";
    await checkRateLimit(ip, "core");
  } catch {
    return { error: "Too many attempts. Try again later." };
  }

  if (secret === process.env.ADMIN_SECRET) {
    return { success: true };
  }
  return { error: "Invalid override code." };
}
