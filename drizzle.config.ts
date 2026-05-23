import { defineConfig } from "drizzle-kit";

// Drizzle Kit picks dialect based on whether a Turso auth token is set:
// - With token  → "turso" dialect, talks to the remote libSQL endpoint
// - Without     → "sqlite" dialect, writes to the local ./local.db file
//
// Schema lives in src/db/schema.ts; migrations land in src/db/migrations/.
// Local migrations apply via `pnpm drizzle-kit migrate`; production
// migrations apply at deploy time (see references/deployment.md).

const isTurso = !!process.env.TURSO_AUTH_TOKEN;

export default defineConfig({
  dialect: isTurso ? "turso" : "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: isTurso
    ? {
        url: process.env.TURSO_DATABASE_URL as string,
        authToken: process.env.TURSO_AUTH_TOKEN as string,
      }
    : {
        url: "file:./local.db",
      },
});
