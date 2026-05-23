---
name: t7sen-portfolio
description: >-
  Architecture, conventions, and landmines for the T7SEN cyberpunk portfolio — a
  Next.js 16 / React 19 App Router site with an AI chatbot, a Redis-backed
  guestbook and achievements system, a live-metrics dashboard, and heavy GSAP
  animation. Consult this skill whenever working in this repository: adding or
  editing pages, components, server actions, or API routes; touching auth, rate
  limiting, caching, the AI chat, the guestbook, the dashboard, Sentry, or the
  security headers; debugging build, type, or test failures; or making any
  change to the portfolio codebase. Use it even when the request looks trivial —
  this project has non-obvious caching, streaming, and security constraints that
  are easy to break silently without this context.
---

# T7SEN Portfolio

A gamified, cyberpunk-themed personal portfolio for "T7SEN" (Abdulrahman), a
cybersecurity student and frontend developer. It behaves more like an
interactive product than a static résumé: an AI terminal, a live dashboard, an
achievements system, sound design, and a hidden game. Treat changes
accordingly — a "small" UI tweak can cross caching, streaming, or CSP
boundaries.

## Stack and versions

The project runs on the bleeding edge. Do not assume v4-era APIs.

- **Next.js 16.1.1**, App Router, with `cacheComponents: true` enabled.
- **React 19.2.3**.
- **TypeScript 5**, strict.
- **Tailwind CSS v4** — configured in CSS (`src/app/globals.css`), **not** a
  `tailwind.config.js`. Do not create one.
- **shadcn/ui** (new-york style), components under `src/components/ui/`. Path
  alias is `@/*`. Icon library is `lucide-react`.
- **NextAuth v5** (`5.0.0-beta.30`) — a beta. Its API differs from v4; verify
  against v5 docs, not memory.
- **Vercel AI SDK v6** + `@ai-sdk/groq` for the chatbot.
- **Upstash Redis** + `@upstash/ratelimit` for persistence and limiting.
- **Sentry**, **Liveblocks**, **Resend**, **GSAP**, **react-hook-form** + **Zod v4**.

## Repository structure

```
src/
├── app/
│   ├── layout.tsx            Root layout; provider tree (see below)
│   ├── (route)/page.tsx      Thin route files — delegate to *-client.tsx
│   ├── actions/              Server actions ("use server")
│   ├── api/chat/route.ts     AI chat streaming endpoint
│   ├── api/og/route.tsx      Dynamic OG image generation
│   ├── api/auth/[...nextauth] NextAuth handlers
│   └── auth/                 Login popup + success pages
├── components/
│   ├── pages/*-client.tsx    Page logic (client components)
│   ├── skeletons/            Suspense fallbacks, one per dynamic page
│   ├── ui/                   shadcn + custom primitives
│   ├── guestbook/ home/ contact/ ...  Feature folders
│   └── ...
├── hooks/                    use-sfx, use-lanyard, use-achievements, etc.
├── lib/                      redis, rate-limit, logger, validators, utils
├── providers/                admin-provider, realtime-provider
├── auth.ts                   NextAuth config + RBAC session callback
└── instrumentation*.ts       Sentry init (server/edge/client)
e2e/                          Playwright specs
```

**Convention:** route files (`page.tsx`) stay thin — metadata plus a Suspense
boundary. All real work lives in `src/components/pages/<route>-client.tsx`.
Follow this split when adding pages.

## Deep references

The `references/` directory expands this file with in-depth, subsystem-by-subsystem
companions. Open the matching one before touching the relevant area.

- [`chat-stream-contract.md`](references/chat-stream-contract.md) — `/api/chat` ↔ `cyber-chat.tsx` wire format
- [`auth.md`](references/auth.md) — NextAuth v5 wiring + admin RBAC
- [`redis-and-rate-limiting.md`](references/redis-and-rate-limiting.md) — Upstash + `@upstash/ratelimit` + dev fallback
- [`redis-schema.md`](references/redis-schema.md) — concrete Redis keys, types, and lifecycles
- [`design-system.md`](references/design-system.md) — theme tokens, fonts, shadcn primitives, copy tone
- [`animations.md`](references/animations.md) — GSAP / `useGSAP` / reduced-motion patterns
- [`coding-patterns.md`](references/coding-patterns.md) — Shell+Suspense, caching, server actions, rate limit, Sentry, logger
- [`code-style.md`](references/code-style.md) — TS conventions, naming, imports, error handling
- [`anti-hallucination.md`](references/anti-hallucination.md) — banned libraries / patterns / APIs in this stack
- [`refusal-catalog.md`](references/refusal-catalog.md) — refusal triggers and templates
- [`deployment.md`](references/deployment.md) — Vercel + env vars + Sentry + Husky gates

## Core architectural patterns

### Shell + Suspense streaming

Every dynamic page renders a **static shell instantly**, then streams the
dynamic part inside `<Suspense>` with a dedicated skeleton. Pattern:

```tsx
export default function DashboardPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<DashboardSkeleton />}>
        <AsyncDashboardMetrics /> {/* async — does the data fetch */}
      </Suspense>
    </DashboardShell>
  );
}
```

When adding a dynamic page, replicate this: a `*Shell` for instant paint, an
`async` data component, and a matching skeleton in `src/components/skeletons/`.
A page with no skeleton will cause a visible blank flash — that is a regression.

### Caching and revalidation

`cacheComponents: true` is on. Server actions opt into caching with the
`"use cache"` directive plus `cacheLife()` and `cacheTag()`:

```ts
export async function fetchGuestbookEntries(offset: number) {
  "use cache";
  cacheLife("hours");
  cacheTag("guestbook-entries", "guestbook");
  // ...
}
```

Writes invalidate by tag: `revalidateTag("guestbook", { expire: 0 })`. If you
add a cached read, give it sensible tags and make sure the corresponding write
path revalidates them — otherwise users see stale data. If you add a write,
check which tags it must bust.

### Provider tree

`src/app/layout.tsx` nests providers in this order: `RealtimeProvider` →
`ThemeProvider` → `SoundProvider` → `AchievementsProvider` → `AdminProvider` →
`GlobalAppWrapper`. New global context should slot into this tree deliberately;
`GlobalAppWrapper` owns the preloader, navbar, cursor, command menu, and
loading state.

## Subsystems

**AI chat** (`src/app/api/chat/route.ts` + `src/components/cyber-chat.tsx`).
Streams from Groq `llama-3.1-8b-instant` via `streamText`. The system prompt is
built from an inline `KNOWLEDGE_BASE` object and the user's current pathname;
history is sliced to the last 6 messages. **The client parser is hand-rolled**
(see Landmines).

**Guestbook + auth** (`src/app/actions/guestbook.ts`, `src/auth.ts`).
Writes are auth-gated (GitHub / Discord / Google). The write path runs:
auth check → IP rate limit (`guestbook` type) → Zod message validation →
`bad-words` + leetspeak-evasion list → HuggingFace `toxic-bert` → Redis
`lpush`. Admin actions (delete, purge) are gated by `session.user.isAdmin`,
which is set in the `auth.ts` session callback by matching the user email
against the `ADMIN_EMAILS` whitelist.

**Dashboard** (`src/app/actions/dashboard.ts`). `fetchDashboardData()` runs five
fetchers in parallel: GitHub contributions (GraphQL), code stats, Valorant,
League of Legends, and system stats (a DigitalOcean droplet + Prometheus-style
metrics). All fetchers cache and degrade to fallback data on failure — preserve
that resilience. The client polls for fresh data.

**Achievements** (`src/app/actions/achievements.ts`, `src/hooks/use-achievements.tsx`).
Per-visitor Redis sets, keyed by a client-generated visitor ID. Unlocks are
IP rate-limited (`achievements` type). Includes secret achievements and
auto-detected `SPEED_RUNNER` / `COMPLETIONIST`.

**Contact** (`src/app/actions/send-message.ts`, `src/components/contact/contact-form.tsx`).
Multi-step form (react-hook-form + Zod). Server flow: honeypot (`_gotcha`) →
rate limit (`contact` type) → Zod validation → Redis `inbox` record → Resend
email. Drafts autosave to `localStorage` under `t7sen-contact-draft`.

**Realtime presence** (`src/providers/realtime-provider.tsx`). Liveblocks room
`portfolio-presence-v1`. **Degrades gracefully** when the API key is absent —
keep that fallback intact for any realtime code.

**Sound** (`src/components/sound-provider.tsx`, `useSfx`). Synthesizes effects
via the Web Audio API. The `AudioContext` can only initialize after a user
gesture (browser autoplay policy); init is wired to first click/keydown/touch.

**Command menu and easter eggs.** `cmdk`-based palette opens on Cmd/Ctrl+K
(`src/components/command-menu.tsx`); commands parse via `lib/command-parser`.
The Konami code opens a Snake game, dynamically imported with `ssr: false`.

**SEO.** Per-page `metadata` with OG images from `/api/og`; JSON-LD via
`JsonLd`. New pages need their own `metadata` export and an OG image URL.

## Conventions

- **Aesthetic copy.** UI text uses terminal / netrunner language ("NET_TRACE",
  "ACCESS_DENIED", "INITIATING_UPLINK"). Match this tone in new UI strings.
- **Server actions** live in `src/app/actions/` and start with `"use server"`.
- **Client components** start with `"use client"`; keep them as leaf-ward as
  possible so server components and caching stay effective.
- **Rate limiting:** import `checkRateLimit` from `@/lib/rate-limit` and pass a
  type (`core` | `guestbook` | `contact` | `achievements`). Any new user-facing
  write should be rate-limited.
- **Logging:** use the `logger` from `@/lib/logger`; report exceptions with
  `Sentry.captureException`.
- **Animation:** use GSAP via `useGSAP`. Respect `prefers-reduced-motion`;
  `GlobalAppWrapper` already neutralizes the global timeline when it is set.
- **Styling:** Tailwind utility classes only; theme tokens are CSS variables in
  `globals.css`. New shared primitives go in `src/components/ui/`.

## Environment variables

NextAuth v5 auto-reads provider credentials, and `@ai-sdk/groq` auto-reads
`GROQ_API_KEY` — there is no explicit wiring in code, so a missing variable
fails silently or at runtime.

```
# Auth (NextAuth v5 auto-detected)
AUTH_SECRET
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
AUTH_DISCORD_ID / AUTH_DISCORD_SECRET
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
ADMIN_EMAILS            Comma-separated admin whitelist
ADMIN_SECRET            Override code for verifyAdminSecret

# Data / services
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
GROQ_API_KEY
RESEND_API_KEY
HUGGING_FACE_TOKEN      Optional; toxic-bert moderation
GITHUB_TOKEN            Dashboard GraphQL stats
GITHUB_USERNAME         Defaults to "t7sen"
GITPULSE_API_KEY        Latest-commit fetch

# Public
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY   Realtime; absence disables presence
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
NEXT_PUBLIC_APP_URL

# Testing
SKIP_RATE_LIMIT=true    Bypasses limiter except for IP 6.6.6.6
```

## Commands

```
npm run dev          Dev server
npm run build        Production build
npm run lint         ESLint
npm run type-check   tsc --noEmit
npm run test         Vitest (watch)
npm run test:run     Vitest (single run)
npm run test:e2e     Playwright
npm run analyze      Bundle analyzer (ANALYZE=true build)
```

A Husky pre-commit hook runs `lint-staged`: ESLint `--fix`, Prettier, and
`vitest related --run` on staged files. Keep changes lint- and type-clean so
commits are not blocked.

## Landmines — read before editing

These are non-obvious failure modes. Several are easy to break with no error.

1. **The AI chat stream is hand-parsed.** `cyber-chat.tsx` manually reads the
   response body and looks for a `0:` line prefix. If you change the `/api/chat`
   response shape (or migrate to `useChat`), you **must** update that parser in
   the same change, or the chat silently renders nothing.

2. **CSP is strict.** `next.config.ts` defines a `Content-Security-Policy`. Any
   new external domain — for a script, image, font, or `connect`/`fetch`/WS —
   must be added there, or the browser blocks it with only a console error.
   The same file holds an `images.remotePatterns` whitelist; new image hosts
   must be added in both places.

3. **Caching is tag-driven.** A cached read with wrong or missing `cacheTag`s,
   or a write that forgets `revalidateTag`, produces stale UI with no error.
   Trace the tag relationship whenever you touch a cached action.

4. **Rate limiting falls back to in-memory in dev** (no Upstash creds). E2E
   tests rely on `SKIP_RATE_LIMIT` and a dedicated spam IP `6.6.6.6`; do not
   repurpose that IP or remove the bypass.

5. **Realtime degrades gracefully.** `RealtimeProvider` and `ActiveVisitors`
   both check for the Liveblocks key and no-op without it. Preserve that guard;
   removing it crashes pages when the key is unset.

6. **Sound needs a user gesture.** Do not expect `play()` to work before first
   interaction — the `AudioContext` initializes lazily by design.

7. **NextAuth is a beta.** Provider config in `auth.ts` is intentionally minimal
   and relies on auto-detected `AUTH_*` env vars. Verify any auth change against
   v5 documentation.

8. **Tailwind v4 has no JS config.** Theme changes go in `globals.css`. Do not
   add `tailwind.config.js`.

## Known tech debt — intentional vs. broken

Distinguish deliberate decisions from genuine bugs so you neither "fix" the
former nor ignore the latter.

- **Hand-rolled chat streaming** — works, but fragile; `@ai-sdk/react` is
  installed and unused. A migration to `useChat` is a known improvement.
- **Hardcoded values** — the contact recipient email, the Resend `from` address
  (`onboarding@resend.dev`, a sandbox sender), the Discord ID, and the Sentry
  DSN are inlined. Prefer environment variables for any new such value.
- **Sentry `tracesSampleRate: 1`** — 100% sampling; expensive in production.
- **Guestbook provider detection** by substring-matching the avatar URL — works
  but brittle.
- **HuggingFace moderation blocks the guestbook write path** and rejects on
  network error ("fail safe"). This is a deliberate strictness choice; note it
  before changing.

## Before you finish a change

- **Run the three gates** — `npm run build`, `npm run type-check`, `npm run lint`.
  Required after any code-touching task. Skip only for doc-only changes (`.md`
  files, `references/`, README, CHANGELOG). Husky's `pre-commit` runs
  `lint-staged` and `pre-push` runs `type-check`; neither runs `next build`,
  so the gates fill the gap. You can run all three in parallel.
- New dynamic page → shell + `Suspense` + skeleton + `metadata` + OG image.
- New external domain → updated CSP (and `remotePatterns` for images).
- New cached read or write → correct `cacheTag` / `revalidateTag` wiring.
- New user-facing write → rate limited and Sentry-instrumented.
- Touched `/api/chat` response shape → updated `cyber-chat.tsx` parser.
- Add or update tests where behavior changed (Vitest for logic, Playwright for
  flows); accessibility specs run `axe` against the main pages.
