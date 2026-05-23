# Auth — NextAuth v5 wiring + admin RBAC

Companion to SKILL.md "Subsystems → Guestbook + auth" and "Critical rules →
NextAuth is a beta (v5)". Documents the actual auth surface in this repo —
which is intentionally minimal — plus the admin RBAC path and the popup
sign-in flow.

The whole project sits on **`next-auth@5.0.0-beta.30`**. Verify any change
against [next-auth v5 docs](https://authjs.dev), **not** v4 memory — the
APIs diverge.

---

## The auth config

[`src/auth.ts`](../src/auth.ts) is the entire NextAuth wiring — 33 lines:

```ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";

const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [GitHub, Discord, Google],
  pages: {
    signIn: "/guestbook", // the guestbook page IS the sign-in landing
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        const userEmail = session.user.email?.toLowerCase() || "";
        const isAdmin = adminEmails.some(
          (admin) => admin.trim().toLowerCase() === userEmail,
        );
        session.user.isAdmin = isAdmin;
      }
      return session;
    },
  },
});
```

Notable choices:

- **No `authOptions` constant**, no `[...nextauth]/route.ts` exporting
  `NextAuth(authOptions)` the v4 way. The v5 destructure (`handlers, auth,
signIn, signOut`) is the only API. Route is mounted at
  [`src/app/api/auth/[...nextauth]/route.ts`](../src/app/api/auth/[...nextauth]/route.ts)
  by re-exporting `handlers`.
- **`trustHost: true`** is set because production runs behind Vercel's
  proxy — without it, NextAuth refuses to issue redirects to the host header.
- **Providers are listed with no explicit credentials.** NextAuth v5
  auto-reads `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` (and Discord / Google
  equivalents) from the environment. A missing pair disables that provider
  at request time, not boot time.
- **`pages.signIn` is `/guestbook`** — the guestbook page renders its own
  sign-in CTA when there's no session, so it doubles as the auth landing.
  There is no dedicated `/login` route.

---

## Session augmentation — `session.user.isAdmin`

[`src/types/next-auth.d.ts`](../src/types/next-auth.d.ts) extends the
`Session` interface with the RBAC flag:

```ts
declare module "next-auth" {
  interface Session {
    user: {
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}
```

The session callback in `src/auth.ts` populates `isAdmin` on every session
read by matching `session.user.email` against `ADMIN_EMAILS` (a
comma-separated whitelist in env). The match is case-insensitive and trims
whitespace.

**This is the only RBAC primitive.** There are no roles, no permissions,
no scope strings. A user is either admin or not, determined entirely by
their email vs the whitelist.

---

## Admin actions — server-side checks

Every admin action **re-checks `session.user.isAdmin` server-side**, even
though the UI gates the button. Pattern from
[`src/app/actions/guestbook.ts`](../src/app/actions/guestbook.ts):

```ts
export async function deleteGuestbookEntry(entry: GuestbookEntry) {
  const session = await auth();
  if (!session?.user?.isAdmin) return { error: "Access Denied" };
  /* ... */
}

export async function purgeGuestbook() {
  const session = await auth();
  if (!session?.user?.isAdmin) return { error: "Access Denied" };
  /* ... */
}
```

The client `useAdmin()` hook (see below) is **UX only**. The server check
is the security boundary.

---

## Admin secret override — `verifyAdminSecret`

There is a second path to admin actions that does not require a session:
the `ADMIN_SECRET` env override. Used for "I'm not signed in but I need to
moderate now" scenarios.

[`src/app/actions/auth-actions.ts`](../src/app/actions/auth-actions.ts):

```ts
export async function verifyAdminSecret(secret: string) {
  try {
    const ip = (await headers()).get("x-forwarded-for") || "unknown";
    await checkRateLimit(ip, "core"); // brute-force protection
  } catch (error) {
    return { error: "Too many attempts. Try again later." };
  }

  if (secret === process.env.ADMIN_SECRET) return { success: true };
  return { error: "Invalid override code." };
}
```

Properties:

- **Rate-limited via the `core` limiter** (20 / 60s) per IP, so brute force
  is bounded.
- Returns `{ success: true }` only — does **not** mint a session. Whatever
  calls this stores the success bit client-side. Subsequent server actions
  still check `session.user.isAdmin`, so the override is currently
  cosmetic on the server side. If a future feature wanted to honor the
  override on the server, it'd need to plumb a one-time token, not just a
  bit.
- The `ADMIN_SECRET` env is required for this path to ever return success;
  without it, every guess fails.

---

## Client-side admin awareness — `AdminProvider` + `useAdmin`

[`src/providers/admin-provider.tsx`](../src/providers/admin-provider.tsx)
wraps the tree in `SessionProvider` (the only `next-auth/react` consumer in
the project) and exposes `useAdmin()`:

```tsx
export function AdminProvider({ children }) {
  return (
    <SessionProvider>
      <AdminLogic>{children}</AdminLogic>
    </SessionProvider>
  );
}

function AdminLogic({ children }) {
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

The provider slots into the layout tree between `AchievementsProvider` and
`GlobalAppWrapper` (see [`design-system.md`](./design-system.md) for the
full tree).

Use `useAdmin()` to gate admin buttons in client components. Do **not**
trust it for security — re-check on the server (see "Admin actions"
above).

---

## Sign-in flow

| Step                                                       | Where                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| User clicks "Sign in"                                      | A button calls `login(provider)` from `src/app/actions/auth-actions.ts` |
| Server action calls `signIn(provider)`                     | NextAuth v5 `signIn` helper                                             |
| Browser redirects to provider                              | Provider OAuth dance                                                    |
| Provider redirects back to `/api/auth/callback/<provider>` | NextAuth handles via `handlers`                                         |
| Session cookie set                                         | Standard NextAuth session cookie                                        |
| Redirect to `pages.signIn` (`/guestbook`) by default       | Per `pages.signIn` config                                               |

There is also a `popup` route at
[`src/app/auth/popup/page.tsx`](../src/app/auth/popup/page.tsx) for
windowed sign-in (the navbar uses this so the user doesn't lose page
state). It is a thin page that runs the sign-in dance in a child window
and `window.close()`s itself when done.

`logout()` in `auth-actions.ts` is a one-liner around `signOut()`.

---

## Environment variables

NextAuth v5 auto-detects providers from `AUTH_*` env vars — there is no
explicit wiring in `src/auth.ts`. Missing pairs **fail at request time**,
not at boot. A missing variable does not log a warning either; the
provider just doesn't appear on the sign-in screen.

| Env                                       | Purpose                               | Required?                                                                                        |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`                             | JWT signing                           | Required — NextAuth refuses to start without it                                                  |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`   | GitHub provider                       | Required for GitHub login                                                                        |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | Discord provider                      | Required for Discord login                                                                       |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`   | Google provider                       | Required for Google login                                                                        |
| `ADMIN_EMAILS`                            | Comma-separated admin whitelist       | Required for any admin to exist; case-insensitive match                                          |
| `ADMIN_SECRET`                            | Override code for `verifyAdminSecret` | Optional — without it every guess fails                                                          |
| `NEXTAUTH_URL`                            | Canonical site URL                    | NextAuth v5 only needs this when `trustHost` is false; we set `trustHost: true` so it's optional |

---

## Refusal triggers

Push back — with rationale — on:

- **Any v4 API surface:** `getServerSession`, `authOptions`,
  `NextAuthOptions`, `useSession({ required: true })`, `getSession` from
  `next-auth/react` on the server, a `[...nextauth].ts` route file. v5 is
  the only shape here.
- **`pages/` directory routes** — App Router only.
- **`session.user.role`** or any role-based RBAC — there are no roles in
  this codebase; only `isAdmin`. Adding roles requires a session-callback
  change and a new field in `next-auth.d.ts`.
- **Dropping the server-side `session.user.isAdmin` check** on admin
  actions because "the client already hides the button." Clients are
  adversarial.
- **Trusting `verifyAdminSecret`'s success bit on the server** — today it
  returns success only to the client. Server actions still check
  `session.user.isAdmin`.
- **Removing rate-limit on `verifyAdminSecret`** — it's the only brute-force
  protection on the override code.
- **Hardcoding admin emails in source** — they belong in `ADMIN_EMAILS`.

---

## Known tech debt

| #   | Issue                                                                                                                                                                                                                                                | Severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `verifyAdminSecret` returns success only to the client. Server actions ignore the override entirely (they only check `session.user.isAdmin`). The override is currently cosmetic on the server side — fine if that's intentional; misleading if not. | Low      |
| 2   | `auth-actions.ts` has `eslint-disable-next-line @typescript-eslint/no-unused-vars` on the catch binding. Rename to `_error` to drop the disable.                                                                                                     | Low      |
| 3   | No middleware-level auth gate. Every protected action self-checks. Adding more admin actions = more chances to forget. A `requireAdmin()` helper would centralize this.                                                                              | Low      |

---

## See also

- SKILL.md "Subsystems → Guestbook + auth"
- SKILL.md "Critical rules → NextAuth is a beta (v5)"
- AGENTS.md "Critical rules → NextAuth is a beta (v5)"
- [`coding-patterns.md`](./coding-patterns.md) — server-action shape that
  the admin actions follow
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — for the
  `checkRateLimit` pattern used by `verifyAdminSecret`
- Source: [`src/auth.ts`](../src/auth.ts),
  [`src/types/next-auth.d.ts`](../src/types/next-auth.d.ts),
  [`src/providers/admin-provider.tsx`](../src/providers/admin-provider.tsx),
  [`src/app/actions/auth-actions.ts`](../src/app/actions/auth-actions.ts),
  [`src/app/auth/popup/page.tsx`](../src/app/auth/popup/page.tsx)
