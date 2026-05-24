# Redis Schema — keys, types, and lifecycles

Companion to [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md).
This file catalogs the keys, their Redis types, who writes them, and
when they're invalidated.

**Scope:** Upstash Redis holds **application state** — the guestbook,
contact inbox, achievements, dashboard fallback cache, and rate-limit
counters.

**Not in Redis:** Better Auth's 4 tables (`user`, `session`, `account`,
`verification`) live in **Turso / libSQL** via Drizzle, not in Redis.
See [`auth.md`](./auth.md) for those. Reach for libSQL for anything
that needs SQL semantics (joins, FKs, transactions); reach for Redis
for caches, lists, sets, and rate-limit counters.

---

## Key catalog

| Key                                | Redis type             | TTL                        | Written by                                                                     | Read by                                 |
| ---------------------------------- | ---------------------- | -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| `guestbook`                        | list                   | ∞                          | `signGuestbook` (LPUSH), `deleteGuestbookEntry` (LREM), `purgeGuestbook` (DEL) | `fetchGuestbookEntries` (LRANGE)        |
| `inbox`                            | list                   | ∞                          | `sendMessage` (LPUSH)                                                          | (admin only — no server reader yet)     |
| `visitor:<visitorId>:achievements` | set                    | 1 year (rolling on writes) | `unlockServerAchievement` (SADD + EXPIRE)                                      | `getVisitorAchievements` (SMEMBERS)     |
| `dashboard:github`                 | string (JSON)          | 24 h                       | `fetchWithFallback` inside `getGitHubStats` (SET ex=86400)                     | same function on subsequent calls (GET) |
| `dashboard:codestats`              | string (JSON)          | 24 h                       | `getCodeStats`                                                                 | `getCodeStats`                          |
| `dashboard:valorant`               | string (JSON)          | 24 h                       | `getValorantStats`                                                             | `getValorantStats`                      |
| `dashboard:lol`                    | string (JSON)          | 24 h                       | `getLoLStats`                                                                  | `getLoLStats`                           |
| `@upstash/ratelimit/<type>:*`      | (varies per algorithm) | per limiter                | `@upstash/ratelimit` internal                                                  | `@upstash/ratelimit` internal           |

`<visitorId>` is a client-generated UUID stored in `localStorage`. The
server never inspects its shape; it's just a string. `<type>` is one of
`core | guestbook | contact | achievements` — see
[`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md).

---

## `guestbook` (list)

The signed entries, newest-first (because writes are `lpush`).

**Entry shape** (`src/app/actions/guestbook.ts::GuestbookEntry`):

```ts
{
  name: string
  message: string
  timestamp: number          // Date.now()
  avatar?: string            // provider avatar URL
  verified?: boolean         // always true today (writes require auth)
  provider?: 'github' | 'discord' | 'google'
}
```

`provider` is inferred from the avatar URL via substring matching
(`avatar.includes('github')` etc.). SKILL.md "Known tech debt → Guestbook
provider detection by substring-matching the avatar URL" flags this as
brittle but working.

**Lifecycle:**

- `signGuestbook` LPUSHes after auth + rate-limit + Zod + `bad-words`
  succeed. HuggingFace moderation runs as a best-effort secondary check
  (3 s timeout, fails open on network/timeout errors, blocks only on
  confirmed toxicity score > 0.7). See
  [`coding-patterns.md`](./coding-patterns.md).
- `deleteGuestbookEntry` removes a single entry via
  `lrem('guestbook', 1, JSON.stringify(cleanEntry))`. The serialized JSON
  must match byte-for-byte — `sanitizeEntry` strips undefined fields so
  the round-trip matches what Upstash stored.
- `purgeGuestbook` is the nuclear `DEL guestbook`.
- All three writes call `revalidateTag('guestbook', { expire: 0 })` to
  bust the matching cache (see [Cache tag mapping](#cache-tag-mapping)).

**Cached read:** `fetchGuestbookEntries(offset, limit=20)` opts into
`"use cache"` with `cacheLife('hours')` and tags
`['guestbook-entries', 'guestbook']`.

**No TTL** — entries are permanent unless an admin removes them.

---

## `inbox` (list)

The contact-form "black box" — every submission is recorded here before
Resend sends the email.

**Entry shape** (`src/app/actions/send-message.ts`):

```ts
{
  name: string;
  email: string;
  message: string;
  ip: string; // x-forwarded-for
  userAgent: string;
  timestamp: number;
  status: "received"; // always literal 'received' today
}
```

**Lifecycle:**

- `sendMessage` LPUSHes once validation + rate-limit + honeypot pass,
  then attempts the Resend send. The Redis write happens first so a
  Resend outage doesn't lose the message.
- No reader exists in the codebase. Admin moderation is currently "log
  into Upstash and `LRANGE inbox 0 -1`."
- **No TTL** — messages accumulate forever. If this list grows unbounded,
  add an LTRIM or TTL.

**Cache:** none. Writes do not call `revalidateTag` because no cached
read depends on this key.

---

## `visitor:<visitorId>:achievements` (set)

Per-visitor unlock state for the achievements system. The visitor ID is
generated client-side and stored in `localStorage`; the server treats it
as opaque.

**Entry shape:** a set of string achievement IDs, e.g.
`{'SPEED_RUNNER', 'COMPLETIONIST', 'SOCIAL_ENGINEER', ...}`.

**Lifecycle:**

- `unlockServerAchievement(visitorId, achievementId)`:
  1. Rate-limits the IP via the `achievements` limiter.
  2. `SADD key achievementId` — idempotent; returns 1 if new, 0 if
     already present.
  3. If a new unlock happened (`added > 0`), `EXPIRE key 31536000` —
     resets the TTL to 1 year on every successful unlock.
- `getVisitorAchievements(visitorId)` reads via `SMEMBERS` — no cache
  layer. Called from `useAchievements` on every relevant route, so this
  is hot.
- **TTL is 1 year, refreshed on every write.** An inactive visitor's
  achievements drop off the keyspace after 12 months. This is a cost
  measure — visitors who never come back shouldn't tie up Upstash
  storage forever.

**Cache:** none. The hook polls directly; no `cacheTag` wired.

---

## `dashboard:<source>` (string, JSON-encoded)

Five string keys hold the fallback cache for the dashboard data fetchers
in `src/app/actions/dashboard.ts`. The fetcher wrapper
`fetchWithFallback(key, fetcher, fallbackValue)` does:

```ts
try {
  const data = await fetcher();
  await redis.set(key, JSON.stringify(data), { ex: 86400 }); // 24h
  return data;
} catch {
  const cached = await redis.get(key); // last good value
  if (cached) return cached;
  return fallbackValue; // hardcoded shape if no cache
}
```

So Redis here is the **second tier** of caching. The first tier is the
`"use cache"` directive at the function level (Next 16 framework cache,
keyed by `cacheTag`). Redis is the **stale-while-network-down** fallback
that kicks in when the upstream API (GitHub GraphQL, CodeStats,
HenrikDev for Valorant, Riot for LoL) fails.

Keys:

- `dashboard:github` — GitHub contribution graph (last 84 days)
- `dashboard:codestats` — CodeStats XP / levels / top languages
- `dashboard:valorant` — HenrikDev MMR + last 5 matches
- `dashboard:lol` — Riot LoL solo-queue + match history

`getSystemStats()` (DigitalOcean droplet metrics) does **not** use the
Redis fallback — it returns a hardcoded `fallback` object on failure
because the data is too time-sensitive for stale-cache to be useful.

**TTL: 24 hours** on every key. The framework-level `cacheLife('minutes')`
is what users see on a happy path; Redis kicks in only when upstream APIs
fail.

---

## Rate-limit keys — `@upstash/ratelimit/<type>:*`

Managed entirely by `@upstash/ratelimit` (sliding-window algorithm). The
project never reads or writes these directly. Prefix is set in
`src/lib/rate-limit.ts::getRedisLimiter`:

```ts
new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(config.points, config.duration),
  analytics: true,
  prefix: `@upstash/ratelimit/${type}`,
});
```

`analytics: true` causes `@upstash/ratelimit` to write extra rows for the
Upstash dashboard graphs. If you're cost-counting Upstash commands, that
flag roughly doubles the per-limit write count.

---

## Cache tag mapping

Cached server-action reads in this project are tagged. The corresponding
writes call `revalidateTag` with matching tags.

| Cached read (file)                       | Tags                                         | Invalidated by                                                                                              |
| ---------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `fetchGuestbookEntries` (`guestbook.ts`) | `guestbook-entries`, `guestbook`             | `signGuestbook`, `deleteGuestbookEntry`, `purgeGuestbook` — all `revalidateTag('guestbook', { expire: 0 })` |
| `getGitHubStats` (`dashboard.ts`)        | `dashboard-github`, `dashboard`, `coding`    | (no explicit invalidator today — relies on `cacheLife('minutes')` expiry)                                   |
| `getCodeStats` (`dashboard.ts`)          | `dashboard-codestats`, `dashboard`, `coding` | same                                                                                                        |
| `getValorantStats` (`dashboard.ts`)      | `dashboard-valorant`, `dashboard`, `gaming`  | same                                                                                                        |
| `getLoLStats` (`dashboard.ts`)           | `dashboard-lol`, `dashboard`, `gaming`       | same                                                                                                        |
| `getSystemStats` (`dashboard.ts`)        | `dashboard-system`, `dashboard`, `system`    | same                                                                                                        |
| `getLatestCommit` (`github.ts`)          | `github-latest`                              | same                                                                                                        |
| `Footer` component (`footer.tsx`)        | (none — just `cacheLife('days')`)            | time only                                                                                                   |

The dashboard tags overlap (`dashboard`, `coding`, `gaming`, `system`) so
a future "refresh dashboard" admin action can call `revalidateTag('dashboard')`
and bust all five sources at once. Today no such action exists.

---

## Adding a new key — conventions

- **Namespace prefix is the subsystem.** `guestbook`, `inbox`,
  `visitor:`, `dashboard:` — pick one or coin a new one. Don't drop bare
  keys at the root.
- **Pick a TTL.** Permanent (`guestbook`, `inbox`) needs to be a
  conscious choice; otherwise add `ex` on every `set` / `expire` after
  `sadd`/`lpush`.
- **Pair cached reads with `cacheTag` and write paths with
  `revalidateTag`.** A cached read without a matching invalidator is
  stale UI; a write without `revalidateTag` is the same.
- **Extend `MockRedis`** if your new method isn't `lpush` or `lrange`
  (see [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) Known
  tech debt #1).
- **Document the new key here.**

---

## Refusal triggers

- **Adding a SQL/Postgres/Drizzle dependency** to store something that
  could live in Redis. The portfolio is Redis-only by design.
- **Adding a cached read with no `cacheTag`** — produces silent staleness.
- **Adding a write that mutates a key with a cached reader, without
  `revalidateTag`** — same.
- **Storing PII in unprotected keys** — see `inbox` (currently has IP /
  user-agent; that's the limit). Don't add un-hashed emails or names to
  achievement / dashboard keys.
- **Calling `redis.X(...)` for any X that `MockRedis` doesn't implement,
  from code that may run without Upstash creds**, without also extending
  `MockRedis`.

---

## See also

- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — the
  client + the limiter + the dev fallback
- [`coding-patterns.md`](./coding-patterns.md) — the `"use cache"` /
  `cacheTag` / `revalidateTag` pattern
- SKILL.md "Subsystems" — descriptions of each Redis-backed feature
- Source:
  [`src/app/actions/guestbook.ts`](../src/app/actions/guestbook.ts),
  [`src/app/actions/send-message.ts`](../src/app/actions/send-message.ts),
  [`src/app/actions/achievements.ts`](../src/app/actions/achievements.ts),
  [`src/app/actions/dashboard.ts`](../src/app/actions/dashboard.ts),
  [`src/app/actions/github.ts`](../src/app/actions/github.ts),
  [`src/components/footer.tsx`](../src/components/footer.tsx)
