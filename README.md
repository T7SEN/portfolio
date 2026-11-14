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

Two more runs open a visible browser on the machine's own GPU and are not part of the checks above: `pnpm e2e:engine` measures the particle field on the development page, and `pnpm e2e:gpu` measures the home page on a production build (run `pnpm build` first).

## Layout

```
src/app/         routes, the root layout, fonts and the global styles
src/app/(dev)/   pages that exist only on the development server
src/components/  the bar, footer and links, the home sections and their scroll story, the home page's loader, the study pages and the field's place behind the page
src/content/     every word on the site as typed objects, with the study outline
src/engine/      the particle field: tier choice, one simulation for WebGPU and WebGL2, the contact chapter's sky, loaded after first content
src/lib/         the stores and bridges between the page and the field: tier, calm mode, the loader's steps, the scroll story
src/tokens/      the colour tokens shared by the CSS and the engine
public/brand/    the T7SEN marks
public/still/    the still frames shown where the field cannot run
public/work/     the study pages' screenshots
scripts/         budget, environment, format, class and colour token checks, and the script that writes the star catalogue
e2e/             browser tests at 1280 and 375 px, with an accessibility scan; gpu/ and headed/ hold the runs on a real GPU
docs/            decisions, the test log and dated results
```

`pnpm tokens` rewrites `src/app/tokens.css` from `src/tokens/colors.ts` after a colour change; `pnpm test` fails while the two differ.

## Licence

There is no licence. The code is public to read; all rights are reserved, except in `src/engine/sky/catalogue.ts`: an extract of the HYG database v4.4, shared under CC BY-SA 4.0 as its licence asks, with constellation lines from ConstellationLines.dat by Marc van der Sluys under CC BY 4.0, as the file's header says.
