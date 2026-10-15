import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** SQLite file path. On Fly this points at the mounted volume. Defaults to ./data/crossy.db. */
export function dbPath(): string {
  return process.env.DATABASE_PATH ?? join(process.cwd(), "data", "crossy.db");
}

export function createDb(path: string = dbPath()) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** Apply all pending migrations. Called on boot. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: join(__dirname, "../../drizzle") });
}

export { schema };
