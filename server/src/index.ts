import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { authConfigFromEnv, createAuthRoutes, seedUsers } from "./auth/index.js";
import { createPuzzleRoutes } from "./puzzles/index.js";
import { createGridRoutes } from "./puzzles/grid.js";
import { createDb, runMigrations } from "./db/index.js";

// Apply migrations on boot so the DB on the Fly volume is always current.
const db = createDb();
runMigrations(db);

seedUsers(db, process.env.USERS);
const authConfig = authConfigFromEnv();

const app = new Hono();
app.route("/", createAuthRoutes(db, authConfig));
app.route("/", createPuzzleRoutes(db, authConfig));
app.route("/", createGridRoutes(db, authConfig));

app.get("/api/health", (c) => c.json({ ok: true, service: "crossy" }));

export { db };

// In production, serve the built client. In dev, the Vite server handles the client.
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, "../../client/dist");

if (existsSync(clientDist)) {
  app.use("/*", serveStatic({ root: clientDist }));
  // SPA fallback: serve index.html for any unmatched, non-API route.
  app.get("/*", serveStatic({ path: join(clientDist, "index.html") }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`crossy server listening on http://localhost:${info.port}`);
});

export { app };
