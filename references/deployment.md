# Deployment

Companion to SKILL.md "Environment variables" + "Commands". Documents
how the portfolio reaches production (Vercel), the env-var matrix, the
Sentry configuration, and the Husky / three-gate quality bar.

The portfolio runs on **Vercel Hobby** (free tier, non-commercial) at
**t7sen.com**. All services are free-tier today.

---

## Stack — runtime perspective

| Component                    | Service                                         | Tier                      |
| ---------------------------- | ----------------------------------------------- | ------------------------- |
| Frontend + API routes        | Vercel Hobby                                    | Free                      |
| Data persistence             | Upstash Redis (REST)                            | Free                      |
| Rate limiting                | `@upstash/ratelimit` on Upstash Redis           | Free                      |
| AI inference                 | Groq Cloud (`llama-3.1-8b-instant`)             | Free quota                |
| Email                        | Resend (`onboarding@resend.dev` sandbox sender) | Free (100/day)            |
| Realtime presence            | Liveblocks                                      | Free tier                 |
| Toxic content classification | HuggingFace Inference Router (`toxic-bert`)     | Free, optional            |
| OAuth                        | GitHub / Discord / Google                       | Free                      |
| Observability                | Sentry                                          | Free (5K errors/month)    |
| Game stats                   | HenrikDev (Valorant), Riot Games (LoL)          | Free, rate-limited        |
| Dev server stats             | DigitalOcean droplet monitoring                 | Existing personal account |
| Latest commit feed           | GitPulse                                        | Free key                  |

**Vercel Hobby commercial-use clause:** the moment the portfolio takes
money (donations / ads / patronage), the frontend must migrate off
Hobby (Vercel Pro or Cloudflare Pages). Plan for that before
monetizing.

---

## Local development

### One-time setup

```
npm install
```

Verify the three gates from the start:

```
npm run build
npm run type-check
npm run lint
```

Optional (tests):

```
npm run test:run        # Vitest single run
npm run test:e2e        # Playwright
```

### Boot the dev server

```
npm run dev
```

Serves at `http://localhost:3000` via Next 16's dev server.

### Local Redis / rate-limit behavior

Without `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in
`.env.local`:

- `src/lib/redis.ts` returns the `MockRedis` singleton. Only `lpush` /
  `lrange` work — every other call throws. See
  [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) Known
  tech debt #1.
- `src/lib/rate-limit.ts` uses `RateLimiterMemory` (per-process
  in-memory limiter). Fine for dev; doesn't actually limit on Vercel
  serverless.

Set the Upstash env vars for a realistic dev experience.

### Bundle analysis

```
npm run analyze        # ANALYZE=true next build --webpack
```

Opens the bundle visualizer.

---

## Production deploy — Vercel

### Initial setup

1. Vercel dashboard → Import the `T7SEN/portfolio` repo.
2. Vercel auto-detects Next.js. Root directory is the repo root.
3. Build command: `next build` (Vercel default for Next.js — no
   override needed).
4. Install command: `npm install` (Vercel default).
5. Set env vars under Project Settings → Environment Variables — see
   matrix below.

### Subsequent deploys

Push to `main`. Vercel auto-deploys. Preview deploys spawn for every
PR / branch.

### Custom domain

`t7sen.com` points at Vercel via DNS. Configured under Project Settings
→ Domains.

---

## Environment variables

### Required for production

| Name                                                  | Purpose              | Notes                                                                            |
| ----------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                         | NextAuth JWT signing | Required; `openssl rand -base64 32`. NextAuth refuses to start without it.       |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`               | GitHub OAuth         | Required for GitHub sign-in. Provider from GitHub Developer Settings.            |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`             | Discord OAuth        | Required for Discord sign-in. Provider from Discord Developer Portal.            |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`               | Google OAuth         | Required for Google sign-in. Provider from Google Cloud Console.                 |
| `ADMIN_EMAILS`                                        | Admin whitelist      | Comma-separated. Case-insensitive match against `session.user.email`.            |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis client         | Required in production. Without these, MockRedis is used and most actions throw. |
| `GROQ_API_KEY`                                        | AI chat              | Required. AI SDK reads this auto.                                                |
| `RESEND_API_KEY`                                      | Contact form email   | Required for contact form to deliver.                                            |
| `NEXT_PUBLIC_APP_URL`                                 | Canonical URL        | Used in `metadata.metadataBase` and OG image URLs.                               |

### Optional / feature flags

| Name                                                                     | Purpose                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_SECRET`                                                           | Override code for `verifyAdminSecret`. Without it every guess fails.                                                      |
| `HUGGING_FACE_TOKEN`                                                     | Toxic-BERT moderation for guestbook. Without it, that step is skipped (logged as such).                                   |
| `GITHUB_TOKEN`                                                           | Dashboard GitHub GraphQL stats. Without it, dashboard GitHub tile falls back to last cached value or zeros.               |
| `GITHUB_USERNAME`                                                        | Dashboard GitHub user. Defaults to `t7sen`.                                                                               |
| `CODESTATS_USERNAME`                                                     | Dashboard CodeStats user. Defaults to `t7sen`.                                                                            |
| `GITPULSE_API_KEY`                                                       | Latest-commit fetch in footer.                                                                                            |
| `VALORANT_PUUID` / `HENRIK_API_KEY` / `VALORANT_REGION`                  | Dashboard Valorant tile. Region defaults to `eu`.                                                                         |
| `RIOT_PUUID` / `RIOT_API_KEY` / `RIOT_REGION_URL` / `RIOT_LOL_PEAK_RANK` | Dashboard LoL tile. Region URL defaults to euw1.                                                                          |
| `DIGITALOCEAN_DROPLET_ID` / `DIGITALOCEAN_TOKEN`                         | Dashboard system-status tile.                                                                                             |
| `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`                                      | Realtime presence. Without it, `RealtimeProvider` and `ActiveVisitors` no-op. Always set on production.                   |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`                                        | GA4 tag via `@next/third-parties`. Without it, GA is not loaded.                                                          |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`                    | Optional Sentry source-map upload at build time. Without them, runtime capture still works but stack traces are minified. |
| `VERCEL_URL`                                                             | Auto-set by Vercel on every deploy. `layout.tsx` falls back to this if `NEXT_PUBLIC_APP_URL` isn't set.                   |

### Testing-only

| Name                   | Purpose                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SKIP_RATE_LIMIT=true` | Disables `checkRateLimit` for every IP except `6.6.6.6`. Set in `playwright.config.ts` for E2E. **Never set in production.** |

### Hardcoded values worth knowing

These are in source today, not env-driven. See SKILL.md "Known tech
debt" for the list:

- **Contact recipient email** (`a.hitelare2@gmail.com`) in
  `src/app/actions/send-message.ts`.
- **Resend `from` address** (`onboarding@resend.dev`, sandbox sender)
  in the same file.
- **Sentry DSN** (`https://1d927523...@o1032877.ingest.us.sentry.io/...`)
  in `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`,
  `src/instrumentation-client.ts`.
- **Discord ID** in `src/data/socials.ts`.

These are all candidates to move to env when they grow beyond
personal-portfolio scale.

---

## Sentry configuration

Three configs, all hitting the same DSN:

### `src/sentry.server.config.ts` (Node runtime)

```ts
Sentry.init({
  dsn: "https://1d927523...@o1032877.ingest.us.sentry.io/4510457780633600",
  tracesSampleRate: 1, // ⚠️ 100% — expensive in production
  enableLogs: true,
  sendDefaultPii: true, // ⚠️ user IPs ship to Sentry
});
```

### `src/sentry.edge.config.ts` (Edge runtime)

Identical to the server config — same DSN, same `tracesSampleRate: 1`,
same `sendDefaultPii: true`.

### `src/instrumentation-client.ts` (browser)

```ts
Sentry.init({
  dsn: "https://1d927523.../4510457780633600",
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "dark",
      triggerLabel: "Report a Bug",
      formTitle: "System Issue Report",
      submitBtnLabel: "Send Report",
      autoInject: true,
      isEmailRequired: true,
    }),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  tracesSampleRate: 1,
  enableLogs: true,
  replaysSessionSampleRate: 0.1, // 10% session sample — eats quota
  replaysOnErrorSampleRate: 1.0, // 100% on errors — keep on
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

### `src/instrumentation.ts` (the dispatcher)

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs")
    await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}
export const onRequestError = Sentry.captureRequestError;
```

### Sentry-specific knobs to watch

- **`tracesSampleRate: 1`** is 100% trace sampling — burns the free
  5K-event quota fast. Dial down to `0.1` in prod (a follow-up).
- **`replaysSessionSampleRate: 0.1`** — 10% session replay. Each
  replay is expensive (in events). Consider `0.01` for prod.
- **`sendDefaultPii: true`** — IPs, headers, user agent ship to
  Sentry. Per the project's threat model (personal portfolio, low
  traffic) this is acceptable; flag it before public-launch / GDPR
  scrutiny.
- **Hardcoded DSN** — see "Hardcoded values worth knowing" above.
- **Sentry CLI postinstall** downloads a binary at install time. If
  CI fails on the binary, set `SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_AUTH_TOKEN` correctly or allow the binary download.

---

## Husky hooks

```
.husky/
├── pre-commit   → npx lint-staged
└── pre-push     → npm run type-check
```

`lint-staged` config (in `package.json`):

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write", "vitest related --run"],
  "*.{json,css,md,yml,yaml}": ["prettier --write"]
}
```

What's enforced:

- **`pre-commit`:** ESLint --fix + Prettier + Vitest's related-tests
  runner on staged code files. Prettier-only on staged config / doc
  files.
- **`pre-push`:** Whole-tree `tsc --noEmit`.

What's **not** enforced by hooks:

- `next build` — none of the hooks run it. The
  [three-gate rule](#three-gate-rule-code-touches) fills the gap.
- Full-tree ESLint — `lint-staged` only checks staged files. Use
  `npm run lint` to scan the whole tree.
- Full Vitest run — `lint-staged` only runs `vitest related`. Use
  `npm run test:run` for the whole suite.

---

## Three-gate rule (code touches)

After finishing any task that modifies code (anything that affects
`npm run build`, `npm run type-check`, or `npm run lint`), run all
three gates before reporting the task as done:

```
npm run build
npm run type-check
npm run lint
```

Skip only for documentation-only changes (`.md` files, `references/`,
README, CHANGELOG). The Husky hooks do not run `next build` — these
gates fill the gap.

Treat lint warnings the same as errors. If any gate fails, fix the
underlying issue and re-run; don't report the task complete until all
three pass.

You can run the three in parallel — they don't share state. On a
typical change set, all three together take under 90s.

---

## E2E + CI behavior

- **Playwright** runs in `e2e/`. Specs include `axe` accessibility
  checks on the main pages.
- **`SKIP_RATE_LIMIT=true`** is set in `playwright.config.ts` so tests
  aren't throttled.
- **IP `6.6.6.6`** is carved out from the bypass so a dedicated test
  still exercises the rate-limit rejection.
- **MockRedis** is used in CI (no Upstash creds), so the test surface
  has to stay on `lpush` / `lrange` — the rest of Redis methods would
  throw under MockRedis.

If you add a new Redis-backed feature, **either** extend `MockRedis`
with the new method, **or** ensure CI has Upstash creds, **or** mock
the Redis client entirely in the test.

---

## Free-tier limits to watch

| Service                          | Free limit                              | Watch for                                                                                                                                                |
| -------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby bandwidth           | 100 GB / month                          | Outbound transfer; image-heavy pages                                                                                                                     |
| Vercel Hobby function executions | 100K / month                            | Server actions + route handlers (including `/api/chat`)                                                                                                  |
| Upstash Redis                    | 10K commands / day                      | Each rate-limit check + each cache miss + each guestbook read = several commands                                                                         |
| Groq                             | Per-model rate limits                   | The chat burns this; the missing rate limit on `/api/chat` (see [`chat-stream-contract.md`](./chat-stream-contract.md)) means abuse hits this quota fast |
| Resend                           | 100 emails / day                        | The contact form                                                                                                                                         |
| Sentry                           | 5K errors / month                       | All three runtimes share. `tracesSampleRate: 1` and `replaysSessionSampleRate: 0.1` accelerate burn.                                                     |
| Liveblocks                       | Concurrent users + monthly active users | Free tier covers a personal site                                                                                                                         |
| HuggingFace                      | Per-model rate limits                   | Used only when `HUGGING_FACE_TOKEN` is set                                                                                                               |

Monitoring:

- Vercel dashboard → Project → Usage.
- Upstash dashboard → DB → Metrics.
- Sentry dashboard → Stats / Quota.
- Set alerts where the dashboard offers them.

---

## Rollback

### Frontend

Vercel keeps every deployment. Dashboard → Deployments → pick a green
one → "Promote to Production."

### Env vars

Edit in Vercel dashboard → Environment Variables → save → re-deploy
the active build.

### Schema / data

There is no schema — Redis is the data layer. Rolling back data means
restoring from Upstash backups (if enabled) or replaying writes. The
guestbook is the only Redis key that holds non-recoverable state;
treat its keys as the closest thing to a database that needs backups.

---

## See also

- SKILL.md "Environment variables" — the env list this expands
- SKILL.md "Commands" — the npm scripts
- SKILL.md "Known tech debt" — hardcoded values + Sentry tuning items
- [`coding-patterns.md`](./coding-patterns.md) #15 — three-gate rule
- [`code-style.md`](./code-style.md) — Husky + lint-staged context
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — what
  the Upstash + memory-mode + `SKIP_RATE_LIMIT` distinction actually
  does at runtime
- Source: [`next.config.ts`](../next.config.ts),
  [`package.json`](../package.json),
  [`src/instrumentation.ts`](../src/instrumentation.ts),
  [`src/sentry.server.config.ts`](../src/sentry.server.config.ts),
  [`src/sentry.edge.config.ts`](../src/sentry.edge.config.ts),
  [`src/instrumentation-client.ts`](../src/instrumentation-client.ts),
  [`.husky/pre-commit`](../.husky/pre-commit),
  [`.husky/pre-push`](../.husky/pre-push)
