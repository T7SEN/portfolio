# Redis + Rate Limiting

Companion to SKILL.md "Subsystems → Guestbook + auth" / "Achievements" /
"Contact". Documents the Upstash Redis client, the in-memory dev fallback,
the four rate-limit types and their values, and the `SKIP_RATE_LIMIT` / IP
`6.6.6.6` carve-outs.

For the _keys_ stored in Redis, see
[`redis-schema.md`](./redis-schema.md).

---

## The Redis client — `src/lib/redis.ts`

```ts
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

class MockRedis {
  private store: Record<string, unknown[]> = {};
  async lpush(key, ...values) {
    /* in-memory list */
  }
  async lrange(key, start, end) {
    /* in-memory slice */
  }
}

const mockInstance = new MockRedis();

export const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : (mockInstance as unknown as Redis);
```

Behavior:

- When both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are
  set, the real `@upstash/redis` client is used.
- Otherwise the `MockRedis` singleton is returned — but **typed as
  `Redis`** via an unsafe cast. TypeScript thinks every Redis method is
  available; at runtime, **only `lpush` and `lrange` work**.
- The mock's `store` is per-process, so data persists across requests in
  the same dev server / test process but is wiped on restart.

### MockRedis incompleteness — Known tech debt

The production code calls these Redis methods that `MockRedis` does **not**
implement:

| Caller            | Method                       | What happens without Upstash creds |
| ----------------- | ---------------------------- | ---------------------------------- |
| `achievements.ts` | `smembers`, `sadd`, `expire` | `TypeError: ... is not a function` |
| `dashboard.ts`    | `set`, `get`                 | same                               |
| `guestbook.ts`    | `lrem`, `del`                | same                               |

If you run `npm run dev` without Upstash creds, **achievements,
dashboard, and admin guestbook delete/purge will throw** at first call.
Local-dev workarounds: either set the Upstash creds in `.env.local`, or
extend `MockRedis` with the missing methods. CI tests rely on
`SKIP_RATE_LIMIT` plus mocked endpoints, so this gap doesn't bite there.

---

## The rate limiter — `src/lib/rate-limit.ts`

```ts
export type RateLimitType = "core" | "guestbook" | "contact" | "achievements";

const LIMITERS: Record<RateLimitType, { points; duration; blockDuration }> = {
  core: { points: 20, duration: "60 s", blockDuration: 60 },
  guestbook: { points: 5, duration: "60 s", blockDuration: 60 },
  contact: { points: 3, duration: "1 h", blockDuration: 60 * 60 },
  achievements: { points: 10, duration: "60 s", blockDuration: 60 },
};
```

`checkRateLimit(identifier, type)` is the only export consumers should
call:

```ts
import { checkRateLimit } from "@/lib/rate-limit";

const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
await checkRateLimit(ip, "guestbook"); // throws on limit; caller catches
```

### Two backends, picked at runtime

```ts
const isProductionRedis =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN

if (isProductionRedis) {
  const limiter = getRedisLimiter(type) // @upstash/ratelimit, sliding window
  const { success, reset } = await limiter.limit(identifier)
  if (!success) throw new Error(`Rate limit exceeded. Try again in ${...}s.`)
} else {
  const limiter = getMemoryLimiter(type) // rate-limiter-flexible, in-memory
  await limiter.consume(identifier)
}
```

- **Upstash mode:** `@upstash/ratelimit` with sliding-window algorithm,
  `analytics: true`, key prefix `@upstash/ratelimit/<type>`. Survives
  serverless cold starts and shares state across regions.
- **In-memory mode:** `rate-limiter-flexible`'s `RateLimiterMemory`.
  Per-process state — fine for local dev, useless on Vercel's serverless
  (each invocation gets a fresh limiter, so the limit doesn't actually
  rate-limit). This is by design: in-memory is for dev only; production
  must have the Upstash creds.

Limiter instances are cached in `Map<RateLimitType, …>` so repeated calls
don't reconstruct.

### Bypass paths

```ts
if (process.env.SKIP_RATE_LIMIT === "true" && identifier !== "6.6.6.6") {
  return; // no-op
}
```

- **`SKIP_RATE_LIMIT=true`** disables the limiter for every IP **except**
  `6.6.6.6`. This is for E2E and CI: tests run without limits, but the
  spam-IP test still exercises the rejection path.
- **Do not repurpose `6.6.6.6`** — the e2e spec hard-codes it. Changing the
  carve-out breaks the rate-limit test suite.

### Error surface

A failed `limit()` throws `Error('Rate limit exceeded. Try again in Xs.')`.
A non-rate-limit error (Redis network failure, etc.) is caught and rewrapped
as `Error('Rate limit exceeded. Please try again later.')` — so callers
only ever see one error shape, and a Redis outage **fails closed** (blocks
the action).

---

## Where it's used

| Caller                                                     | Type            | Identifier           | Notes                                                                             |
| ---------------------------------------------------------- | --------------- | -------------------- | --------------------------------------------------------------------------------- |
| `src/app/actions/guestbook.ts::signGuestbook`              | `guestbook`     | `x-forwarded-for` IP | 5 / minute                                                                        |
| `src/app/actions/send-message.ts::sendMessage`             | `contact`       | `x-forwarded-for` IP | 3 / hour — the strictest limit                                                    |
| `src/app/actions/achievements.ts::unlockServerAchievement` | `achievements`  | `x-forwarded-for` IP | 10 / minute                                                                       |
| `src/app/actions/auth-actions.ts::verifyAdminSecret`       | `core`          | `x-forwarded-for` IP | 20 / minute                                                                       |
| **`src/app/api/chat/route.ts`**                            | **— (missing)** | **—**                | **see [`chat-stream-contract.md`](./chat-stream-contract.md) Known tech debt #3** |

The chat route is the one user-facing write that does **not** rate-limit,
which violates AGENTS.md "Critical rules → Rate-limit every user-facing
write." Add a `chat` type (or reuse `core`) when patching that.

### Identifier convention

Everyone uses `(await headers()).get('x-forwarded-for')` with a fallback
literal (`'unknown'` / `'127.0.0.1'`). This is the Vercel-injected client
IP. **Do not** use `x-real-ip` or `cf-connecting-ip` — Vercel rewrites
those, so the value would be wrong.

If you ever need to rate-limit by user instead of IP, the identifier can
be `session.user.id` — but make sure unauthenticated callers can't reach
the action without an IP fallback.

---

## Adding a new rate-limit type

1. Add the type to the `RateLimitType` union in
   `src/lib/rate-limit.ts`.
2. Add an entry to `LIMITERS` with `points`, `duration`, `blockDuration`.
   Pick values that match the action's threat model — chat / search
   actions can be loose (20 / 60s); destructive admin actions should be
   tight (3 / hour).
3. Call `checkRateLimit(ip, '<new-type>')` from the action.
4. Add a Vitest test in `src/lib/rate-limit.test.ts` covering the new
   type.

Do **not** add a type for "skip this one specifically" — use the
`SKIP_RATE_LIMIT` env or test against `6.6.6.6` instead.

---

## Refusal triggers

- **Adding a user-facing write without `checkRateLimit`.** Every action
  that mutates server state on behalf of a public visitor must rate-limit.
- **Calling `checkRateLimit` from a client component.** It's a server-only
  helper (uses `headers()`).
- **Using `Math.random()` as part of the rate-limit logic** — the limiter
  has its own randomness for sliding window, don't layer.
- **Switching to a different rate-limit library** — both Upstash and
  `rate-limiter-flexible` are already integrated. Adding a third doubles
  the matrix.
- **Repurposing `6.6.6.6`** for anything other than the spam-IP test.
- **Removing the `SKIP_RATE_LIMIT` bypass** — CI/E2E depends on it.
- **Calling `redis.X(...)` for any X other than `lpush`/`lrange` from code
  that may run without Upstash creds** without also adding the method to
  `MockRedis`. Otherwise dev / CI will throw at first call.

---

## Known tech debt

| #   | Issue                                                                                                                                                                                                                              | Severity                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `MockRedis` only implements `lpush`/`lrange`. Achievements / dashboard / admin guestbook actions throw without Upstash creds.                                                                                                      | High for new contributors; medium otherwise (set creds in `.env.local`). |
| 2   | In-memory rate-limit on Vercel doesn't actually limit — each invocation gets a fresh `RateLimiterMemory`. The Upstash mode is the only one that works in serverless. Document, or fail loudly if no Upstash + non-dev environment. | Med                                                                      |
| 3   | `/api/chat` is not rate-limited.                                                                                                                                                                                                   | High (cost / abuse).                                                     |
| 4   | The catch-all rewrap (`'Rate limit exceeded. Please try again later.'`) discards the original error. Log it via `@/lib/logger` before rewrapping so debugging an outage is possible.                                               | Low                                                                      |

---

## See also

- SKILL.md "Critical patterns → Rate-limit every user-facing write"
- AGENTS.md "Critical rules → Rate-limit every user-facing write"
- [`redis-schema.md`](./redis-schema.md) — the keys stored in Redis
- [`coding-patterns.md`](./coding-patterns.md) — how server actions wire
  up `checkRateLimit` + IP extraction
- [`chat-stream-contract.md`](./chat-stream-contract.md) — the missing
  rate limit on `/api/chat`
- Source: [`src/lib/redis.ts`](../src/lib/redis.ts),
  [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts),
  [`src/lib/rate-limit.test.ts`](../src/lib/rate-limit.test.ts)
