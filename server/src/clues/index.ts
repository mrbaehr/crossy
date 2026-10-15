import { Hono } from "hono";
import { requireAuth, type AuthConfig, type AuthEnv } from "../auth/index.js";
import type { Db } from "../db/index.js";
import {
  addClueDraft,
  deleteClueDraft,
  getClueDraft,
  getEntry,
  listClueDrafts,
  updateClueDraft,
  type ClueDraftPatch,
} from "../db/queries.js";

export const MAX_CLUE_LENGTH = 500;

/** Clue draft CRUD. The author is always the logged-in user (never taken from the body). */
export function createClueRoutes(db: Db, config: AuthConfig) {
  const app = new Hono<AuthEnv>();
  const auth = requireAuth(db, config);

  app.get("/api/entries/:entryId/clues", auth, (c) => {
    const entryId = Number(c.req.param("entryId"));
    if (!Number.isInteger(entryId) || !getEntry(db, entryId)) return c.json({ error: "not found" }, 404);
    return c.json({ drafts: listClueDrafts(db, entryId) });
  });

  app.post("/api/entries/:entryId/clues", auth, async (c) => {
    const entryId = Number(c.req.param("entryId"));
    if (!Number.isInteger(entryId) || !getEntry(db, entryId)) return c.json({ error: "not found" }, 404);
    const body = await c.req.json().catch(() => null);
    const text = cleanText(body?.text);
    if (!text) return c.json({ error: "text required (max " + MAX_CLUE_LENGTH + " chars)" }, 400);
    const draft = addClueDraft(db, { entryId, text, authorUserId: c.get("user").id, authorKind: "user" });
    return c.json({ draft: listClueDrafts(db, entryId).find((d) => d.id === draft.id) }, 201);
  });

  app.put("/api/clues/:id", auth, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || !getClueDraft(db, id)) return c.json({ error: "not found" }, 404);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return c.json({ error: "bad body" }, 400);
    const patch: ClueDraftPatch = {};
    if ("text" in body) {
      const text = cleanText(body.text);
      if (!text) return c.json({ error: "text required (max " + MAX_CLUE_LENGTH + " chars)" }, 400);
      patch.text = text;
    }
    for (const k of ["isChosen", "bothApproved"] as const) {
      if (k in body) {
        if (typeof body[k] !== "boolean") return c.json({ error: `${k} must be boolean` }, 400);
        patch[k] = body[k];
      }
    }
    const result = updateClueDraft(db, id, patch);
    if ("error" in result) return c.json({ error: result.error }, result.error === "not found" ? 404 : 400);
    return c.json({ drafts: listClueDrafts(db, result.draft.entryId) });
  });

  app.delete("/api/clues/:id", auth, (c) => {
    const id = Number(c.req.param("id"));
    const draft = Number.isInteger(id) ? getClueDraft(db, id) : undefined;
    if (!draft) return c.json({ error: "not found" }, 404);
    deleteClueDraft(db, id);
    return c.json({ drafts: listClueDrafts(db, draft.entryId) });
  });

  return app;
}

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= MAX_CLUE_LENGTH ? t : null;
}
