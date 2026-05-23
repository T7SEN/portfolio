import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { customSession } from "better-auth/plugins";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/schema";

// Admin RBAC: env-driven email whitelist, matching the previous NextAuth
// behavior. We don't promote `isAdmin` to a DB column — the whitelist is
// the source of truth and changes via env var, not a deploy.
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const isAdminEmail = (email: string | null | undefined): boolean =>
  !!email && adminEmails.includes(email.toLowerCase());

export const auth = betterAuth({
  appName: "T7SEN Portfolio",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "discord", "google"],
    },
  },
  session: {
    // Cookie cache skips a DB roundtrip for hot reads. 60s is fine for a
    // personal site — short enough that admin changes propagate quickly.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  plugins: [
    // Augment the session with isAdmin derived from the env whitelist.
    customSession(async ({ user, session }) => ({
      user: {
        ...user,
        isAdmin: isAdminEmail(user.email),
      },
      session,
    })),
  ],
});

// Typed Session including the customSession augmentation (so `isAdmin` is
// part of the user shape downstream).
export type Session = typeof auth.$Infer.Session;
