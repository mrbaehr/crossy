import { and, eq, ne, isNull, isNotNull } from "drizzle-orm";
import { numberGrid, cellKey, deriveClueStatus, type BlockGrid, type ClueStatus } from "@crossy/shared";
import type { Db } from "./index.js";
import {
  cells,
  clueDrafts,
  entries,
  memberships,
  puzzles,
  users,
  type NewCell,
  type NewPuzzle,
  type NewUser,
} from "./schema.js";

// --- users ---

export function createUser(db: Db, input: NewUser) {
  return db.insert(users).values(input).returning().get();
}

export function getUserByUsername(db: Db, username: string) {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export function getUserById(db: Db, id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/** Create the user, or update only the password hash if the username exists (keeps NYT fields). */
export function upsertUserByUsername(db: Db, username: string, passwordHash: string) {
  return db
    .insert(users)
    .values({ username, passwordHash })
    .onConflictDoUpdate({ target: users.username, set: { passwordHash } })
    .returning()
    .get();
}

// --- puzzles ---

export function createPuzzle(
  db: Db,
  input: NewPuzzle & { ownerUserId?: number },
) {
  const { ownerUserId, ...puzzleInput } = input;
  const puzzle = db.insert(puzzles).values(puzzleInput).returning().get();
  if (ownerUserId != null) {
    db.insert(memberships)
      .values({ userId: ownerUserId, puzzleId: puzzle.id, role: "owner" })
      .run();
  }
  return puzzle;
}

export function getPuzzle(db: Db, id: number) {
  return db.select().from(puzzles).where(eq(puzzles.id, id)).get();
}

export function listPuzzles(db: Db) {
  return db.select().from(puzzles).where(isNull(puzzles.deletedAt)).all();
}

export function listTrashedPuzzles(db: Db) {
  return db.select().from(puzzles).where(isNotNull(puzzles.deletedAt)).all();
}

export function softDeletePuzzle(db: Db, id: number) {
  db.update(puzzles).set({ deletedAt: Math.floor(Date.now() / 1000) }).where(eq(puzzles.id, id)).run();
}

export function restorePuzzle(db: Db, id: number) {
  db.update(puzzles).set({ deletedAt: null }).where(eq(puzzles.id, id)).run();
}

// --- cells ---

export function upsertCell(db: Db, input: NewCell) {
  return db
    .insert(cells)
    .values(input)
    .onConflictDoUpdate({
      target: [cells.puzzleId, cells.row, cells.col],
      set: {
        letter: input.letter ?? null,
        isBlock: input.isBlock ?? false,
        rebus: input.rebus ?? null,
        isCircled: input.isCircled ?? false,
        isShaded: input.isShaded ?? false,
      },
    })
    .returning()
    .get();
}

export function getCells(db: Db, puzzleId: number) {
  return db.select().from(cells).where(eq(cells.puzzleId, puzzleId)).all();
}

// --- entries & clues ---

export function getEntries(db: Db, puzzleId: number) {
  return db.select().from(entries).where(eq(entries.puzzleId, puzzleId)).all();
}

/**
 * Recompute numbering from the current cells and reconcile the `entry` table.
 * Entries are matched by (direction, start cell) so a row's clues survive
 * renumbering when blocks change elsewhere. Returns the derived entries +
 * number map for the client.
 */
export function syncEntries(db: Db, puzzleId: number, width: number, height: number) {
  const existing = getCells(db, puzzleId);
  const grid: BlockGrid = {
    width,
    height,
    blocks: new Set(existing.filter((c) => c.isBlock).map((c) => cellKey(c.row, c.col))),
  };
  const { numbers, entries: derived } = numberGrid(grid);

  const startKey = (e: { direction: string; cells: { row: number; col: number }[] }) =>
    `${e.direction}:${e.cells[0]!.row},${e.cells[0]!.col}`;

  const current = getEntries(db, puzzleId);
  const currentByStart = new Map(current.map((e) => [`${e.direction}:${(e.cells as any)[0].row},${(e.cells as any)[0].col}`, e]));
  const desiredKeys = new Set(derived.map(startKey));

  // Delete entries whose start cell no longer begins a slot (cascades clue drafts).
  for (const e of current) {
    const k = `${e.direction}:${(e.cells as any)[0].row},${(e.cells as any)[0].col}`;
    if (!desiredKeys.has(k)) {
      db.delete(entries).where(eq(entries.id, e.id)).run();
    }
  }

  // Move all surviving entries to a temporary high number range first, so
  // reassigning final numbers can't transiently collide on the
  // (puzzle, direction, number) unique index during renumbering.
  const OFFSET = 100000;
  for (const e of current) {
    if (desiredKeys.has(`${e.direction}:${(e.cells as any)[0].row},${(e.cells as any)[0].col}`)) {
      db.update(entries).set({ number: e.number + OFFSET }).where(eq(entries.id, e.id)).run();
    }
  }

  // Now set final numbers/cells; insert any new entries.
  for (const d of derived) {
    const prev = currentByStart.get(startKey(d));
    if (prev) {
      db.update(entries)
        .set({ number: d.number, cells: d.cells })
        .where(eq(entries.id, prev.id))
        .run();
    } else {
      db.insert(entries)
        .values({ puzzleId, direction: d.direction, number: d.number, cells: d.cells })
        .run();
    }
  }

  return { numbers: Object.fromEntries(numbers), entries: getEntries(db, puzzleId) };
}

export function getChosenClue(db: Db, entryId: number) {
  return db
    .select()
    .from(clueDrafts)
    .where(and(eq(clueDrafts.entryId, entryId), eq(clueDrafts.isChosen, true)))
    .get();
}

/** Clue status per entry id for a puzzle, derived from clue drafts. */
export function getClueStatusMap(db: Db, puzzleId: number): Record<number, ClueStatus> {
  const rows = db
    .select({
      entryId: clueDrafts.entryId,
      isChosen: clueDrafts.isChosen,
      bothApproved: clueDrafts.bothApproved,
    })
    .from(clueDrafts)
    .innerJoin(entries, eq(entries.id, clueDrafts.entryId))
    .where(eq(entries.puzzleId, puzzleId))
    .all();
  const byEntry = new Map<number, { isChosen: boolean; bothApproved: boolean }[]>();
  for (const r of rows) {
    const list = byEntry.get(r.entryId) ?? [];
    list.push(r);
    byEntry.set(r.entryId, list);
  }
  const out: Record<number, ClueStatus> = {};
  for (const e of getEntries(db, puzzleId)) out[e.id] = deriveClueStatus(byEntry.get(e.id) ?? []);
  return out;
}

// --- clue drafts (#16) ---

export function getEntry(db: Db, id: number) {
  return db.select().from(entries).where(eq(entries.id, id)).get();
}

export function getClueDraft(db: Db, id: number) {
  return db.select().from(clueDrafts).where(eq(clueDrafts.id, id)).get();
}

/** Drafts for an entry with author usernames ("AI" for AI drafts). */
export function listClueDrafts(db: Db, entryId: number) {
  return db
    .select({
      id: clueDrafts.id,
      entryId: clueDrafts.entryId,
      text: clueDrafts.text,
      authorUserId: clueDrafts.authorUserId,
      authorKind: clueDrafts.authorKind,
      authorName: users.username,
      isChosen: clueDrafts.isChosen,
      bothApproved: clueDrafts.bothApproved,
    })
    .from(clueDrafts)
    .leftJoin(users, eq(users.id, clueDrafts.authorUserId))
    .where(eq(clueDrafts.entryId, entryId))
    .orderBy(clueDrafts.id)
    .all();
}

export function addClueDraft(
  db: Db,
  input: { entryId: number; text: string; authorUserId: number | null; authorKind?: "user" | "ai" },
) {
  return db
    .insert(clueDrafts)
    .values({ authorKind: "user", ...input })
    .returning()
    .get();
}

export interface ClueDraftPatch {
  text?: string;
  isChosen?: boolean;
  bothApproved?: boolean;
}

/**
 * Apply a patch in one transaction, keeping the invariants:
 * - at most one chosen draft per entry (choosing clears the others, and their approval);
 * - bothApproved only on the chosen draft (unchoosing or editing text clears it).
 * Returns the updated draft, or an error string for an invalid request.
 */
export function updateClueDraft(db: Db, id: number, patch: ClueDraftPatch) {
  return db.transaction((tx) => {
    const draft = tx.select().from(clueDrafts).where(eq(clueDrafts.id, id)).get();
    if (!draft) return { error: "not found" as const };
    const set: Partial<typeof draft> = {};
    if (patch.text !== undefined && patch.text !== draft.text) {
      set.text = patch.text;
      set.bothApproved = false; // text changed -> approval no longer applies
    }
    if (patch.isChosen === true) {
      tx.update(clueDrafts)
        .set({ isChosen: false, bothApproved: false })
        .where(and(eq(clueDrafts.entryId, draft.entryId), ne(clueDrafts.id, id)))
        .run();
      set.isChosen = true;
    } else if (patch.isChosen === false) {
      set.isChosen = false;
      set.bothApproved = false;
    }
    if (patch.bothApproved !== undefined) {
      const chosen = set.isChosen ?? draft.isChosen;
      if (patch.bothApproved && !chosen) return { error: "only the chosen draft can be approved" as const };
      set.bothApproved = patch.bothApproved;
    }
    if (Object.keys(set).length > 0) {
      tx.update(clueDrafts).set(set).where(eq(clueDrafts.id, id)).run();
    }
    return { draft: tx.select().from(clueDrafts).where(eq(clueDrafts.id, id)).get()! };
  });
}

export function deleteClueDraft(db: Db, id: number) {
  db.delete(clueDrafts).where(eq(clueDrafts.id, id)).run();
}
