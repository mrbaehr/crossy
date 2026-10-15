import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = sql`(unixepoch())`;
const createdAt = integer("created_at").notNull().default(now);
const updatedAt = integer("updated_at").notNull().default(now);

// ---------------------------------------------------------------------------
// user — seeded from env. Carries NYT submission fields (grid page + filename).
// Multi-user capable even though there are two constructors today.
// ---------------------------------------------------------------------------

export const users = sqliteTable("user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // NYT submission info
  fullName: text("full_name"),
  lastName: text("last_name"),
  address: text("address"),
  email: text("email"),
  createdAt,
});

// ---------------------------------------------------------------------------
// membership — links users to puzzles. The seam that lets us add users later.
// ---------------------------------------------------------------------------

export const memberships = sqliteTable(
  "membership",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    puzzleId: integer("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "collaborator"] })
      .notNull()
      .default("collaborator"),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.puzzleId] })],
);

// ---------------------------------------------------------------------------
// puzzle — top-level. title needed for NYT filename (LastName_PuzzleTitle.pdf).
// symmetryEnabled toggles the 180° rotational-symmetry assist per puzzle.
// ---------------------------------------------------------------------------

export const PUZZLE_STATUSES = [
  "idea",
  "filling",
  "cluing",
  "ready",
  "submitted",
] as const;

export const puzzles = sqliteTable("puzzle", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default(""),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  symmetryEnabled: integer("symmetry_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  status: text("status", { enum: PUZZLE_STATUSES }).notNull().default("idea"),
  lastEditedBy: integer("last_edited_by").references(() => users.id, {
    onDelete: "set null",
  }),
  lastEditedAt: integer("last_edited_at").notNull().default(now),
  createdAt,
});

// ---------------------------------------------------------------------------
// cell — one row per grid square. rebus/circle/shade present from day one.
// ---------------------------------------------------------------------------

export const cells = sqliteTable(
  "cell",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    puzzleId: integer("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    letter: text("letter"), // single letter for the primary display; null = empty
    isBlock: integer("is_block", { mode: "boolean" }).notNull().default(false),
    rebus: text("rebus"), // multi-character entry when present; overrides letter
    isCircled: integer("is_circled", { mode: "boolean" })
      .notNull()
      .default(false),
    isShaded: integer("is_shaded", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt,
  },
  (t) => [
    unique("cell_puzzle_rc").on(t.puzzleId, t.row, t.col),
    index("cell_puzzle_idx").on(t.puzzleId),
  ],
);

// ---------------------------------------------------------------------------
// entry — an across/down answer slot. Numbering is derived; stored for refs.
// isTheme marks seed/theme entries (visually distinct, protected from autofill).
// cells is an ordered JSON array of cell coordinates making up the slot.
// ---------------------------------------------------------------------------

export const entries = sqliteTable(
  "entry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    puzzleId: integer("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["across", "down"] }).notNull(),
    number: integer("number").notNull(),
    // ordered [{row,col}, ...] serialized; derived from the grid.
    cells: text("cells", { mode: "json" }).notNull().$type<
      Array<{ row: number; col: number }>
    >(),
    isTheme: integer("is_theme", { mode: "boolean" }).notNull().default(false),
    updatedAt,
  },
  (t) => [
    unique("entry_puzzle_dir_num").on(t.puzzleId, t.direction, t.number),
    index("entry_puzzle_idx").on(t.puzzleId),
  ],
);

// ---------------------------------------------------------------------------
// clue_draft — many per entry; one chosen. author is user id or the literal "AI".
// ---------------------------------------------------------------------------

export const clueDrafts = sqliteTable(
  "clue_draft",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    // null = user-authored unknown; store "AI" for AI drafts, else a user id as string.
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorKind: text("author_kind", { enum: ["user", "ai"] })
      .notNull()
      .default("user"),
    isChosen: integer("is_chosen", { mode: "boolean" })
      .notNull()
      .default(false),
    // both-approved is strongest status: set true once both constructors sign off.
    bothApproved: integer("both_approved", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt,
  },
  (t) => [index("clue_draft_entry_idx").on(t.entryId)],
);

// ---------------------------------------------------------------------------
// clue_bank — global answer → clues store across all puzzles.
// ---------------------------------------------------------------------------

export const clueBank = sqliteTable(
  "clue_bank",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    answer: text("answer").notNull(), // normalized uppercase answer
    clueText: text("clue_text").notNull(),
    sourcePuzzleId: integer("source_puzzle_id").references(() => puzzles.id, {
      onDelete: "set null",
    }),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorKind: text("author_kind", { enum: ["user", "ai"] })
      .notNull()
      .default("user"),
    createdAt,
  },
  (t) => [index("clue_bank_answer_idx").on(t.answer)],
);

// ---------------------------------------------------------------------------
// snapshot — named, forkable version of a puzzle. state is a serialized blob.
// ---------------------------------------------------------------------------

export const snapshots = sqliteTable(
  "snapshot",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    puzzleId: integer("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentSnapshotId: integer("parent_snapshot_id"),
    // full serialized puzzle state (grid + entries + clues) at snapshot time
    state: text("state", { mode: "json" }).notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
  },
  (t) => [index("snapshot_puzzle_idx").on(t.puzzleId)],
);

// ---------------------------------------------------------------------------
// note — lightweight async comment on a puzzle or a specific entry.
// Exactly one of puzzleId / entryId is set.
// ---------------------------------------------------------------------------

export const notes = sqliteTable(
  "note",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    puzzleId: integer("puzzle_id").references(() => puzzles.id, {
      onDelete: "cascade",
    }),
    entryId: integer("entry_id").references(() => entries.id, {
      onDelete: "cascade",
    }),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt,
  },
  (t) => [
    index("note_puzzle_idx").on(t.puzzleId),
    index("note_entry_idx").on(t.entryId),
  ],
);

// ---------------------------------------------------------------------------
// Inferred types — re-exported through @crossy/shared for client use.
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type Puzzle = typeof puzzles.$inferSelect;
export type NewPuzzle = typeof puzzles.$inferInsert;
export type Cell = typeof cells.$inferSelect;
export type NewCell = typeof cells.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type ClueDraft = typeof clueDrafts.$inferSelect;
export type ClueBankEntry = typeof clueBank.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type Note = typeof notes.$inferSelect;
