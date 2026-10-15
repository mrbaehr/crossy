import { Hono } from "hono";
import { requireAuth, type AuthConfig, type AuthEnv } from "../auth/index.js";
import type { Db } from "../db/index.js";
import { createPuzzle } from "../db/queries.js";

export const MIN_SIZE = 3;
export const MAX_SIZE = 50;
export const MAX_TITLE_LENGTH = 200;

export type DimensionResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

/** Width/height must be integers in [MIN_SIZE, MAX_SIZE]. Odd and even are both allowed. */
export function validateDimensions(width: unknown, height: unknown): DimensionResult {
  for (const [name, v] of [["width", width], ["height", height]] as const) {
    if (typeof v !== "number" || !Number.isInteger(v)) {
      return { ok: false, error: `${name} must be a whole number` };
    }
    if (v < MIN_SIZE || v > MAX_SIZE) {
      return { ok: false, error: `${name} must be between ${MIN_SIZE} and ${MAX_SIZE}` };
    }
  }
  return { ok: true, width: width as number, height: height as number };
}

/** Routes: POST /api/puzzles (auth required). */
export function createPuzzleRoutes(db: Db, config: AuthConfig) {
  const app = new Hono<AuthEnv>();

  app.post("/api/puzzles", requireAuth(db, config), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "request body must be a JSON object" }, 400);
    }
    const dims = validateDimensions(body.width, body.height);
    if (!dims.ok) return c.json({ error: dims.error }, 400);

    let title = "";
    if (body.title !== undefined && body.title !== null) {
      if (typeof body.title !== "string") return c.json({ error: "title must be a string" }, 400);
      title = body.title.trim();
      if (title.length > MAX_TITLE_LENGTH) {
        return c.json({ error: `title must be at most ${MAX_TITLE_LENGTH} characters` }, 400);
      }
    }

    const user = c.get("user");
    const puzzle = createPuzzle(db, {
      title,
      width: dims.width,
      height: dims.height,
      ownerUserId: user.id,
      lastEditedBy: user.id,
    });
    return c.json({ puzzle }, 201);
  });

  return app;
}
