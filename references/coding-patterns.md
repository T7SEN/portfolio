# Coding Patterns

Companion to SKILL.md "Critical patterns to apply automatically". Each
pattern below shows what the convention looks like in this codebase,
where it's enforced, and what breaks if you skip it.

---

## 1. Shell + Suspense streaming

**Spec:** SKILL.md "Core architectural patterns → Shell + Suspense
streaming."

Every dynamic page renders an **instant static shell** with a
`<Suspense>` boundary around the async data, plus a matching skeleton.

```tsx
// src/app/guestbook/page.tsx
export default function GuestbookPage() {
  return (
    <GuestbookShell
      form={
        <Suspense fallback={<GuestbookFormSkeleton />}>
          <AsyncGuestbookForm /> // awaits auth()
        </Suspense>
      }
    >
      <Suspense fallback={<GuestbookSkeleton />}>
        <AsyncGuestbookList /> // awaits fetchGuestbookEntries(0, 20)
      </Suspense>
    </GuestbookShell>
  );
}
```

Properties:

- **Route file stays thin** — `metadata` export + the `<Suspense>` shell,
  no data fetching.
- **`*Shell` is a client component** (`'use client'`) that handles
  GSAP entrance + reduced-motion. Lives in
  `src/components/pages/<route>-client.tsx`.
- **Skeleton matches the shell's layout** — same dimensions so the
  Suspense fallback doesn't cause CLS. Skeletons live in
  `src/components/skeletons/`.
- **`Async*` components are server components** that `await` data. They
  cannot use hooks; they can call cached server actions.
- A page with no skeleton causes a visible blank flash — that's a
  regression, not "a UX choice."

Existing skeletons:
[`guestbook-skeleton.tsx`](../src/components/skeletons/guestbook-skeleton.tsx),
[`guestbook-form-skeleton.tsx`](../src/components/skeletons/guestbook-form-skeleton.tsx),
[`dashboard-skeleton.tsx`](../src/components/skeletons/dashboard-skeleton.tsx),
[`achievements-skeleton.tsx`](../src/components/skeletons/achievements-skeleton.tsx).

---

## 2. `"use cache"` + `cacheLife` + `cacheTag`

**Spec:** SKILL.md "Caching and revalidation"; depends on
`cacheComponents: true` in `next.config.ts`.

Cached reads opt in at the function body:

```ts
// src/app/actions/guestbook.ts
export async function fetchGuestbookEntries(
  offset: number,
  limit: number = 20,
): Promise<GuestbookEntry[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("guestbook-entries", "guestbook");

  const entries = await redis.lrange<GuestbookEntry>(
    "guestbook",
    offset,
    offset + limit - 1,
  );
  return entries ?? [];
}
```

Lifecycle values in use (`cacheLife(...)`):

- `cacheLife('seconds')` — system-stats dashboard tile
- `cacheLife('minutes')` — dashboard data fetchers (GitHub, CodeStats,
  Valorant, LoL)
- `cacheLife('hours')` — guestbook entries, GitHub latest commit
- `cacheLife('days')` — footer

Tagging conventions:

- **Subsystem tag** as the broad name (`guestbook`, `dashboard`).
- **Sub-tag** for narrower invalidation (`guestbook-entries`,
  `dashboard-github`, `dashboard-codestats`).
- **Group tags** for cross-source invalidation in the dashboard
  (`coding`, `gaming`, `system`) — lets a future "refresh gaming" admin
  action bust both Valorant and LoL with one call.

See [`redis-schema.md`](./redis-schema.md) "Cache tag mapping" for the
full inventory.

---

## 3. `revalidateTag` on writes

```ts
// src/app/actions/guestbook.ts
await redis.lpush("guestbook", entry);
revalidateTag("guestbook", { expire: 0 }); // ← invalidate the matching read
```

Rules:

- Every cached read needs a matching `revalidateTag` somewhere in its
  write path.
- `{ expire: 0 }` forces immediate invalidation — without it, Next 16 may
  hold the stale entry for the rest of its `cacheLife`.
- If multiple sub-tags map to the same write (e.g., `guestbook-entries`
  and `guestbook` both tag the same read), `revalidateTag('guestbook',
...)` busts both because tags cascade. Use the broadest tag that still
  matches your invalidation scope.

A cached read with the wrong (or missing) `revalidateTag` produces
**stale UI with no error**. The browser shows old data; Sentry sees
nothing. Trace the tag whenever you touch a cached action.

---

## 4. Server actions in `src/app/actions/`

**Spec:** SKILL.md "Conventions → Server actions live in
`src/app/actions/`."

```ts
// src/app/actions/<name>.ts
'use server'

import { /* ... */ } from /* ... */

export async function actionName(/* args */) { /* ... */ }
```

Properties:

- **`'use server'`** is the first non-comment line. (Or after an
  `eslint-disable` block — see Known tech debt.)
- **Only async functions exported.** Constants and types are fine; sync
  helpers are not. Next refuses to compile a `"use server"` file with
  sync exports.
- One file per subsystem: `guestbook.ts`, `achievements.ts`,
  `send-message.ts`, `dashboard.ts`, `github.ts`, `auth-actions.ts`.

---

## 5. Rate limit + IP extraction

Pattern from
[`src/app/actions/guestbook.ts`](../src/app/actions/guestbook.ts) and
[`src/app/actions/send-message.ts`](../src/app/actions/send-message.ts):

```ts
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const headerStore = await headers();
const ip = headerStore.get("x-forwarded-for") || "unknown";

try {
  await checkRateLimit(ip, "guestbook");
} catch (error) {
  logger.warn({ ip }, "Guestbook rate limit exceeded");
  return { success: false, message: error.message, timestamp: Date.now() };
}
```

Rules:

- **`x-forwarded-for`** is the platform-injected IP (DO App Platform
  sets this on incoming requests). Do not use `x-real-ip` or
  `cf-connecting-ip` — DO doesn't populate those.
- **`await headers()` is mandatory** in Next 16 — they're async now.
- **Fallback identifier** (`'unknown'`, `'127.0.0.1'`) ensures the
  limiter has a key even when the header is missing (local dev, broken
  proxy).
- See [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) for
  the limiter types and values.

---

## 6. Logger — `@/lib/logger`

[`src/lib/logger.ts`](../src/lib/logger.ts) is a thin JSON-to-console
shim:

```ts
const logger = {
  info: (obj, msg) =>
    process.env.NODE_ENV !== "test" &&
    console.log(JSON.stringify({ level: "info", msg, ...obj })),
  warn: (obj, msg) =>
    process.env.NODE_ENV !== "test" &&
    console.warn(JSON.stringify({ level: "warn", msg, ...obj })),
  error: (obj, msg) =>
    process.env.NODE_ENV !== "test" &&
    console.error(JSON.stringify({ level: "error", msg, ...obj })),
};
export default logger;
```

Usage:

```ts
import logger from "@/lib/logger";

logger.info({ name, verified }, "Guestbook signed successfully");
logger.warn({ ip }, "Guestbook rate limit exceeded");
logger.error({ error }, "Moderation error");
```

Behavior:

- **First arg is the structured payload object**, second is the human
  message. The signature is `logger.<level>({...}, msg)` — opposite of
  Pino's `pino.info(msg, {...})`. Pay attention.
- **Quiet in tests** (`NODE_ENV !== 'test'`).
- **Output:** raw JSON to `console.{log|warn|error}`. Server-side, those
  go to DO App Platform's container logs (visible in the DO dashboard →
  App → Runtime Logs); client-side, the `instrumentation-client.ts`
  `Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })`
  routes them to Sentry Logs.
- **Errors don't open a Sentry Issue** through the logger. For an Issue,
  call `Sentry.captureException(error)` explicitly (see pattern #7).

The logger is intentionally minimal. Do not import `pino`, `winston`, or
similar — they bloat the bundle and are overkill for a single-tenant
personal site whose log volume Sentry already absorbs via the
`consoleLoggingIntegration` on the client.

---

## 7. `Sentry.captureException` with scope

Plain `Sentry.captureException(error)` works for simple cases. For
context-heavy actions, wrap in `Sentry.withScope`:

```ts
// src/app/actions/send-message.ts
} catch (error) {
  Sentry.withScope((scope) => {
    scope.setTag('action', 'send-message')
    scope.setUser({ ip_address: ip })
    scope.setContext('headers', { user_agent: userAgent })
    scope.setContext('payload', { email, name })
    Sentry.captureException(error)
  })
  logger.error({ error }, 'Unexpected error in sendMessage')
  return { success: false, message: 'Critical transmission error. Please retry.', timestamp: Date.now() }
}
```

Tag conventions:

- **`scope.setTag('action', '<name>')`** — searchable in Sentry's UI.
- **`scope.setUser({ ip_address: ip })`** — pairs with `sendDefaultPii:
true` in the Sentry config.
- **`scope.setContext('payload', { ... })`** for sanitized request data
  (no passwords, no full message body if it might contain PII).

All `Sentry.captureException` sites today:

- `src/app/actions/send-message.ts:134` — full scope, see above
- `src/app/actions/guestbook.ts:303` — Redis write failure
- `src/components/cyber-chat.tsx:425` — client-side chat stream errors
- `src/app/global-error.tsx:15` — uncaught global errors
- `src/app/error.tsx:19` — uncaught route errors

---

## 8. Honeypot pattern

[`src/app/actions/send-message.ts`](../src/app/actions/send-message.ts)
demonstrates the honeypot:

```ts
const honeypot = formData.get("_gotcha");
if (honeypot && honeypot.toString().length > 0) {
  logger.warn({ ip, userAgent }, "Bot detected via honeypot");
  return {
    success: true, // ← lie to the bot
    message: "Transmission sent successfully.",
    timestamp: Date.now(),
  };
}
```

Rules:

- The form HTML must include a `<input name="_gotcha">` styled
  `aria-hidden` + `display: none` so human users never fill it.
- **Return success on detection.** Don't 4xx — that tells the bot the
  honeypot is there. Pretend the action worked and log silently.
- The honeypot is **before** the rate limit so bots don't burn the IP's
  limit budget.

---

## 9. Multi-step validation

The action's validation order matters. Pattern from
[`src/app/actions/guestbook.ts::signGuestbook`](../src/app/actions/guestbook.ts):

```
1. Auth gate           — reject unauthenticated callers
2. Identify user       — pull name / avatar from session
3. Rate limit          — IP-based
4. Zod validate        — schema check on form data
5. Profanity filter    — bad-words + normalized text
6. HuggingFace toxic-bert — AI moderation (fail-safe: reject on network error)
7. Persist             — Redis lpush
8. revalidateTag       — bust cache
```

Each step returns early with a structured `GuestbookState` on failure
(or `ContactState`, etc.). The shape always includes `success: false`,
`message`, and `timestamp: Date.now()` (used by `useFormState` to
trigger re-renders even when the message is the same as last time).

The order matters: cheap rejections (auth, rate-limit) come first;
expensive ones (network fetch to HuggingFace) come last.

---

## 10. `await cookies()` / `await headers()` — Next 16

Both `cookies()` and `headers()` from `next/headers` are **async** in
Next 16. Synchronous access throws at runtime.

```ts
import { headers } from "next/headers";

export async function someAction() {
  const headerStore = await headers(); // ← await
  const ip = headerStore.get("x-forwarded-for");
}
```

Codebase usages of `await headers()`:
`src/app/actions/guestbook.ts`, `send-message.ts`, `achievements.ts`,
`auth-actions.ts`. None call `cookies()` today — but if you add one,
`await` it.

---

## 11. GSAP via `useGSAP` + `prefers-reduced-motion`

See [`animations.md`](./animations.md) for the full pattern. Summary:

- `'use client'` on any component that uses `useGSAP`.
- `usePrefersReducedMotion()` to branch.
- `scope: ref` to scope selectors.
- `dependencies: [...]` to re-run on changes.
- Raw `gsap.to` only inside event handlers; everywhere else, `useGSAP`.

---

## 12. Sentry instrumentation — three runtimes

[`src/instrumentation.ts`](../src/instrumentation.ts) dispatches by
runtime:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs")
    await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
```

Three configs:

- **`sentry.server.config.ts`** — Node runtime (server actions, route
  handlers).
- **`sentry.edge.config.ts`** — Edge runtime (middleware, edge route
  handlers). Same DSN, same options as server.
- **`instrumentation-client.ts`** — browser. Adds
  `replayIntegration`, `feedbackIntegration` (auto-injected bug-report
  widget), `consoleLoggingIntegration` (routes `console.log/warn/error`
  to Sentry Logs).

All three share **one hardcoded DSN**. SKILL.md "Known tech debt → Sentry
DSN inlined" flags this; the same DSN works fine for now, just
move-to-env when it grows beyond personal-portfolio scale. See
[`deployment.md`](./deployment.md) for the env list and Sentry settings.

---

## 13. Provider tree — fixed order

See [`design-system.md`](./design-system.md) for the full diagram. The
order is load-bearing. Do not reorder. New global context goes inside
`AdminProvider` (so the session is available) but outside
`GlobalAppWrapper` (so it can be consumed by the wrapper's children).

---

## 14. `cn()` for class merging

[`src/lib/utils.ts`](../src/lib/utils.ts):

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Use everywhere conditional classes appear. `clsx` handles the booleans,
`twMerge` deduplicates conflicting Tailwind utilities (`px-2 px-4` →
`px-4`).

---

## 15. Three-gate rule (code touches)

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
`pre-push` runs `pnpm type-check` — neither runs `pnpm build`. The gates
catch what the hooks miss in a `cacheComponents: true` codebase where a
single import can break route serialization.

---

## See also

- SKILL.md "Critical patterns to apply automatically"
- AGENTS.md "Conventions"
- [`code-style.md`](./code-style.md) — naming, imports, error handling
- [`anti-hallucination.md`](./anti-hallucination.md) — what _not_ to do
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — the
  `checkRateLimit` pattern
- [`animations.md`](./animations.md) — the `useGSAP` pattern
- [`auth.md`](./auth.md) — admin re-check pattern on server actions
