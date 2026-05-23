# Code Style

Companion to [`coding-patterns.md`](./coding-patterns.md). That doc is
about **what to do**; this one is about the **shape of the code** that
does it — TS settings, naming, imports, error handling, file layout,
tests, lint, hooks.

---

## TypeScript

### Strict mode everywhere

[`tsconfig.json`](../tsconfig.json):

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "isolatedModules": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ]
}
```

Notable:

- **`strict: true`** — no implicit `any`, strict null checks, strict
  function types.
- **`lib: ["dom", "dom.iterable", "esnext"]`** — DOM types are
  available everywhere because this is a Next.js app, not a pure-logic
  monorepo. Server-only files can still reference `window` types
  syntactically — runtime guards are your responsibility (see
  "Hydration safety").
- **Path alias is `@/*` → `./src/*`.** Use it for everything across
  `src/` boundaries; relative `../../../` is a smell.

### No `any` in source

ESLint's `@typescript-eslint/no-explicit-any` (from
`tsPlugin.configs.recommended`) blocks `any`. Existing `any`s in
`src/app/actions/dashboard.ts` are suppressed via an
`eslint-disable @typescript-eslint/no-explicit-any` at the top — those
are external-API JSON shapes that haven't been typed yet. New code uses
`unknown` + narrow:

```ts
// ❌
function parse(x: any) {
  /* ... */
}

// ✅
function parse(x: unknown): SomeShape {
  if (typeof x !== "object" || x === null) throw new Error("…");
  // narrow further
}
```

### Discriminated unions for state shapes

Form action states use the discriminated-union pattern:

```ts
// src/app/actions/guestbook.ts
export interface GuestbookState {
  success: boolean;
  message?: string;
  errors?: { message?: string[] };
  timestamp?: number;
  newEntry?: GuestbookEntry;
}
```

Clients narrow on `success`:

```tsx
if (state.success) {
  /* show toast, reset form */
} else {
  /* show field errors or message */
}
```

---

## Naming

| Kind                                             | Convention                            | Example                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variables, functions, parameters                 | `camelCase`                           | `actorPlayerId`, `signGuestbook`, `checkRateLimit`                                                                                                                   |
| Types, interfaces, React components, Zod schemas | `PascalCase`                          | `GuestbookEntry`, `ContactState`, `CyberChat`, `messageSchema` (lowercase OK for schemas if convention is consistent — current files mix; pick `PascalCase` for new) |
| Compile-time constants                           | `SCREAMING_SNAKE_CASE`                | `KNOWLEDGE_BASE`, `SUGGESTED_ACTIONS`, `LIMITERS`                                                                                                                    |
| File names                                       | `kebab-case.ts(x)`                    | `cyber-chat.tsx`, `rate-limit.ts`, `guestbook-client.tsx`                                                                                                            |
| Test files                                       | `<source-name>.test.ts(x)` co-located | `rate-limit.ts` → `rate-limit.test.ts` (same dir)                                                                                                                    |
| Intentionally unused param / var                 | `_`-prefix                            | `_node` in markdown component props, `_error` in catch                                                                                                               |

### Booleans

Prefix with `is` / `has` / `can`:

```ts
const isOpen, isLoading, isListening, isMuted, isClient, isAdmin;
const hackMode; // exception — kept short because it appears in many places
```

### Error class naming

`*Error` suffix when an error needs to carry a stable identifier:

```ts
// pattern, not literally in this codebase yet — most errors are plain Error
class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Rate limit exceeded. Try again in ${retryAfter}s.`);
    this.name = "RateLimitError";
  }
}
```

Today the project uses plain `new Error(...)` with `error.message.startsWith(...)`
checks (see `src/lib/rate-limit.ts`). That's fine for now; if more
specific error handling is needed, graduate to a class.

---

## File organization

### `src/` layout (already established)

```
src/
├── app/
│   ├── <route>/page.tsx       Thin route file — metadata + Suspense
│   ├── <route>/                ...other route segments
│   ├── actions/                Server actions ('use server')
│   ├── api/                    Route handlers (chat, og, auth, health)
│   ├── auth/popup/             Auth popup landing
│   ├── layout.tsx              Root layout + provider tree
│   ├── globals.css             Tailwind v4 CSS-first config + tokens
│   ├── template.tsx            Page transition wrapper
│   ├── error.tsx               Route error boundary
│   ├── global-error.tsx        App error boundary
│   ├── not-found.tsx           404 page
│   ├── robots.ts / sitemap.ts  SEO
├── components/
│   ├── pages/<route>-client.tsx   Page Shell (client; logic lives here)
│   ├── skeletons/<name>-skeleton.tsx   Suspense fallbacks
│   ├── ui/<primitive>.tsx       shadcn + bespoke primitives
│   ├── home/ guestbook/ contact/ snake/ email/ seo/   feature folders
│   └── *.tsx                   top-level components (cyber-chat, footer, navbar, etc.)
├── hooks/                       Custom hooks (use-sfx, use-konami, etc.)
├── lib/                         redis, rate-limit, logger, utils, validators
├── providers/                   admin-provider, realtime-provider
├── data/                        Static content (about, uses, socials)
├── types/                       Module augmentation (next-auth.d.ts)
├── auth.ts                      NextAuth v5 config
├── instrumentation.ts           Sentry runtime dispatcher
├── instrumentation-client.ts    Sentry client config
├── sentry.server.config.ts      Sentry Node runtime config
├── sentry.edge.config.ts        Sentry edge runtime config
```

### One thing per file

Server actions group by subsystem (`guestbook.ts` has read + write +
admin actions, all related). UI components are one component per file
unless they're tightly coupled and unused elsewhere.

### Co-located tests

Tests live next to source, not in a separate `test/` folder:

- `src/lib/rate-limit.ts` → `src/lib/rate-limit.test.ts`
- `src/lib/utils.ts` → `src/lib/utils.test.ts`
- `src/lib/validators.ts` → `src/lib/validators.test.ts`
- `src/hooks/use-konami.ts` → `src/hooks/use-konami.test.ts`
- `src/hooks/use-snake-game.ts` → `src/hooks/use-snake-game.test.ts`

If a feature gets E2E coverage, the spec lives in `e2e/`.

---

## Imports

### Order

1. External packages (`react`, `next/*`, `gsap`, `@upstash/*`, etc.)
2. Workspace (none — this is a single-package repo)
3. `@/*` alias imports (project files)
4. Relative imports (`./`, `../`)
5. CSS / asset imports

```ts
import { useState, useRef, useEffect } from "react";
import { Send, Cpu, X } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSfx } from "@/hooks/use-sfx";
import { auth } from "@/auth";

import "./globals.css";
```

### Type-only imports

Use `import type` when you only need the type:

```ts
import type { Metadata } from "next";
import type { GuestbookEntry } from "@/app/actions/guestbook";
import { fetchGuestbookEntries } from "@/app/actions/guestbook"; // value side
```

### Avoid `import * as ns`

Prefer named imports. `import * as Sentry from '@sentry/nextjs'` is the
exception — Sentry's surface is broad and namespace import is idiomatic.

---

## Comments

### Why, not what

The code shows _what_; comments justify _why_.

```ts
// ❌
// Lpush the entry.
await redis.lpush("guestbook", entry);

// ✅
// Lpush so newest-first ordering matches the LRANGE 0..N reader downstream.
await redis.lpush("guestbook", entry);
```

### Cite docs inline when a non-obvious rule is being applied

```ts
// SKILL.md "Landmines #2 — CSP is strict" — added to next.config.ts when
// this endpoint shipped. Don't fetch any other host from here without
// updating connect-src.
const res = await fetch("https://router.huggingface.co/...");
```

### TODO format

```ts
// TODO(rate-limit): add a 'chat' type per references/redis-and-rate-limiting.md
```

Include the target file or feature so it's grep-able.

---

## Error handling

### Two categories

| Category                                                     | Throw                                                                     | Use                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| Programmer error (state inconsistency, impossible code path) | `new Error(message)`                                                      | Internal — surfaces as 500 or unhandled rejection |
| User-visible error (validation failure, illegal input)       | Return a structured `…State` object with `success: false` and a `message` | Sent back to the form via `useFormState`          |

```ts
// Server action — user error: return, don't throw
if (!messageValidation.success) {
  return {
    success: false,
    errors: { message: [messageValidation.error.issues[0].message] },
    timestamp: Date.now(),
  };
}

// Programmer error — throw (the action's catch will Sentry it)
if (!entry) throw new Error("Defensive: sanitizeEntry returned undefined");
```

### Don't swallow errors

No empty `catch {}`. If you must catch, log and either re-throw or
convert into a structured failure state. The dashboard fetchers' empty
`catch (e) { /* Ignore */ }` (e.g., the ddragon fetch in `getLoLStats`)
is acceptable because it has a documented fallback path; new code
should at least `logger.warn` the catch.

### Always wrap async server actions in try/catch

Catch the broad `Error` at the action body's top level, route through
`Sentry.captureException` (with scope where relevant), log via
`@/lib/logger`, and return a user-friendly `…State` payload.

---

## Async patterns

### `await` in Next 16 dynamic APIs

```ts
import { cookies, headers } from "next/headers";

const cookieStore = await cookies();
const headerList = await headers();
```

Synchronous access throws.

### No floating promises

```ts
// ❌
asyncOp(); // fire-and-forget without intent

// ✅
await asyncOp();
// or
void asyncOp(); // intentionally fire-and-forget
```

The chat client has one intentional fire-and-forget:
`window.speechSynthesis.cancel()` returns `undefined` synchronously, so
no `void` needed.

---

## Tests

### Vitest

`npm run test` (watch), `npm run test:run` (single).

### Co-located

See "File organization" above. No separate `test/` dir.

### Idiomatic patterns

```ts
// src/lib/rate-limit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    /* reset SKIP_RATE_LIMIT etc. */
  });

  it("rejects after N attempts", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("1.2.3.4", "guestbook");
    await expect(checkRateLimit("1.2.3.4", "guestbook")).rejects.toThrow(
      /Rate limit/,
    );
  });
});
```

### E2E

Playwright in `e2e/`. The spec relies on `SKIP_RATE_LIMIT=true` (set in
`playwright.config.ts`) and the carved-out spam IP `6.6.6.6` to test
the rejection path. Do not repurpose either.

---

## ESLint — flat config

[`eslint.config.mjs`](../eslint.config.mjs) is flat-config:

```js
export default [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tsParser /* ... */ },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: { react, "react-hooks": hooksPlugin, "@next/next": nextPlugin },
    rules: {
      ...react.configs["jsx-runtime"].rules,
      ...hooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
```

What's enforced:

- `@typescript-eslint/recommended`
- `react/jsx-runtime` (no React import needed for JSX)
- `react-hooks/recommended` (rules of hooks + exhaustive deps)
- `@next/next/recommended` + `core-web-vitals`

What's NOT customized (yet):

- `@typescript-eslint/no-unused-vars` uses defaults — no `_`-prefix
  carve-out. Several files have a top-level
  `/* eslint-disable @typescript-eslint/no-unused-vars */` to mask
  unused vars; the proper fix is to either remove the unused symbol or
  rename to `_<name>` and add the `argsIgnorePattern` config. See Known
  tech debt across the reference docs.

---

## Husky hooks

```
.husky/
├── pre-commit   → npx lint-staged
└── pre-push     → npm run type-check
```

`lint-staged` config in `package.json`:

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write", "vitest related --run"],
  "*.{json,css,md,yml,yaml}": ["prettier --write"]
}
```

So a commit triggers `eslint --fix + prettier + vitest related` on
staged code files, and `prettier` on staged config/doc files. A push
triggers `tsc --noEmit` across the whole tree.

Neither gate runs `next build`. The three-gate rule (see "Three-gate
rule" below) is the agent-level discipline to fill that gap.

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

Skip the gates only for documentation-only changes (`.md` files,
`references/` content, README, CHANGELOG). Run the three commands in
parallel if you can — they don't share state.

---

## See also

- [`coding-patterns.md`](./coding-patterns.md) — patterns this style
  serves
- [`anti-hallucination.md`](./anti-hallucination.md) — what NOT to
  write
- [`deployment.md`](./deployment.md) — the Husky / lint-staged /
  three-gate posture in context of CI
- Source: [`tsconfig.json`](../tsconfig.json),
  [`eslint.config.mjs`](../eslint.config.mjs),
  [`.husky/pre-commit`](../.husky/pre-commit),
  [`.husky/pre-push`](../.husky/pre-push),
  [`package.json`](../package.json) (`lint-staged` section)
