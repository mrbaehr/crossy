import { createDb, runMigrations } from "./index.js";
import { createPuzzle, createUser, upsertCell } from "./queries.js";

// Seeds a sample user + a 15x15 puzzle with a rebus and a circled cell,
// to prove the schema round-trips. Safe to run on an empty DB.
const db = createDb();
runMigrations(db);

const user = createUser(db, {
  username: "sample",
  passwordHash: "x", // real hashing arrives with auth (#3)
  fullName: "Sample Constructor",
  lastName: "Constructor",
  email: "sample@example.com",
});

const puzzle = createPuzzle(db, {
  title: "Sample",
  width: 15,
  height: 15,
  ownerUserId: user.id,
});

// a rebus cell and a circled cell
upsertCell(db, { puzzleId: puzzle.id, row: 0, col: 0, rebus: "STAR" });
upsertCell(db, { puzzleId: puzzle.id, row: 0, col: 1, letter: "A", isCircled: true });

console.log(`seeded user #${user.id} and puzzle #${puzzle.id} (15x15)`);
