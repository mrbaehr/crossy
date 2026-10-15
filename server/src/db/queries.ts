import { and, eq } from "drizzle-orm";
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
  return db.select().from(puzzles).all();
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

export function getChosenClue(db: Db, entryId: number) {
  return db
    .select()
    .from(clueDrafts)
    .where(and(eq(clueDrafts.entryId, entryId), eq(clueDrafts.isChosen, true)))
    .get();
}
