# portfolio

The source of t7sen.com, version 2: a WebGPU portfolio by T7SEN, built around a live particle field that re-forms into each project, with every project one click away.

Status: early build. Until launch, t7sen.com serves a holding page from another branch.

## Stack

| Part                           | Version        |
| ------------------------------ | -------------- |
| Next.js, React                 | 16.4.5, 19.3.1 |
| TypeScript                     | 6.0.3          |
| three.js (WebGPURenderer, TSL) | 0.187.0        |
| GSAP, Lenis                    | 3.15.1, 1.3.27 |
| Tailwind CSS                   | 4.3.5          |
| Radix Dialog, cmdk             | 1.3.1, 1.1.1   |
| Vitest, Playwright             | 5.1.0, 1.65.0  |
| Node, pnpm                     | 26.x, 12.18.0  |

Every dependency is pinned to an exact version.

## Running it

```bash
pnpm install
pnpm dev
```

A production build:

```bash
pnpm build
pnpm start
```

Checks, in the order they run before a change is accepted:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm e2e
pnpm budget
```

`pnpm e2e` installs nothing; run `pnpm exec playwright install --no-shell chromium` once first. `pnpm env:check` prints which environment names from `.env.example` are set, never their values.

## Layout

```
src/app/        routes and the root layout
src/app/(dev)/  pages that exist only on the development server
scripts/        budget, environment and format checks
e2e/            browser tests at 1280 and 375 px, with an accessibility scan
docs/           decisions, the test log and dated results
```

## Licence

There is no licence. The code is public to read; all rights are reserved.
