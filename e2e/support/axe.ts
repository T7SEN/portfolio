import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// The WCAG A and AA tags axe-core 4.14.0 defines up to 2.2. It has no
// wcag22a tag: WCAG 2.2 added no level A rule that axe checks.
export const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length})`,
    ),
  ).toEqual([]);
}
