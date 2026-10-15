import { beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type Db } from "./index.js";
import {
  createPuzzle,
  createUser,
  getCells,
  getPuzzle,
  upsertCell,
} from "./queries.js";

let db: Db;

beforeEach(() => {
  db = createDb(":memory:");
  runMigrations(db);
});

describe("schema round-trip", () => {
  it("creates a user with NYT submission fields", () => {
    const user = createUser(db, {
      username: "alice",
      passwordHash: "hash",
      fullName: "Alice A",
      lastName: "A",
      address: "1 Main St",
      email: "alice@example.com",
    });
    expect(user.id).toBeGreaterThan(0);
    expect(user.lastName).toBe("A");
    expect(user.email).toBe("alice@example.com");
  });

  it("creates a puzzle with a title and owner membership", () => {
    const user = createUser(db, { username: "bob", passwordHash: "h" });
    const puzzle = createPuzzle(db, {
      title: "Themeless 1",
      width: 15,
      height: 15,
      ownerUserId: user.id,
    });
    expect(getPuzzle(db, puzzle.id)?.title).toBe("Themeless 1");
    expect(puzzle.symmetryEnabled).toBe(true);
    expect(puzzle.status).toBe("idea");
  });

  it("round-trips a rebus cell and a circled cell", () => {
    const user = createUser(db, { username: "carol", passwordHash: "h" });
    const puzzle = createPuzzle(db, {
      title: "T",
      width: 15,
      height: 15,
      ownerUserId: user.id,
    });

    upsertCell(db, { puzzleId: puzzle.id, row: 0, col: 0, rebus: "STAR" });
    upsertCell(db, {
      puzzleId: puzzle.id,
      row: 0,
      col: 1,
      letter: "A",
      isCircled: true,
    });

    const cells = getCells(db, puzzle.id);
    const rebus = cells.find((c) => c.row === 0 && c.col === 0);
    const circled = cells.find((c) => c.row === 0 && c.col === 1);

    expect(rebus?.rebus).toBe("STAR");
    expect(circled?.letter).toBe("A");
    expect(circled?.isCircled).toBe(true);
  });

  it("upsert updates an existing cell in place", () => {
    const user = createUser(db, { username: "dave", passwordHash: "h" });
    const puzzle = createPuzzle(db, {
      title: "T",
      width: 15,
      height: 15,
      ownerUserId: user.id,
    });
    upsertCell(db, { puzzleId: puzzle.id, row: 2, col: 2, letter: "X" });
    upsertCell(db, { puzzleId: puzzle.id, row: 2, col: 2, isBlock: true });

    const cells = getCells(db, puzzle.id);
    const cell = cells.find((c) => c.row === 2 && c.col === 2);
    expect(cells.length).toBe(1);
    expect(cell?.isBlock).toBe(true);
  });
});
