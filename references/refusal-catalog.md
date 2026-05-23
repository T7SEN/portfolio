# Refusal Catalog

Companion to [`anti-hallucination.md`](./anti-hallucination.md) (the
_why_) and SKILL.md "Landmines" / "Critical rules" (the _what_). This
file gives **trigger phrasings**, the **rationale**, the **alternative**
where one exists, and a **refusal template** you can paste back to the
user.

Refusals here are **direct** — no apology, no hedge. The user has
explicitly asked for push-back; respect that by doing it cleanly.

---

## Format

Each entry:

> **Trigger phrasings** → **Why refuse** → **Alternative** → **Refusal
> template**

---

## Build / config

### Add `tailwind.config.js`

**Trigger:**

- "Let's add a `tailwind.config.ts` so we can extend the theme."
- "I need to add a Tailwind plugin — let me create the config file."

**Why refuse:** Tailwind v4 is CSS-first. The JS config doesn't load
in v4 — adding it has no effect and confuses future readers. Theme
extensions go in [`src/app/globals.css`](../src/app/globals.css) via
the `@theme inline` directive.

**Alternative:** Edit `globals.css`. Add a new token under `@theme
inline`, a new utility under `@layer utilities`.

**Refusal template:** "Refused — Tailwind v4 is CSS-first; a JS config
file has no effect. Theme tokens go in `src/app/globals.css` under
`@theme inline`. See `references/design-system.md`."

---

### Bump a locked dependency

**Trigger:**

- "Can you bump Next to the latest?"
- "Let's update React to 19.3 — there's a new feature I want."

**Why refuse:** Was a refusal in the original session brief. **The
user removed the lock on 2026-05-22** — versions can move. Still:
flag the breaking-change risk and any paid-tier upgrade implications.

**Refusal template:** N/A — the stack lock is removed. Propose the
bump normally, list breaking-change risk, get user approval, then run
the three gates.

---

## Auth

### Use `getServerSession` / `authOptions`

**Trigger:**

- "Just import `getServerSession` to read the session."
- "Let me write the `[...nextauth].ts` config."
- "Add `@auth/drizzle-adapter`."

**Why refuse:** Project is on `next-auth@5.0.0-beta.30`. The v4 APIs
(`getServerSession`, `NextAuthOptions`, `authOptions`,
`@auth/<adapter>` packages) don't exist in v5. Mixing v4 patterns into
the v5 surface breaks the session route, the cookie flow, and the
RBAC callback.

**Alternative:** `import { auth } from '@/auth'` on the server.
`useSession` from `next-auth/react` inside `AdminProvider` on the
client. See [`auth.md`](./auth.md).

**Refusal template:** "Refused — project is on NextAuth v5 beta, not
v4. `getServerSession` / `authOptions` don't exist in v5. Use `auth()`
from `@/auth` per `references/auth.md`."

---

### Skip the server-side `session.user.isAdmin` check

**Trigger:**

- "The client hides the button anyway, the server check is redundant."
- "Let's trust `useAdmin()` and skip the action's auth check."

**Why refuse:** Clients are adversarial. A user can call the action
directly (curl, devtools), bypass the button, and exercise the
admin-only mutation. The server check is the security boundary; the
client check is UX.

**Alternative:** Keep both. `useAdmin()` for the button visibility;
`if (!session?.user?.isAdmin)` in the action.

**Refusal template:** "Refused — server enforces every rule per
AGENTS.md. Client-side `useAdmin()` is UX only. Re-check
`session.user.isAdmin` in every admin action per
`references/auth.md`."

---

### Hardcode admin emails in source

**Trigger:**

- "Let's just hardcode my email instead of using `ADMIN_EMAILS`."
- "The list never changes."

**Why refuse:** Operationally fragile. Adding / removing an admin
requires a code change + deploy. Env var change is a Vercel dashboard
click + restart.

**Refusal template:** "Refused — admin list is `ADMIN_EMAILS` env per
`references/auth.md`. Hardcoding requires deploys for every change."

---

## Chat / AI SDK

### Change `/api/chat` response shape without touching the parser

**Trigger:**

- "Let me try a different model adapter — switching the SDK."
- "Let's emit plain text instead of the AI SDK format."

**Why refuse:** The client parser in
[`cyber-chat.tsx`](../src/components/cyber-chat.tsx) hand-reads the
`0:` line prefix from the AI SDK v6 Data Stream Protocol. Change the
server output and the client renders empty messages silently — no
error, just blank.

**Alternative:** Change both in the same commit. Or do the planned
migration to `@ai-sdk/react`'s `useChat` per
[`chat-stream-contract.md`](./chat-stream-contract.md) "Migration
path."

**Refusal template:** "Refused — `/api/chat` and `cyber-chat.tsx` are
coupled by the `0:` line prefix in the AI SDK v6 stream protocol.
Changing one side without the other renders empty messages with no
error. Either update both in the same commit, or do the `useChat`
migration per `references/chat-stream-contract.md`."

---

### Use `OpenAIStream` / `StreamingTextResponse`

**Trigger:**

- "Wrap the response in `StreamingTextResponse`."
- "Use `OpenAIStream(response)` to handle the chunks."

**Why refuse:** These are AI SDK v2 / v3 APIs. The project is on
`ai@^6.0.145`. They don't exist in v6.

**Alternative:** `streamText({...}).toTextStreamResponse()` per
[`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts).

**Refusal template:** "Refused — `OpenAIStream` / `StreamingTextResponse`
are AI SDK v2/v3. Project is on v6. Use
`streamText().toTextStreamResponse()` per
`references/chat-stream-contract.md`."

---

## Caching

### Add a cached read with no `cacheTag`

**Trigger:**

- "Add `'use cache'` — we don't need to invalidate, it'll expire."

**Why refuse:** A read tagged only with `cacheLife` can't be busted
on demand. Any write to the underlying data leaves the UI stale until
the lifetime expires — could be hours.

**Alternative:** Add at least one tag. See
[`redis-schema.md`](./redis-schema.md) "Cache tag mapping" for
conventions (subsystem tag + sub-tag).

**Refusal template:** "Refused — cached reads need at least one
`cacheTag`. Otherwise writes can't invalidate. See
`references/coding-patterns.md` #2 and `references/redis-schema.md`."

---

### Write that mutates a key with a cached reader, without `revalidateTag`

**Trigger:**

- "Just push to Redis and return; the cache will catch up."

**Why refuse:** Stale UI with no error. `cacheLife` is the only
expiry; on `hours` it's hours.

**Alternative:** Call `revalidateTag('<tag>', { expire: 0 })` after
the write. See `signGuestbook` for the pattern.

**Refusal template:** "Refused — writes to keys with cached readers
must call `revalidateTag(..., { expire: 0 })` per
`references/coding-patterns.md` #3."

---

## Rate limits / writes

### Add a user-facing write without `checkRateLimit`

**Trigger:**

- "Let's add a new server action that records a click."
- "The chat doesn't have a limit, why does this one need one?"

**Why refuse:** AGENTS.md "Critical rules" — every user-facing write
gets rate-limited. The chat is an exception that's already flagged as
tech debt; don't add a second.

**Alternative:** Add `await checkRateLimit(ip, '<type>')` at the top
of the action. Use an existing type if it fits; otherwise add a new
one per [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md).

**Refusal template:** "Refused — user-facing writes must rate-limit
per AGENTS.md. Use `checkRateLimit` with one of the existing types
(or add a new one) per `references/redis-and-rate-limiting.md`."

---

### Repurpose IP `6.6.6.6` or remove `SKIP_RATE_LIMIT`

**Trigger:**

- "Why is `6.6.6.6` carved out? Let me clean that up."
- "Let's remove `SKIP_RATE_LIMIT` — looks unused."

**Why refuse:** E2E tests depend on both. `SKIP_RATE_LIMIT=true`
disables the limiter; `6.6.6.6` is the carved-out IP that still
exercises the rejection path. Touching either breaks the test suite.

**Refusal template:** "Refused — `SKIP_RATE_LIMIT` and `6.6.6.6` are
load-bearing for E2E. See `references/redis-and-rate-limiting.md`."

---

## CSP / external domains

### Add a new external domain without updating CSP

**Trigger:**

- "Let me fetch from `https://example.api/...`"
- "Add a new image source from `cdn.example.com`."

**Why refuse:** The CSP in `next.config.ts` is strict. Unlisted
domains are blocked with only a console error — the network tab shows
the request never went out.

**Alternative:** Add the domain to the relevant directive
(`script-src`, `img-src`, `connect-src`, `font-src`, `frame-src` —
match the type), and for image hosts also add to
`images.remotePatterns`. See `next.config.ts` for current allowlist
and [`design-system.md`](./design-system.md) for context.

**Refusal template:** "Refused — CSP is strict. Add the domain to the
matching directive in `next.config.ts` (and `images.remotePatterns`
for images) in the same change."

---

## Realtime

### Remove the Liveblocks key guards

**Trigger:**

- "Liveblocks is always enabled, simplify the provider."
- "Drop the `if (!API_KEY)` check."

**Why refuse:** Crashes pages during local dev / when env var isn't
set. The guard is the no-op fallback.

**Alternative:** Keep the guard. If you need Liveblocks for a feature
that must always be on, fail loudly at boot rather than silently in
the consumer.

**Refusal template:** "Refused — Liveblocks key guard is the
graceful-degrade fallback per SKILL.md 'Landmines #5'. Removing it
crashes local dev when `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` is unset."

---

## Animation

### Use Framer Motion

**Trigger:**

- "Let me use Framer Motion for this one component."
- "`motion` is simpler than GSAP here."

**Why refuse:** Not in the stack. Licensing + GSAP's `Flip` plugin
covers the morphs Framer Motion can't.

**Alternative:** GSAP via `useGSAP`. See
[`animations.md`](./animations.md).

**Refusal template:** "Refused — Framer Motion / `motion` not in
stack. Use GSAP via `@gsap/react`'s `useGSAP` per
`references/animations.md`."

---

### Raw `useEffect(() => { gsap.to(...) }, [])`

**Trigger:**

- "Why is `useGSAP` necessary? `useEffect` is simpler."

**Why refuse:** Leaks tweens on unmount, breaks Strict Mode's
double-mount, doesn't scope selectors.

**Alternative:** `useGSAP({ scope: ref, dependencies: [...] })`.

**Refusal template:** "Refused — raw `useEffect` + `gsap` leaks
tweens on unmount and breaks Strict Mode. Use `useGSAP` per
`references/animations.md`."

---

## Logging / observability

### Use raw `console.log` / `console.error` at call sites

**Trigger:**

- "Let me `console.log` here to debug."
- "`console.error(error)` is fine, why use the logger?"

**Why refuse:** AGENTS.md "Critical rules" — logging via
`@/lib/logger`. Raw console calls bypass the project's structured
JSON output and don't get the test-quieting (`NODE_ENV !== 'test'`)
behavior.

**Alternative:** `import logger from '@/lib/logger'` and call
`logger.info({...}, 'msg')`. See [`coding-patterns.md`](./coding-patterns.md)
#6.

**Refusal template:** "Refused — logging via `@/lib/logger`, not raw
`console.*`. See `references/coding-patterns.md` #6."

---

### Move the Sentry DSN to env

**Trigger:**

- "Sentry DSN should be `process.env.SENTRY_DSN`, not hardcoded."

**Why refuse:** Don't refuse — **accept**. SKILL.md "Known tech debt"
flags this. Mention that it's tracked as existing debt and confirm
the move is the right fix.

**Counter-template:** "Agreed — Sentry DSN is currently hardcoded in
all three configs and that's tracked tech debt in SKILL.md. Moving to
`NEXT_PUBLIC_SENTRY_DSN` is the right fix. Plan: add the env var to
Vercel, replace the hardcoded value in `sentry.server.config.ts`,
`sentry.edge.config.ts`, and `instrumentation-client.ts`, run the
three gates."

---

## Validation

### Skip Zod on a server action

**Trigger:**

- "It's just a simple input, skip the schema."
- "The form already validates client-side."

**Why refuse:** Clients are adversarial. The server must validate
shape independently. Skipping Zod lets malformed input crash
downstream code or persist garbage in Redis.

**Alternative:** Define a Zod schema (in `src/lib/validators.ts` or
inline), `safeParse(rawData)`, return structured errors on failure.
See [`coding-patterns.md`](./coding-patterns.md) #9.

**Refusal template:** "Refused — Zod validation at server-action
boundary per AGENTS.md. Client validation is UX only. See
`references/coding-patterns.md` #9."

---

## Process / scope

### Commit secrets

**Trigger:**

- "Let me add `AUTH_SECRET=...` to `.env` and commit it."

**Why refuse:** `.env*` is `.gitignored` for a reason. Secrets in
git history are leaked even after later removal.

**Alternative:** Vercel dashboard → Project → Environment Variables.
Local: `.env.local` (gitignored). See
[`deployment.md`](./deployment.md).

**Refusal template:** "Refused — secrets do not commit. Use Vercel
env vars for production, `.env.local` for dev. See
`references/deployment.md`."

---

### Skip the three-gate rule on a code change

**Trigger:**

- "Don't bother running build, lint will catch it."
- "Skip the gates, I'll run them locally."

**Why refuse:** Not a hard refusal — but ask. The three-gate rule is
the agent-side discipline that catches build / type / lint
regressions Husky's per-staged-file checks miss. If the user
explicitly opts out for a specific task, respect it.

**Counter-template:** "Confirming: skip `pnpm build` / `pnpm
type-check` / `pnpm lint` for this task? I'll proceed without them.
Note: the Husky `pre-commit` hook still runs `pnpm exec lint-staged`
and `pre-push` runs `pnpm type-check`, so partial gating will fire on
commit and push."

---

## How to phrase a refusal

The pattern is **three parts, optionally a fourth:**

1. **The refusal**, in one short clause: "Refused —"
2. **The rationale**, citing the doc: "card-leak vulnerability per
   `references/redis-schema.md`"
3. **The alternative** if one exists: "use `revalidateTag` instead"
4. **(Optional) escalation path** if the user wants to override: "if
   you specifically want this, I can add it — but call out that it
   bypasses the cache invariant"

Don't apologize. Don't hedge. Don't invent context to soften the
refusal. The user explicitly told you to push back; respecting them
means doing it cleanly.

---

## See also

- [`anti-hallucination.md`](./anti-hallucination.md) — the _why_
  behind each refusal
- [`coding-patterns.md`](./coding-patterns.md) — the correct
  alternatives in code form
- SKILL.md "Landmines" — the canonical list of non-obvious failure
  modes that drive most refusals
- AGENTS.md "Critical rules" — quick-reference for the recurring ones
