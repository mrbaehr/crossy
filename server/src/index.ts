import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, service: "crossy" }));

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
