import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { toggleBlock, cellKey, type BlockGrid } from "@crossy/shared";
import { requireAuth, type AuthConfig, type AuthEnv } from "../auth/index.js";
import type { Db } from "../db/index.js";
import { getCells, getPuzzle, listPuzzles, upsertCell } from "../db/queries.js";
import { puzzles } from "../db/schema.js";

/**
 * Grid read/write routes. Server is authoritative: block toggles run through the
 * shared symmetry engine so the mirror is applied atomically here (not trusted
 * from the client). Letter edits are a simple per-cell write.
 */
export function createGridRoutes(db: Db, config: AuthConfig) {
  const app = new Hono<AuthEnv>();
  const auth = requireAuth(db, config);

  // List puzzles (for the open-a-puzzle UI).
  app.get("/api/puzzles", auth, (c) => {
    return c.json({ puzzles: listPuzzles(db) });
  });

  // Load one puzzle with all its cells.
  app.get("/api/puzzles/:id", auth, (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
    const puzzle = getPuzzle(db, id);
    if (!puzzle) return c.json({ error: "not found" }, 404);
    return c.json({ puzzle, cells: getCells(db, id) });
  });

  // Set a letter (or clear it) in a single cell.
  app.put("/api/puzzles/:id/letter", auth, async (c) => {
    const id = Number(c.req.param("id"));
    const puzzle = getPuzzle(db, id);
    if (!puzzle) return c.json({ error: "not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const { row, col, letter } = body ?? {};
    if (!inBounds(puzzle, row, col)) return c.json({ error: "cell out of bounds" }, 400);
    if (letter !== null && (typeof letter !== "string" || letter.length > 1)) {
      return c.json({ error: "letter must be a single char or null" }, 400);
    }

    // Preserve other cell attributes; don't allow typing into a block.
    const prev = getCells(db, id).find((x) => x.row === row && x.col === col);
    if (prev?.isBlock) return c.json({ error: "cannot type into a block" }, 400);
    const cell = upsertCell(db, {
      puzzleId: id,
      row,
      col,
      letter: letter ? letter.toUpperCase() : null,
      isBlock: false,
      isCircled: prev?.isCircled ?? false,
      isShaded: prev?.isShaded ?? false,
      rebus: prev?.rebus ?? null,
    });
    touch(db, id, c.get("user").id);
    return c.json({ cells: [cell] });
  });

  // Toggle a block. Runs the shared symmetry engine; returns all changed cells.
  app.put("/api/puzzles/:id/block", auth, async (c) => {
    const id = Number(c.req.param("id"));
    const puzzle = getPuzzle(db, id);
    if (!puzzle) return c.json({ error: "not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const { row, col } = body ?? {};
    if (!inBounds(puzzle, row, col)) return c.json({ error: "cell out of bounds" }, 400);

    const existing = getCells(db, id);
    const grid: BlockGrid = {
      width: puzzle.width,
      height: puzzle.height,
      blocks: new Set(existing.filter((x) => x.isBlock).map((x) => cellKey(x.row, x.col))),
    };

    const byKey = new Map(existing.map((x) => [cellKey(x.row, x.col), x]));
    const result = toggleBlock(grid, row, col, puzzle.symmetryEnabled);
    const written = result.changed.map((coord) => {
      const isBlock = result.blocks.has(cellKey(coord.row, coord.col));
      const prev = byKey.get(cellKey(coord.row, coord.col));
      // Preserve circle/shade; clear the letter when a cell becomes a block.
      return upsertCell(db, {
        puzzleId: id,
        row: coord.row,
        col: coord.col,
        isBlock,
        letter: isBlock ? null : (prev?.letter ?? null),
        rebus: isBlock ? null : (prev?.rebus ?? null),
        isCircled: prev?.isCircled ?? false,
        isShaded: prev?.isShaded ?? false,
      });
    });
    touch(db, id, c.get("user").id);
    return c.json({ cells: written });
  });

  return app;
}

function inBounds(
  puzzle: { width: number; height: number },
  row: unknown,
  col: unknown,
): row is number {
  return (
    typeof row === "number" &&
    typeof col === "number" &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < puzzle.height &&
    col >= 0 &&
    col < puzzle.width
  );
}

/** Record who last edited the puzzle and when. */
function touch(db: Db, puzzleId: number, userId: number): void {
  db.update(puzzles)
    .set({ lastEditedBy: userId, lastEditedAt: Math.floor(Date.now() / 1000) })
    .where(eq(puzzles.id, puzzleId))
    .run();
}
