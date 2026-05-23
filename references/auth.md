# Auth — Better Auth + Drizzle + Turso

Companion to SKILL.md "Subsystems → Guestbook + auth" and "Critical rules
→ Auth is Better Auth + Drizzle + Turso". Documents the actual auth
surface in this repo — Better Auth running against a libSQL database
(Turso in production, local file in dev) via the Drizzle adapter, plus
the admin RBAC path and the popup sign-in flow.

The project sits on **`better-auth@^1.6.x`**. **NextAuth has been
removed.** Verify any auth change against
[better-auth.com/docs](https://better-auth.com/docs), not Auth.js /
NextAuth memory.

---

## The auth factory

[`src/lib/auth.ts`](../src/lib/auth.ts) is the entire Better Auth wiring:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { customSession } from "better-auth/plugins";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/schema";

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
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "discord", "google"],
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 60 }, // 60s DB-roundtrip skip
  },
  plugins: [
    customSession(async ({ user, session }) => ({
      user: { ...user, isAdmin: isAdminEmail(user.email) },
      session,
    })),
  ],
});

export type Session = typeof auth.$Infer.Session;
```

Notable choices:

- **No NextAuth.** All NextAuth files and the `next-auth` package were
  removed. There is no `src/auth.ts`, no `src/types/next-auth.d.ts`, no
  `/api/auth/[...nextauth]` route.
- **`drizzleAdapter` with `provider: "sqlite"`** targets libSQL via the
  Drizzle libSQL driver. Schema lives in
  [`src/db/schema.ts`](../src/db/schema.ts).
- **OAuth credentials are passed explicitly.** Better Auth does not
  auto-read env vars the way NextAuth does. Hence `GITHUB_CLIENT_ID`
  (not `AUTH_GITHUB_ID`).
- **`accountLinking.enabled: true`** with all 3 OAuth providers trusted
  — same email across providers links to the same `user` row.
- **`session.cookieCache: { maxAge: 60 }`** — 60s cookie cache skips a
  DB roundtrip for hot reads. Fine for a personal site; admin changes
  still propagate in ~1 minute.
- **`customSession` plugin** injects `isAdmin` based on `ADMIN_EMAILS`.
  See "Admin RBAC" below.
- **`Session` type** is re-exported via `typeof auth.$Infer.Session` so
  consumers get a typed shape including the `customSession` fields.

---

## The 4 Better Auth tables

[`src/db/schema.ts`](../src/db/schema.ts) defines exactly the columns
Better Auth needs. Names and types match Better Auth's expected shape —
do not rename without updating the `drizzleAdapter`'s `schema` mapping.

| Table          | Purpose                                | Key columns                                                                                                                                                                                                  |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user`         | Identity row                           | `id` PK, `email` UNIQUE, `name`, `emailVerified` (bool), `image`, `createdAt`, `updatedAt`                                                                                                                   |
| `session`      | DB-backed sessions                     | `id` PK, `userId` FK→user (cascade), `token` UNIQUE, `expiresAt`, `ipAddress`, `userAgent`                                                                                                                   |
| `account`      | OAuth account links + tokens           | `id` PK, `userId` FK→user (cascade), `providerId` (`github`/`discord`/`google`), `accountId`, `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `idToken`, `password` |
| `verification` | Magic-link / email-verification tokens | `id` PK, `identifier`, `value`, `expiresAt`                                                                                                                                                                  |

All four are `sqliteTable`. Timestamps are
`integer({ mode: "timestamp" })`; booleans are
`integer({ mode: "boolean" })`.

**These tables live in libSQL (Turso in prod, `./local.db` in dev) — not
in Upstash Redis.** See [`redis-schema.md`](./redis-schema.md) for what
stays in Redis (guestbook, inbox, achievements, dashboard cache).

---

## DB client

[`src/db/index.ts`](../src/db/index.ts):

```ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, ...(authToken ? { authToken } : {}) });
export const db = drizzle(client);
```

- **Local dev** uses `file:./local.db` (gitignored). No Turso credentials
  needed.
- **Production** uses `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (set on
  DO App Platform).

---

## Migrations

Drizzle Kit (`pnpm exec drizzle-kit`) drives schema changes.

```bash
# After editing src/db/schema.ts:
pnpm exec drizzle-kit generate     # creates SQL in src/db/migrations/
pnpm exec drizzle-kit migrate      # applies pending migrations
```

[`drizzle.config.ts`](../drizzle.config.ts) picks dialect based on
whether `TURSO_AUTH_TOKEN` is set: `"sqlite"` for local (writes to
`./local.db`), `"turso"` for remote.

Migration files are checked into git under `src/db/migrations/`. **Never
edit a shipped migration** — add a new one. Editing a committed
migration causes hash mismatches on already-migrated databases.

---

## Admin RBAC — `session.user.isAdmin` via `customSession`

There is no NextAuth-style session callback. Better Auth uses plugins.
The `customSession` plugin runs after every session read and augments
the returned shape:

```ts
customSession(async ({ user, session }) => ({
  user: { ...user, isAdmin: isAdminEmail(user.email) },
  session,
})),
```

`isAdminEmail` checks the lowercased user email against the
comma-separated `ADMIN_EMAILS` env list. Same semantics as the previous
NextAuth callback — operationally identical, just plumbed through a
plugin.

The `Session` type exported from `src/lib/auth.ts` (via
`typeof auth.$Infer.Session`) includes `user.isAdmin` automatically.

On the client, the `customSessionClient<typeof auth>()` plugin in
[`src/lib/auth-client.ts`](../src/lib/auth-client.ts) propagates the
same shape to `useSession()`'s return type — so `session.user.isAdmin`
is type-safe everywhere.

---

## Server-side session reads

The canonical pattern:

```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) return { error: "Unauthorized" };

const userEmail = session.user.email;
const isAdmin = session.user.isAdmin; // typed via customSession
```

Every server action that reads the session does this (see `guestbook.ts`
for the canonical example). The `await headers()` is mandatory in Next 16.

---

## Admin actions — server-side checks

Pattern from
[`src/app/actions/guestbook.ts`](../src/app/actions/guestbook.ts):

```ts
export async function deleteGuestbookEntry(entry: GuestbookEntry) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.isAdmin) return { error: "Access Denied" };
  /* ... */
}

export async function purgeGuestbook() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.isAdmin) return { error: "Access Denied" };
  /* ... */
}
```

The client `useAdmin()` hook is **UX only**. The server check is the
security boundary.

---

## Admin secret override — `verifyAdminSecret`

Unchanged from the NextAuth era; doesn't depend on the auth library:

```ts
// src/app/actions/auth-actions.ts
export async function verifyAdminSecret(secret: string) {
  try {
    const ip = (await headers()).get("x-forwarded-for") || "unknown";
    await checkRateLimit(ip, "core");
  } catch {
    return { error: "Too many attempts. Try again later." };
  }

  if (secret === process.env.ADMIN_SECRET) return { success: true };
  return { error: "Invalid override code." };
}
```

The `login()` / `logout()` server actions that wrapped NextAuth's
`signIn`/`signOut` are **gone** — Better Auth's sign-in/out is
client-side via `authClient.signIn.social()` / `authClient.signOut()`.

---

## Client-side admin awareness — `AdminProvider` + `useAdmin`

[`src/providers/admin-provider.tsx`](../src/providers/admin-provider.tsx)
is simpler under Better Auth — there is no `SessionProvider` wrapper:

```tsx
"use client";
import { createContext, useContext } from "react";
import { useSession } from "@/lib/auth-client";

const AdminContext = createContext<{ isAdmin: boolean } | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;
  return (
    <AdminContext.Provider value={{ isAdmin }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  /* throws if used outside AdminProvider */
}
```

Use `useAdmin()` to gate admin buttons in client components. Do **not**
trust it for security — re-check on the server.

---

## Sign-in flow

| Step                                                       | Where                                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| User clicks a provider button (guestbook form)             | `openLoginPopup(provider)` in `guestbook-form.tsx` opens `/auth/popup?provider=<id>`                                              |
| Popup loads `/auth/popup`                                  | Calls `authClient.signIn.social({ provider, callbackURL: "/auth/success" })`                                                      |
| Better Auth redirects to provider                          | Standard OAuth dance                                                                                                              |
| Provider redirects back to `/api/auth/callback/<provider>` | Better Auth's route handler ([`src/app/api/auth/[...all]/route.ts`](../src/app/api/auth/[...all]/route.ts)) finishes the exchange |
| Session cookie set                                         | Better Auth's session cookie (signed, HttpOnly)                                                                                   |
| Popup lands on `/auth/success`                             | Posts `AUTH_SUCCESS` via `window.postMessage` to the opener and closes                                                            |
| Opener (`guestbook-form.tsx`) receives the message         | Calls `useSession()`'s `refetch()` to reload the session, then `router.refresh()`                                                 |

OAuth callback URLs to register on each provider's developer console:

- GitHub: `https://t7sen.com/api/auth/callback/github`
- Discord: `https://t7sen.com/api/auth/callback/discord`
- Google: `https://t7sen.com/api/auth/callback/google`

For local dev: `http://localhost:3000/api/auth/callback/<provider>`.

**GitHub-specific:** the GitHub OAuth app must request the `user:email`
scope, otherwise Better Auth can't read the email and account-linking
fails.

Sign-out: `authClient.signOut()` from anywhere in the client.

---

## Environment variables

All required at runtime. Better Auth needs them passed explicitly via
`betterAuth({...})` (`secret`, `baseURL`) or via `clientId`/`clientSecret`
per provider.

| Env                                           | Purpose                                                                                                          | Where set                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `BETTER_AUTH_SECRET`                          | JWT signing + cookie encryption. `openssl rand -base64 32`                                                       | DO dashboard (Encrypted) |
| `BETTER_AUTH_URL`                             | Canonical site URL (`https://t7sen.com` prod, `http://localhost:3000` dev)                                       | DO dashboard             |
| `NEXT_PUBLIC_APP_URL`                         | Browser-side baseURL for `authClient`. Should match `BETTER_AUTH_URL` for prod.                                  | DO dashboard             |
| `TURSO_DATABASE_URL`                          | `libsql://<db-name>.turso.io`                                                                                    | DO dashboard             |
| `TURSO_AUTH_TOKEN`                            | Long-lived Turso token. Create via the web dashboard (**Create token** button) or `turso db tokens create <db>`. | DO dashboard (Encrypted) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`   | GitHub OAuth app                                                                                                 | DO dashboard             |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord OAuth app                                                                                                | DO dashboard             |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`   | Google OAuth app                                                                                                 | DO dashboard             |
| `ADMIN_EMAILS`                                | Comma-separated admin email whitelist                                                                            | DO dashboard             |
| `ADMIN_SECRET`                                | Override for `verifyAdminSecret`                                                                                 | DO dashboard             |

All declared in [`.do/app.yaml`](../.do/app.yaml)'s `envs:` block as
`${VAR_NAME}` placeholders; actual values configured in the DO dashboard.

---

## Local development

```bash
pnpm install                          # installs deps + applies postinstalls
pnpm exec drizzle-kit migrate         # applies migrations to ./local.db
pnpm dev                              # boots Next.js
```

For OAuth to work locally, register
`http://localhost:3000/api/auth/callback/<provider>` as an authorized
callback in each OAuth provider's developer console.

Without Turso env vars, `src/db/index.ts` falls back to
`file:./local.db` — a single-file SQLite database. The file is
gitignored.

---

## Production deployment — Turso setup

Two paths. Pick the one that fits — the web dashboard is enough for a
personal portfolio with a single DB.

### Path 1 — Web dashboard (recommended for personal scale)

1. Sign up at [turso.tech](https://turso.tech) (GitHub OAuth works).
2. Create a database. Pick a region near `fra` (DO App Platform's
   Frankfurt region) for lowest latency — `eu-central` or `eu-west`.
3. From the database overview:
   - Copy **Database URL** → `TURSO_DATABASE_URL`
     (looks like `libsql://<name>-<org>.turso.io`)
   - Click **Create token** → copy → `TURSO_AUTH_TOKEN`.
     **Save it now** — the token is only displayed once.

No CLI installation required.

### Path 2 — Turso CLI (for scripted DB management)

On Windows, Turso's CLI only ships via **WSL**. macOS / Linux can use
the curl install directly. The native Windows PowerShell installer
(`iwr get.tur.so/install.ps1`) no longer exists — WSL is the only
documented Windows path.

```bash
# macOS / Linux — native:
curl -sSfL https://get.tur.so/install.sh | bash

# Windows — install WSL first (Microsoft docs), then inside `wsl`:
curl -sSfL https://get.tur.so/install.sh | bash

# Then (works on all platforms once the CLI is on PATH):
turso auth signup                          # or `turso auth login`
turso db create t7sen-portfolio
turso db show t7sen-portfolio --url        # → TURSO_DATABASE_URL
turso db tokens create t7sen-portfolio     # → TURSO_AUTH_TOKEN
```

### Apply migrations to production

```bash
TURSO_DATABASE_URL=<url> TURSO_AUTH_TOKEN=<token> \
  pnpm exec drizzle-kit migrate
```

**Run this before the first deploy under the new auth** — otherwise the
`/api/auth/[...all]` route 500s on missing tables.

For subsequent schema changes: edit `src/db/schema.ts` →
`pnpm exec drizzle-kit generate` → commit the new migration →
`pnpm exec drizzle-kit migrate` against prod **before** pushing to
`main` (DO auto-deploy fires on push; the new code expects the migrated
schema).

---

## Refusal triggers

Push back — with rationale — on:

- **Any `next-auth` / `@auth/*` import.** NextAuth is removed; importing
  it does not work and produces phantom session shapes. Use `@/lib/auth`
  (server) or `@/lib/auth-client` (client).
- **`getServerSession`, `NextAuthOptions`, `authOptions`,
  `useSession` from `next-auth/react`, `signIn` from `next-auth/react`.**
  All NextAuth v4/v5 surface. Banned.
- **`SessionProvider`.** Better Auth's `useSession` is self-contained.
- **`auth()` as a function call.** That was NextAuth's session reader.
  Better Auth uses `await auth.api.getSession({ headers: await headers() })`
  on the server, `useSession()` on the client.
- **Promoting `isAdmin` to a DB column** without justification. The
  env-whitelist (`ADMIN_EMAILS`) is the source of truth and changes via
  env, not a deploy. Promotion to a column means admin tooling, audit
  logging, and a migration story.
- **Adding a new provider without env vars + callback URL** registered
  in the provider's developer console.
- **Dropping the server-side `session.user.isAdmin` check** on admin
  actions because "the client already hides the button." Clients are
  adversarial.
- **Hand-editing a shipped Drizzle migration.** Add a new migration
  instead.
- **Calling `redis.X(...)` for auth state.** Auth tables live in
  libSQL/Turso, not Redis.
- **Mixing Drizzle adapter providers** (e.g., switching to `"pg"` for
  one query). The whole auth stack is libSQL.

---

## Known tech debt

| #   | Issue                                                                                                                                                                                                                                   | Severity |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `verifyAdminSecret` returns success only to the client. Server actions ignore the override entirely (they only check `session.user.isAdmin`). The override is cosmetic on the server side — fine if intentional; misleading if not.     | Low      |
| 2   | No middleware-level auth gate. Every protected action self-checks. Adding more admin actions = more chances to forget. A `requireAdmin()` helper would centralize this.                                                                 | Low      |
| 3   | `cookieCache: { maxAge: 60 }` means admin permission changes (added/removed from `ADMIN_EMAILS`) take up to 60s to propagate. Acceptable for personal scale; raise the cache for hotter reads or lower it for tighter admin governance. | Low      |
| 4   | No `.env.example` checked into the repo — env vars are discoverable only from `.do/app.yaml` and this file.                                                                                                                             | Low      |
| 5   | Migrations are applied manually before deploy. A `pnpm migrate:prod` script or a DO build-step hook would automate this.                                                                                                                | Med      |

---

## See also

- SKILL.md "Subsystems → Guestbook + auth"
- SKILL.md "Critical rules → Auth is Better Auth + Drizzle + Turso"
- AGENTS.md "Critical rules → Auth is Better Auth + Drizzle + Turso"
- [`coding-patterns.md`](./coding-patterns.md) — server-action shape the
  admin actions follow
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — the
  `checkRateLimit` pattern used by `verifyAdminSecret`
- [`redis-schema.md`](./redis-schema.md) — what stays in Redis (auth
  tables don't)
- [`deployment.md`](./deployment.md) — env-var matrix + Turso setup
- [Better Auth docs](https://better-auth.com/docs) — the canonical source
- Source: [`src/lib/auth.ts`](../src/lib/auth.ts),
  [`src/lib/auth-client.ts`](../src/lib/auth-client.ts),
  [`src/db/index.ts`](../src/db/index.ts),
  [`src/db/schema.ts`](../src/db/schema.ts),
  [`src/app/api/auth/[...all]/route.ts`](../src/app/api/auth/[...all]/route.ts),
  [`src/app/actions/auth-actions.ts`](../src/app/actions/auth-actions.ts),
  [`src/providers/admin-provider.tsx`](../src/providers/admin-provider.tsx),
  [`src/app/auth/popup/page.tsx`](../src/app/auth/popup/page.tsx),
  [`drizzle.config.ts`](../drizzle.config.ts)
