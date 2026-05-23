# Anti-Hallucination Inventory

Companion to SKILL.md "Landmines" and "Known tech debt". The SKILL.md
lists are the quick reference; this file explains **why** each
substitution holds. Most of this stack post-dates training-data
cutoffs or contradicts older Next.js / NextAuth / AI SDK conventions —
if autocomplete suggests the left column, stop and re-read the right.

---

## Next.js patterns

### ❌ `pages/` directory, `getServerSideProps`, `getStaticProps`, `getInitialProps`

App Router only. Server Components are the default. Route files live
in `src/app/<route>/page.tsx` and are **thin** — metadata + Suspense
only — with logic delegated to
`src/components/pages/<route>-client.tsx`.

**Use:**

- Routes in `src/app/`
- Data fetching in async server components (or via `"use cache"`
  server actions)
- Mutations via server actions (`'use server'`)
- Route handlers in `src/app/api/.../route.ts`

### ❌ Class components, `componentDidMount`, `setState({...})`

Functional components + hooks only.

### ❌ Synchronous `cookies()` / `headers()` in Next.js 16

Next 16 made these async. Sync access throws.

**Use:**

```ts
import { cookies, headers } from "next/headers";
const cookieStore = await cookies();
const headerList = await headers();
```

Every existing usage in this codebase awaits — match that.

### ❌ `next/legacy/image`

Use `next/image` from `next`. The legacy module is for migration only;
this project has never had a legacy image.

### ❌ `getStaticParams`-only ISR for the dashboard

The dashboard data is real-time-ish (every-minute / every-hour
`cacheLife`). ISR with revalidate is the wrong model here. Use the
`"use cache"` + `cacheLife` + `cacheTag` pattern documented in
[`coding-patterns.md`](./coding-patterns.md).

### ❌ Cached read without `cacheTag`

A `"use cache"` directive with no tag is invisible to `revalidateTag`,
so the only way to invalidate is `cacheLife` expiry. Every cached
function in this codebase has at least one tag.

### ❌ Write that mutates a key with a cached reader, without `revalidateTag`

Produces stale UI with no error. Trace tags whenever you touch a
cached action — see [`redis-schema.md`](./redis-schema.md) "Cache tag
mapping" for the full inventory.

---

## Tailwind

### ❌ `tailwind.config.js`, `tailwind.config.ts`

Tailwind v4 is CSS-first. Config lives in
[`src/app/globals.css`](../src/app/globals.css) via the `@theme inline`
directive.

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... */
}
```

### ❌ Tailwind v3 `@tailwind base; @tailwind components; @tailwind utilities;` directives

v3 syntax. v4 uses one `@import "tailwindcss";`.

### ❌ Hardcoded hex / rgb / hsl in components

Use semantic tokens (`bg-card`, `text-foreground`, `border-border`).
The palette is oklch-defined in `globals.css`; bypassing the tokens
breaks the future light-mode pass.

---

## Auth

### ❌ `next-auth` v4 surface — `[...nextauth].ts` route, `getServerSession`, `authOptions`, `NextAuthOptions`, `useSession({ required: true })`, `@auth/drizzle-adapter`

This project is on **`next-auth@5.0.0-beta.30`**. The v5 destructure
`(handlers, auth, signIn, signOut)` from
[`src/auth.ts`](../src/auth.ts) is the API. Verify any auth change
against [authjs.dev v5 docs](https://authjs.dev) — column names,
session model, route handler, and adapter contract differ from v4.

**Use** the patterns in [`auth.md`](./auth.md):

- `import { auth } from '@/auth'` for server-side session reads
- `signIn(provider)` / `signOut()` from `@/auth` (or `@/app/actions/auth-actions`)
- `useSession` from `next-auth/react` only inside `AdminProvider`
  (which mounts `SessionProvider`)

### ❌ Adding a fourth provider without env

NextAuth v5 auto-reads `AUTH_<PROVIDER>_ID` / `AUTH_<PROVIDER>_SECRET`.
Adding a new provider means adding both env vars AND extending
`src/auth.ts` with the `<Provider>` import.

### ❌ Hardcoding admin emails in source

Admin whitelist is `ADMIN_EMAILS` (comma-separated env). Hardcoded
emails defeat operational changes.

---

## AI SDK / streaming

### ❌ `OpenAIStream`, `StreamingTextResponse` (old Vercel AI SDK v3 / v2 surface)

The project is on `ai@^6.0.145`. Use `streamText` + `.toTextStreamResponse()`
as in [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts).

### ❌ Changing the `/api/chat` response shape without updating the parser

The hand-parsed `0:` prefix in
[`src/components/cyber-chat.tsx`](../src/components/cyber-chat.tsx) is
load-bearing. See [`chat-stream-contract.md`](./chat-stream-contract.md)
for the full contract.

### ❌ Importing `useChat` from `@ai-sdk/react` without verifying the wire format

`@ai-sdk/react` is installed but unused. A migration to `useChat` is
the canonical fix for the hand-parser, but it must be done as a single
coordinated change — see `chat-stream-contract.md` "Migration path".

---

## Crypto / randomness

### ❌ `node:crypto`, `crypto` module from Node

Workers / edge runtime constraints. Even on the Node runtime in this
project, prefer Web Crypto for consistency.

**Use:** `crypto.randomUUID()`, `crypto.getRandomValues()`.

### ❌ `Math.random()` for any security-affecting decision

Not crypto-secure. The project uses it today only for cosmetic effects
(particle positions, scanline jitter) — that's fine. Don't use it for
visitor IDs, achievement ordering, or anything that affects state.

---

## State stores

### ❌ Adding a SQL/Postgres/Drizzle/Prisma dependency

The project is Redis-only by design. SKILL.md "Stack and versions"
doesn't mention SQL because there isn't any. The `KNOWLEDGE_BASE` in
`/api/chat` _claims_ PostgreSQL / Supabase / Prisma — that's a stale
fact in the chat's static dataset, not a real dependency. See
[`chat-stream-contract.md`](./chat-stream-contract.md) Known tech debt
#2.

**Use:** Redis (with `cacheTag` / `revalidateTag`) for shared state.
React state for ephemeral UI. `localStorage` for client-only durable
state.

### ❌ Redux, Zustand, Jotai, Recoil for shared state

The project has no global client store. Context providers
(`AdminProvider`, `SoundProvider`, `RealtimeProvider`,
`AchievementsProvider`) cover what cross-tree state exists. If you
think you need Redux, you probably need a `revalidateTag` instead.

### ❌ `localStorage` for anything that could leak

Chat history goes in `localStorage` (`t7sen_chat_history`) — that's
the user's own data, fine. Don't put session tokens, admin secrets, or
PII there.

---

## Animation

### ❌ `motion`, `motion/react`, `framer-motion`

Not in this stack. Two reasons:

- **License:** Framer Motion has a commercial-use restriction we don't
  want to track.
- **Power:** GSAP's `Flip` plugin handles cross-component morphs
  Framer Motion doesn't.

**Use:** `gsap` + `@gsap/react`'s `useGSAP`. GSAP became 100% free
under Webflow's stewardship in April 2025; all formerly-paid Club
plugins are unrestricted.

### ❌ Raw `useEffect(() => { gsap.to(...) }, [])`

Use `useGSAP({ scope: ref, dependencies: [...] })`. The raw pattern
leaks tweens on unmount and breaks Strict Mode's double-mount.

### ❌ Animating `filter: blur()`

Catastrophic repaint cost on mobile WebViews. Use stacked radial
gradients for glow.

---

## Logging

### ❌ Raw `console.log` / `console.warn` / `console.error` at call sites

Use `@/lib/logger`. The sole sanctioned `console.*` callers are
`src/lib/logger.ts` itself and the runtime error boundaries. New code
that wants to log goes through the logger.

Note: server-side errors from the logger reach Vercel function logs,
not Sentry Issues. For an Issue, call `Sentry.captureException(error)`
explicitly. See [`coding-patterns.md`](./coding-patterns.md) "Logger"
and "Sentry capture" patterns.

### ❌ `pino`, `winston`, `bunyan`

Edge-runtime hostile / bundle-bloat / overkill for a personal site.
`@/lib/logger` is fine.

---

## Validation

### ❌ Skipping Zod at the server-action boundary

Every user-facing server action with form input runs Zod over
`formData`. `signGuestbook` validates `message` against
`messageSchema`; `sendMessage` validates `name` / `email` / `message`
against `contactSchema`. **Exception:** `/api/chat` does **not**
validate — that's flagged tech debt in
[`chat-stream-contract.md`](./chat-stream-contract.md).

### ❌ Zod v3 APIs renamed in v4

The project is on `zod@^4.3.6`. v3-only APIs (`z.string().nonempty()`,
`z.preprocess` signature changes, `z.discriminatedUnion` API
adjustments) won't work. Cross-check against v4 docs when reaching for
anything but the simplest Zod surface.

---

## Package manager

### ❌ `pnpm`, `yarn`, `pnpm-lock.yaml`, `yarn.lock`

Project uses **npm**. The lock file is `package-lock.json`. Husky's
`pre-commit` runs `npx lint-staged`. CI uses `npm ci`.

---

## Realtime

### ❌ Removing the Liveblocks key guards in `RealtimeProvider` / `ActiveVisitors`

Both check for `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` and no-op without
it. Removing the guard crashes pages during local dev when the key
isn't set. See [`auth.md`](./auth.md) and `RealtimeProvider`
source.

### ❌ Using `useOthers` outside `RoomProvider`

Crashes immediately. `ActiveVisitors` has the safety guard
(`ActiveVisitorsContent` is only mounted when realtime is enabled).
Match that pattern in any new realtime consumer.

---

## Sound

### ❌ Calling `useSfx().play()` before first user gesture

`AudioContext` initializes lazily (browser autoplay policy). The
`<SoundPrompter />` watches for the first click/keydown/touch and
unlocks the context. Calls before that no-op silently — your event
handler isn't broken; it's the policy.

### ❌ Loading audio files

Sounds are synthesized in JS via the Web Audio API in
`src/components/sound-provider.tsx`. There are no audio assets.

---

## CSP / external domains

### ❌ Fetching from / loading scripts/images/fonts from a host not in `next.config.ts` CSP

CSP is strict. Any new external domain (script, image, font,
fetch, WebSocket) must be added to the `Content-Security-Policy`
header in [`next.config.ts`](../next.config.ts), and new image hosts
also to `images.remotePatterns`. Browsers block omissions with only a
console error.

Allowlisted hosts as of this writing: see SKILL.md "Landmines #2" or
read `next.config.ts:67` directly.

---

## Sentry

### ❌ `console.log` in `production` expecting it to land in Sentry server-side

`instrumentation-client.ts` has
`Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })`
— that wires browser console output to Sentry. The server / edge
configs **do not** have this integration. Server `console.error` lands
in Vercel function logs only. For Sentry Issues server-side, call
`Sentry.captureException` explicitly.

### ❌ Removing `instrumentation.ts`

It's how Sentry boots on the server / edge runtimes. Removing it
silently disables Sentry server-side; client side still works because
`instrumentation-client.ts` is loaded by Next 16 automatically.

---

## Misc

### ❌ Removing `eslint-disable @typescript-eslint/no-unused-vars` without fixing the unused vars

Several files (`chat`/route.ts`, `cyber-chat.tsx`, `guestbook.ts`,
`dashboard.ts`, `github.ts`, `next-auth.d.ts`) have top-level
`eslint-disable`that masks real unused vars. Removing the disable
without renaming to`\_<name>` or removing the symbol re-introduces a
lint failure. Each disable is documented in the relevant reference doc
(see Known tech debt sections).

### ❌ Adding documentation files (`*.md`, README) without explicit ask

Per the project's CLAUDE Code conventions, don't create docs unless
the user asks. The exception is `references/` content — the user
asked.

---

## Quick-reference checklist before adding a dependency

Before `npm install <thing>`, ask:

1. **Does it work in Next 16 / React 19?** Some libraries haven't
   updated for the async cookies/headers change or the new compiler.
2. **Does it work in both Node and Edge runtimes?** Routes in
   `app/api/...` may opt into edge; libraries with `node:` imports
   break there.
3. **Does it violate one of the substitutions above?** Framer Motion,
   Prisma, getServerSession, etc.
4. **Does it pull in heavy peers?** `react-three-fiber` etc. that
   could double the bundle.
5. **Is there an existing alternative already in the stack?** GSAP for
   motion, Redis for state, NextAuth for auth, Zod for validation,
   Sentry for observability.

The stack lock is removed — versions can move — but the substitution
discipline above is permanent.

---

## See also

- SKILL.md "Landmines" (all 8 items)
- SKILL.md "Known tech debt"
- AGENTS.md "Critical rules"
- [`refusal-catalog.md`](./refusal-catalog.md) — user-facing rationale
  - refusal templates for each item above
- [`coding-patterns.md`](./coding-patterns.md) — the patterns that
  replace the banned approaches
