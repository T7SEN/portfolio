import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("REQ-ENG-04 the engine page is absent from the production build", async ({
  page,
}) => {
  const routes = Object.values(
    JSON.parse(
      readFileSync(".next/app-path-routes-manifest.json", "utf8"),
    ) as Record<string, string>,
  );
  expect(routes).toContain("/");
  expect(routes.some((route) => route.includes("engine"))).toBe(false);

  const response = await page.goto("/engine");
  expect(response?.status()).toBe(404);
});
