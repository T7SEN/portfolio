import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

// Local dev uses a file-based libSQL DB at ./local.db (gitignored).
// Production reads TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from env (set on
// DigitalOcean App Platform).
const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const db = drizzle(client);
