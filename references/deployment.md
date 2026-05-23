# Deployment

Companion to SKILL.md "Environment variables" + "Commands". Documents
how the portfolio reaches production (**DigitalOcean App Platform**),
the env-var matrix, the Sentry configuration, the GitHub Actions CI,
and the Husky / three-gate quality bar.

The portfolio runs on **DigitalOcean App Platform** at **t7sen.com**.
GitHub auto-deploys on every push to `main`. Package manager is
**pnpm 11**.

---

## Stack — runtime perspective

| Component                    | Service                                         | Notes                                                                                                      |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend + API routes        | DigitalOcean App Platform                       | Long-running container (not per-request serverless); 1 instance, 1 vCPU, 0.5 GB RAM, Frankfurt (`fra`)     |
| Build / runtime              | Ubuntu-22 buildpack, Node-JS environment slug   | pnpm auto-detected from `pnpm-lock.yaml` + `packageManager` field in `package.json`                        |
| Data persistence             | Upstash Redis (REST)                            | Free                                                                                                       |
| Rate limiting                | `@upstash/ratelimit` on Upstash Redis           | Free                                                                                                       |
| AI inference                 | Groq Cloud (`llama-3.1-8b-instant`)             | Free quota                                                                                                 |
| Email                        | Resend (`onboarding@resend.dev` sandbox sender) | Free (100/day)                                                                                             |
| Realtime presence            | Liveblocks                                      | Free tier                                                                                                  |
| Toxic content classification | HuggingFace Inference Router (`toxic-bert`)     | Free, optional                                                                                             |
| OAuth                        | GitHub / Discord / Google                       | Free                                                                                                       |
| Observability                | Sentry                                          | Free (5K errors/month)                                                                                     |
| Game stats                   | HenrikDev (Valorant), Riot Games (LoL)          | Free, rate-limited                                                                                         |
| Dev server stats             | DigitalOcean droplet monitoring                 | A **separate personal droplet**, not the App Platform container — used by the dashboard "system" tile only |
| Latest commit feed           | GitPulse                                        | Free key                                                                                                   |

**Hosting cost:** App Platform's `apps-s-1vcpu-0.5gb` instance is a
paid tier (no equivalent of Vercel Hobby). There is **no commercial-use
restriction** — the portfolio can monetize without a hosting migration.

---

## The DO App spec — `.do/app.yaml`

The whole deployment is declared in `.do/app.yaml` at the repo root.
Edit it, commit, push — DO picks up the new spec on next deploy.

Key fields (abridged):

```yaml
name: t7sen-portfolio
region: fra

domains:
  - { domain: t7sen.com, type: PRIMARY }
  - { domain: www.t7sen.com, type: ALIAS }

services:
  - name: portfolio
    environment_slug: node-js
    instance_size_slug: apps-s-1vcpu-0.5gb
    instance_count: 1
    http_port: 8080
    build_command: pnpm build
    run_command: pnpm start
    source_dir: /
    github:
      branch: main
      deploy_on_push: true
      repo: T7SEN/portfolio
    health_check:
      http_path: /api/health
      period_seconds: 10
      failure_threshold: 9
      success_threshold: 1
      timeout_seconds: 1
    liveness_health_check: { /* same shape */ }
    envs:
      - { key: RESEND_API_KEY, scope: RUN_AND_BUILD_TIME, value: ${RESEND_API_KEY} }
      - { key: SENTRY_AUTH_TOKEN, scope: RUN_AND_BUILD_TIME, value: ${SENTRY_AUTH_TOKEN} }
      - { key: PORT, scope: RUN_AND_BUILD_TIME, value: "8080" }
      - { key: UPSTASH_REDIS_REST_TOKEN, scope: RUN_AND_BUILD_TIME, value: ${UPSTASH_REDIS_REST_TOKEN} }
      - { key: UPSTASH_REDIS_REST_URL, scope: RUN_AND_BUILD_TIME, value: ${UPSTASH_REDIS_REST_URL} }
      - { key: UPSTASH_REDIS_URL, scope: RUN_AND_BUILD_TIME, value: ${UPSTASH_REDIS_URL} }
      - { key: NODE_ENV, scope: RUN_AND_BUILD_TIME, value: production }

features:
  - buildpack-stack=ubuntu-22

alerts:
  - { rule: DEPLOYMENT_FAILED }
  - { rule: DOMAIN_FAILED }
```

Properties to remember:

- **GitHub-driven deploys.** Push to `main` → DO builds and deploys
  automatically. There is no manual `do deploy` step.
- **Health check pings `/api/health`** every 10 seconds. The route in
  `src/app/api/health/route.ts` must return 200 for the container to
  stay live. After 9 consecutive failures, DO restarts the container.
- **Port 8080** is fixed (`http_port: 8080` and `PORT=8080` injected as
  env). Next 16 binds to `process.env.PORT` automatically; don't hard-
  code a different port.
- **Single instance** (`instance_count: 1`) means in-memory state (the
  fallback rate limiter, etc.) actually persists across requests within
  the process. Scaling to >1 instance would re-introduce per-instance
  inconsistency — switch to Upstash for everything that matters then.
- **Frankfurt region** (`fra`) for EU latency. Change `region` in the
  spec to move.
- **Alerts** fire on deployment or domain failure and route to the DO
  notification channel configured for the app.

---

## Local development

### One-time setup

```
pnpm install
```

This:

1. Reads `pnpm-lock.yaml` and `package.json::packageManager`
   (`pnpm@11.1.3`).
2. Installs deps into a content-addressed `node_modules/.pnpm/` store
   with symlinked top-level packages.
3. Runs the `prepare` script (`husky`) which wires the
   `.husky/pre-commit` and `.husky/pre-push` hooks.
4. Runs the postinstall scripts allowlisted in `pnpm-workspace.yaml::allowBuilds`:
   `@sentry/cli`, `sharp`, `unrs-resolver`.

Verify the three gates from the start:

```
pnpm build
pnpm type-check
pnpm lint
```

Optional (tests):

```
pnpm test:run        # Vitest single run
pnpm test:e2e        # Playwright
```

### Boot the dev server

```
pnpm dev
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
  in-memory limiter). Works correctly on DO's long-running container
  with `instance_count: 1`. Scales-out break it.

Set the Upstash env vars for a realistic dev experience.

### Bundle analysis

```
pnpm analyze        # ANALYZE=true next build --webpack
```

Opens the bundle visualizer.

---

## pnpm specifics

### Lockfile + `packageManager`

- `pnpm-lock.yaml` is the source of truth. DO Apps detects pnpm from
  this file + the `packageManager` field in `package.json`
  (`"packageManager": "pnpm@11.1.3"`).
- `package-lock.json` does not exist; npm is not used. Running
  `npm install` would create one — don't.

### `pnpm-workspace.yaml`

pnpm 11 moved many settings out of `package.json` into
`pnpm-workspace.yaml` (even for single-package repos). This project's
file holds the **`allowBuilds`** list — packages whose postinstall
scripts pnpm will run:

```yaml
allowBuilds:
  "@sentry/cli": true
  sharp: true
  unrs-resolver: true
```

Without these three, pnpm prints `ERR_PNPM_IGNORED_BUILDS` and skips:

- `@sentry/cli` — downloads native binary for source-map upload
- `sharp` — Next.js image optimization
- `unrs-resolver` — transitive native resolver binary

If a new dep needs its postinstall, add it here and re-run
`pnpm install`. Without it, the binary silently doesn't download and
the feature it backs degrades.

### `.npmrc`

pnpm reads `.npmrc` too. This project carries:

```
legacy-peer-deps=true
auto-install-peers=true
strict-peer-dependencies=false
```

Loose peer-dep posture — many React-19-era libs ship outdated peer
ranges that the strict default would reject. Revisit when the React 19
peer-range churn settles.

### Lockfile-version pin for `eslint-plugin-react-hooks`

`package.json` pins `"eslint-plugin-react-hooks": "7.0.1"` (no caret)
because 7.1.x introduces React-Compiler-aware rules
(`set-state-in-effect`, purity, ref-mutability) that fail across the
project's existing patterns. **Known tech debt** — un-pin when those
patterns are fixed.

---

## Production deploy — DigitalOcean Apps

### Workflow

Push to `main` → DO build + deploy + health-check + go live. No manual
trigger. Deploy logs in the DO dashboard.

### Env vars — two routes

1. **`.do/app.yaml` `envs:` block** — declared in the spec, referenced
   by `${VAR_NAME}` placeholder. The real values are configured at the
   App level in the DO dashboard (under **App Settings → Environment
   Variables → Encrypted**).
2. **App Settings → Environment Variables (dashboard)** — for vars not
   in the spec, or for overriding what the spec declares.

Current spec-declared envs (all `RUN_AND_BUILD_TIME` scope):
`RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`, `PORT=8080`,
`UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_URL`, `NODE_ENV=production`.

### Custom domain

`t7sen.com` (PRIMARY) and `www.t7sen.com` (ALIAS) are declared in
`.do/app.yaml`. DNS for both points at DO's edge.

### Rollback

DO retains a deployment history. Dashboard → **Activity** → click a
prior green deploy → **Redeploy this version**. Note: rolling back the
app does **not** roll back Upstash Redis state — guestbook entries,
inbox records, etc. survive independently.

---

## Environment variables

### Required for production

| Name                                                  | Purpose              | Notes                                                                                                                             |
| ----------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                         | NextAuth JWT signing | Required; `openssl rand -base64 32`. NextAuth refuses to start without it.                                                        |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`               | GitHub OAuth         | From GitHub Developer Settings.                                                                                                   |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`             | Discord OAuth        | From Discord Developer Portal.                                                                                                    |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`               | Google OAuth         | From Google Cloud Console.                                                                                                        |
| `ADMIN_EMAILS`                                        | Admin whitelist      | Comma-separated. Case-insensitive match against `session.user.email`.                                                             |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis client         | Required in production. Without these, `MockRedis` kicks in and most actions throw.                                               |
| `GROQ_API_KEY`                                        | AI chat              | Required. AI SDK reads this auto.                                                                                                 |
| `RESEND_API_KEY`                                      | Contact form email   | Required for contact form to deliver.                                                                                             |
| `NEXT_PUBLIC_APP_URL`                                 | Canonical URL        | Used in `metadata.metadataBase` and OG image URLs. **Must be set on DO** — `layout.tsx` falls back to `localhost:3000` if absent. |
| `PORT`                                                | Listen port          | `8080`. DO Apps injects this; don't override at runtime.                                                                          |

### Optional / feature flags

| Name                                                                     | Purpose                                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `ADMIN_SECRET`                                                           | Override code for `verifyAdminSecret`. Without it every guess fails.                                 |
| `HUGGING_FACE_TOKEN`                                                     | Toxic-BERT moderation for guestbook. Without it that step is skipped.                                |
| `GITHUB_TOKEN`                                                           | Dashboard GitHub GraphQL stats.                                                                      |
| `GITHUB_USERNAME`                                                        | Defaults to `t7sen`.                                                                                 |
| `CODESTATS_USERNAME`                                                     | Defaults to `t7sen`.                                                                                 |
| `GITPULSE_API_KEY`                                                       | Latest-commit fetch in footer.                                                                       |
| `VALORANT_PUUID` / `HENRIK_API_KEY` / `VALORANT_REGION`                  | Dashboard Valorant tile. Region defaults to `eu`.                                                    |
| `RIOT_PUUID` / `RIOT_API_KEY` / `RIOT_REGION_URL` / `RIOT_LOL_PEAK_RANK` | Dashboard LoL tile.                                                                                  |
| `DIGITALOCEAN_DROPLET_ID` / `DIGITALOCEAN_TOKEN`                         | Dashboard "system" tile — refers to a **separate personal droplet**, not the App Platform container. |
| `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`                                      | Realtime presence. Without it, `RealtimeProvider` / `ActiveVisitors` no-op.                          |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`                                        | GA4 via `@next/third-parties`.                                                                       |
| `SENTRY_AUTH_TOKEN`                                                      | Source-map upload at build time. Set in `.do/app.yaml` envs.                                         |
| `SENTRY_ORG` / `SENTRY_PROJECT`                                          | Optional for source-map upload.                                                                      |
| `NODE_ENV`                                                               | `production` in `.do/app.yaml`.                                                                      |

### Testing-only

| Name                   | Purpose                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SKIP_RATE_LIMIT=true` | Disables `checkRateLimit` for every IP except `6.6.6.6`. Set in `playwright.config.ts` for E2E. Never set in production. |

### Hardcoded values worth knowing

These are in source today, not env-driven. See SKILL.md "Known tech
debt":

- **Contact recipient email** in `src/app/actions/send-message.ts`.
- **Resend `from` address** (`onboarding@resend.dev`, sandbox sender).
- **Sentry DSN** in all three Sentry config files
  (`sentry.server.config.ts`, `sentry.edge.config.ts`,
  `instrumentation-client.ts`).
- **Discord ID** in `src/data/socials.ts`.

---

## Sentry configuration

Three configs, all hitting the same hardcoded DSN.

### `src/sentry.server.config.ts` (Node runtime)

```ts
Sentry.init({
  dsn: "https://1d927523...@o1032877.ingest.us.sentry.io/4510457780633600",
  tracesSampleRate: 1, // ⚠️ 100% — expensive in production
  enableLogs: true,
  sendDefaultPii: true, // ⚠️ user IPs ship to Sentry
});
```

### `src/sentry.edge.config.ts` (edge route handlers — currently unused)

Identical to the server config. The project has no routes opted into
the edge runtime, but this config loads if any route ever is.

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
  5K-event quota fast. Dial down to `0.1` in prod (follow-up).
- **`replaysSessionSampleRate: 0.1`** — 10% session replay. Each
  replay is expensive in events. Consider `0.01` for prod.
- **`sendDefaultPii: true`** — IPs, headers, user-agent ship to
  Sentry. Acceptable for the project's personal-site threat model;
  flag before public-launch / GDPR scrutiny.
- **Hardcoded DSN** — see "Hardcoded values" above. Move to
  `NEXT_PUBLIC_SENTRY_DSN` (browser) and `SENTRY_DSN` (server) when
  scaling beyond personal scope.
- **Sentry CLI postinstall** downloads a binary at install time. With
  pnpm, the binary download requires `@sentry/cli: true` in
  `pnpm-workspace.yaml::allowBuilds`. Already configured.

---

## Husky hooks

```
.husky/
├── pre-commit   → pnpm exec lint-staged
└── pre-push     → pnpm type-check
```

`lint-staged` config (in `package.json`):

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write", "vitest related --run"],
  "*.{json,css,md,yml,yaml}": ["prettier --write"]
}
```

What's enforced:

- **`pre-commit`:** ESLint --fix + Prettier + Vitest related-tests on
  staged code files. Prettier-only on staged config / doc files.
- **`pre-push`:** Whole-tree `tsc --noEmit`.

What's **not** enforced by hooks:

- `pnpm build` — none of the hooks run it. The
  [three-gate rule](#three-gate-rule-code-touches) fills the gap.
- Full-tree ESLint — `lint-staged` only checks staged files. Use
  `pnpm lint` to scan the whole tree.
- Full Vitest run — `lint-staged` only runs `vitest related`. Use
  `pnpm test:run` for the whole suite.

---

## Three-gate rule (code touches)

After finishing any task that modifies code, run all three gates:

```
pnpm build
pnpm type-check
pnpm lint
```

Skip only for doc-only changes. The Husky hooks don't run `pnpm build`
— these gates fill the gap.

If any gate fails, fix and re-run. Treat lint warnings as errors. Run
in parallel — they don't share state.

---

## GitHub Actions CI — `.github/workflows/ci.yml`

Runs on every push to `main` and on every PR targeting `main`. Steps:

1. Checkout
2. Setup pnpm (`pnpm/action-setup@v4` pinned to `11.1.3`)
3. Setup Node 22 with pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm lint`
6. `pnpm type-check`
7. `pnpm build` (with mock env values for the build)
8. Lighthouse CI (`pnpm exec lhci autorun`) for performance scores
9. Playwright E2E (`pnpm exec playwright install` then
   `pnpm test:e2e`) with real secrets injected via GitHub repo
   secrets:
   `AUTH_SECRET`, `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`,
   `NEXT_PUBLIC_SENTRY_DSN`, and `SKIP_RATE_LIMIT=true`
10. Upload Playwright report as artifact

This is a parallel quality bar to the DO deploy. CI failures on a PR
block the merge button. CI failures on `main` mean a regression landed
— investigate immediately.

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

## Cost / quota limits to watch

| Service        | Limit                                                     | Watch for                                                                                                                                            |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DO Apps        | `apps-s-1vcpu-0.5gb` paid tier — verify $/mo in DO        | Container restarts, OOM kills, build-minute allowance                                                                                                |
| Upstash Redis  | 10K commands / day                                        | Each rate-limit check + cache miss = several commands                                                                                                |
| Groq           | Per-model rate limits                                     | Chat burns this; the missing rate limit on `/api/chat` (see [`chat-stream-contract.md`](./chat-stream-contract.md)) means abuse hits this quota fast |
| Resend         | 100 emails / day                                          | Contact form                                                                                                                                         |
| Sentry         | 5K errors / month                                         | All runtimes share. `tracesSampleRate: 1` and `replaysSessionSampleRate: 0.1` accelerate burn.                                                       |
| Liveblocks     | Concurrent + monthly active users                         | Free tier covers personal-site scale                                                                                                                 |
| HuggingFace    | Per-model rate limits                                     | Only when `HUGGING_FACE_TOKEN` is set                                                                                                                |
| GitHub Actions | 2000 free minutes / month (private) or unlimited (public) | The repo is public, so unlimited                                                                                                                     |

Monitoring:

- DO dashboard → App → **Insights** (CPU/memory/restarts/log volume)
- Upstash dashboard → DB → Metrics
- Sentry dashboard → Stats / Quota
- GitHub → repo → Actions tab for CI runs

---

## Rollback

### App (DO)

Dashboard → **Activity** → pick a green deploy → **Redeploy this
version**.

### Env vars

App Settings → Environment Variables → edit → save → DO prompts
"Deploy" → trigger redeploy.

### Schema / data

There is no schema — Redis is the data layer. Rolling back data means
restoring from Upstash backups (if enabled) or replaying writes. The
guestbook is the only Redis key holding non-recoverable state; treat
those values as the closest thing to a database that needs backups.

### CI workflow

`.github/workflows/ci.yml` lives in git. Revert the commit and push to
roll back.

---

## See also

- SKILL.md "Environment variables" — the env list this expands
- SKILL.md "Commands" — the pnpm scripts
- SKILL.md "Known tech debt" — hardcoded values + Sentry tuning items
- [`coding-patterns.md`](./coding-patterns.md) #15 — three-gate rule
- [`code-style.md`](./code-style.md) — Husky + lint-staged context
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — what
  the Upstash + memory-mode + `SKIP_RATE_LIMIT` distinction actually
  does at runtime
- Source: [`.do/app.yaml`](../.do/app.yaml),
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml),
  [`pnpm-workspace.yaml`](../pnpm-workspace.yaml),
  [`.npmrc`](../.npmrc),
  [`next.config.ts`](../next.config.ts),
  [`package.json`](../package.json),
  [`src/instrumentation.ts`](../src/instrumentation.ts),
  [`src/sentry.server.config.ts`](../src/sentry.server.config.ts),
  [`src/sentry.edge.config.ts`](../src/sentry.edge.config.ts),
  [`src/instrumentation-client.ts`](../src/instrumentation-client.ts),
  [`.husky/pre-commit`](../.husky/pre-commit),
  [`.husky/pre-push`](../.husky/pre-push)
