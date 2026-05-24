# AGENTS.md

Guidance for AI coding agents working in the **T7SEN portfolio** — a gamified,
cyberpunk-themed personal site that behaves like an interactive product.

## Stack

Next.js 16 (App Router, `cacheComponents` on) · React 19 · TypeScript 5 (strict)
· Tailwind CSS v4 (CSS-configured, no JS config) · shadcn/ui · **Better Auth +
Drizzle + Turso (libSQL)** · Upstash Redis · Vercel AI SDK + Groq · Sentry ·
Liveblocks · GSAP. Path alias is `@/*`.

## Setup and commands

```
pnpm install
pnpm dev             # dev server
pnpm build           # production build
pnpm lint            # ESLint — must pass
pnpm type-check      # tsc --noEmit — must pass
pnpm test:run        # Vitest (single run)
pnpm test:e2e        # Playwright e2e
```

Package manager is **pnpm 11** (pinned in `package.json::packageManager`).
The Husky `pre-commit` hook runs `pnpm exec lint-staged` (ESLint `--fix`,
Prettier, `vitest related`); `pre-push` runs `pnpm type-check`. Keep
changes lint- and type-clean or commits are blocked.

## Project layout

- `src/app/<route>/page.tsx` — thin route files: metadata + a `Suspense`
  boundary only. Real logic lives in `src/components/pages/<route>-client.tsx`.
- `src/app/actions/` — server actions (`"use server"`).
- `src/app/api/` — chat, OG image, and auth route handlers.
- `src/components/` — `ui/` (primitives), `skeletons/` (Suspense fallbacks),
  and feature folders.
- `src/lib/` — `redis`, `rate-limit`, `logger`, `validators`, `utils`.
- `src/lib/auth.ts` — Better Auth factory + admin RBAC via the `customSession` plugin.
- `src/lib/auth-client.ts` — Better Auth React client (`useSession`, `signIn`, `signOut`).
- `src/db/` — Drizzle libSQL client (`index.ts`), Better Auth's 4-table schema (`schema.ts`), and checked-in migrations.

## Conventions

- New dynamic page: static shell + `<Suspense>` + a matching skeleton in
  `src/components/skeletons/` + a `metadata` export with an OG image.
- Keep `"use client"` components leaf-ward so server rendering and caching stay
  effective.
- Cached server actions use `"use cache"` with `cacheLife` / `cacheTag`; writes
  invalidate with `revalidateTag`. Wire tags correctly — stale data fails
  silently.
- Rate-limit every user-facing write via `checkRateLimit` from
  `@/lib/rate-limit`. Log with `@/lib/logger`; report errors with
  `Sentry.captureException`.
- Tailwind utilities only; theme tokens are CSS variables in
  `src/app/globals.css`. Do not add a `tailwind.config.js`.
- UI copy uses terminal / netrunner language ("ACCESS_DENIED", "NET_TRACE") —
  match that tone.

## Critical rules

- **CSP is strict.** Any new external domain (script, image, font, fetch, or
  WebSocket) must be added to the `Content-Security-Policy` in `next.config.ts`,
  and new image hosts also to `images.remotePatterns`. Browsers block omissions
  with only a console error.
- **The AI chat uses `useChat` ↔ `toUIMessageStreamResponse()`.** Server in
  `src/app/api/chat/route.ts`; client in `src/components/cyber-chat.tsx`. The
  pairing is load-bearing — don't switch the server to `toTextStreamResponse()`
  (or any other transport) without also moving the client off `useChat`.
  `useChat` needs a stable `id` because `<CyberChat />` is in the root layout
  and prerenders into `/_not-found`; `Math.random()` there trips `cacheComponents`.
- **Realtime degrades gracefully.** The Liveblocks guards in `RealtimeProvider`
  and `ActiveVisitors` must stay — removing them crashes pages when the key is
  unset.
- **Auth is Better Auth + Drizzle + Turso.** `src/lib/auth.ts` is the
  factory; `src/lib/auth-client.ts` is the React client; sessions live in
  Turso (libSQL) via Drizzle. **There is no NextAuth.** Verify auth
  changes against [better-auth.com/docs](https://better-auth.com/docs),
  not NextAuth / Auth.js memory. Server reads: `await auth.api.getSession({
headers: await headers() })`. Client reads: `useSession()` from
  `@/lib/auth-client`.
- Never commit secrets. Required env vars include `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
  `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (and Discord / Google
  equivalents), `ADMIN_EMAILS`, `UPSTASH_REDIS_*`, `GROQ_API_KEY`,
  `RESEND_API_KEY`, `GITHUB_TOKEN`, and `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`.

## Testing

Vitest for unit logic (e.g. `src/lib/rate-limit.test.ts`); Playwright for e2e
flows in `e2e/`, including `axe` accessibility checks on the main pages. E2E
relies on `SKIP_RATE_LIMIT` and a dedicated spam IP (`6.6.6.6`) — do not
repurpose either. Add or update tests whenever behavior changes.

## Three-gate rule (code touches)

After finishing any task that modifies code (anything that affects
`pnpm build`, `pnpm type-check`, or `pnpm lint`), run all three gates
before reporting the task as done:

```
pnpm build
pnpm type-check
pnpm lint
```

Skip the gates only for documentation-only changes (`.md` files,
`references/` content, README, CHANGELOG). Husky's `pre-commit` runs
`pnpm exec lint-staged` (ESLint --fix, Prettier, `vitest related`) and
`pre-push` runs `pnpm type-check`; neither runs `pnpm build` — the gates
fill the gap in a `cacheComponents: true` codebase where a single bad
import can break route serialization without showing up in a per-file
lint.

## Deep references

The `references/` directory holds in-depth companions to this file and
`SKILL.md`. Open the matching one before touching the relevant subsystem.

- [`chat-stream-contract.md`](references/chat-stream-contract.md) — `/api/chat` ↔ `cyber-chat.tsx` wire format
- [`auth.md`](references/auth.md) — Better Auth + Drizzle + Turso wiring + admin RBAC via `customSession`
- [`redis-and-rate-limiting.md`](references/redis-and-rate-limiting.md) — Upstash + `@upstash/ratelimit` + dev fallback
- [`redis-schema.md`](references/redis-schema.md) — concrete Redis keys, types, and lifecycles
- [`design-system.md`](references/design-system.md) — theme tokens, fonts, shadcn primitives, copy tone
- [`animations.md`](references/animations.md) — GSAP / `useGSAP` / reduced-motion patterns
- [`coding-patterns.md`](references/coding-patterns.md) — Shell+Suspense, caching, server actions, rate limit, Sentry, logger
- [`code-style.md`](references/code-style.md) — TS conventions, naming, imports, error handling
- [`anti-hallucination.md`](references/anti-hallucination.md) — banned libraries / patterns / APIs in this stack
- [`refusal-catalog.md`](references/refusal-catalog.md) — refusal triggers and templates
- [`deployment.md`](references/deployment.md) — DigitalOcean App Platform + `.do/app.yaml` + env vars + Sentry + Husky gates

> For deep architecture, subsystem details, and the full list of non-obvious
> failure modes, see `SKILL.md` in the repo root.
