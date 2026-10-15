import { beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type Db } from "../db/index.js";
import { createPuzzle, createUser, getEntries } from "../db/queries.js";
import { clueDrafts } from "../db/schema.js";
import { hashPassword } from "../auth/password.js";
import { createGridRoutes } from "./grid.js";
import type { AuthConfig } from "../auth/index.js";
import { createSessionToken, SESSION_COOKIE } from "../auth/session.js";

const config: AuthConfig = { sessionSecret: "test-secret", secureCookies: false };

let db: Db;
let app: ReturnType<typeof createGridRoutes>;
let cookie: string;
let puzzleId: number;

beforeEach(() => {
  db = createDb(":memory:");
  runMigrations(db);
  const user = createUser(db, { username: "alice", passwordHash: hashPassword("pw") });
  const puzzle = createPuzzle(db, { title: "T", width: 5, height: 5, ownerUserId: user.id });
  puzzleId = puzzle.id;
  cookie = `${SESSION_COOKIE}=${createSessionToken(user.id, config.sessionSecret)}`;
  app = createGridRoutes(db, config);
});

function req(path: string, method: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("grid routes", () => {
  it("requires auth", async () => {
    const res = await app.request(`/api/puzzles/${puzzleId}`);
    expect(res.status).toBe(401);
  });

  it("loads a puzzle with numbers and entries", async () => {
    const res = await req(`/api/puzzles/${puzzleId}`, "GET");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.puzzle.id).toBe(puzzleId);
    expect(Array.isArray(data.cells)).toBe(true);
    // Open 5x5 -> (0,0) is #1; entries derived.
    expect(data.numbers["0,0"]).toBe(1);
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it("toggles a block and mirrors it symmetrically (atomic)", async () => {
    const res = await req(`/api/puzzles/${puzzleId}/block`, "PUT", { row: 0, col: 0 });
    expect(res.status).toBe(200);
    const changed = ((await res.json()) as any).cells.map((c: any) => [c.row, c.col]);
    expect(changed).toContainEqual([0, 0]);
    expect(changed).toContainEqual([4, 4]); // 5x5 partner of (0,0)
  });

  it("sets a letter (uppercased)", async () => {
    const res = await req(`/api/puzzles/${puzzleId}/letter`, "PUT", { row: 1, col: 1, letter: "a" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).cells[0].letter).toBe("A");
  });

  it("refuses to type into a block", async () => {
    await req(`/api/puzzles/${puzzleId}/block`, "PUT", { row: 2, col: 2 });
    const res = await req(`/api/puzzles/${puzzleId}/letter`, "PUT", { row: 2, col: 2, letter: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects out-of-bounds edits", async () => {
    const res = await req(`/api/puzzles/${puzzleId}/letter`, "PUT", { row: 99, col: 0, letter: "a" });
    expect(res.status).toBe(400);
  });

  it("renumbers entries when a block is added", async () => {
    const before = (await (await req(`/api/puzzles/${puzzleId}`, "GET")).json()) as any;
    const res = await req(`/api/puzzles/${puzzleId}/block`, "PUT", { row: 2, col: 2 });
    const after = (await res.json()) as any;
    expect(after.numbers).toBeDefined();
    expect(after.entries.length).toBeGreaterThanOrEqual(before.entries.length);
  });

  it("trashes, hides from list, and restores a puzzle", async () => {
    // delete
    expect((await req(`/api/puzzles/${puzzleId}`, "DELETE")).status).toBe(200);
    const activeList = (await (await req(`/api/puzzles`, "GET")).json()) as any;
    expect(activeList.puzzles.find((p: any) => p.id === puzzleId)).toBeUndefined();
    const trash = (await (await req(`/api/puzzles/trash`, "GET")).json()) as any;
    expect(trash.puzzles.find((p: any) => p.id === puzzleId)).toBeDefined();
    // trashed puzzle 404s on open
    expect((await req(`/api/puzzles/${puzzleId}`, "GET")).status).toBe(404);
    // restore
    expect((await req(`/api/puzzles/${puzzleId}/restore`, "POST")).status).toBe(200);
    const restored = (await (await req(`/api/puzzles`, "GET")).json()) as any;
    expect(restored.puzzles.find((p: any) => p.id === puzzleId)).toBeDefined();
  });

  it("clears the letter when a cell becomes a block", async () => {
    await req(`/api/puzzles/${puzzleId}/letter`, "PUT", { row: 0, col: 1, letter: "Q" });
    await req(`/api/puzzles/${puzzleId}/block`, "PUT", { row: 0, col: 1 });
    const data = (await (await req(`/api/puzzles/${puzzleId}`, "GET")).json()) as any;
    const cell = data.cells.find((c: any) => c.row === 0 && c.col === 1);
    expect(cell.isBlock).toBe(true);
    expect(cell.letter).toBeNull();
  });

  it("returns clue status per entry derived from drafts", async () => {
    await req(`/api/puzzles/${puzzleId}`, "GET"); // syncs entries
    const [a, b, c] = getEntries(db, puzzleId);
    db.insert(clueDrafts).values({ entryId: b!.id, text: "x" }).run();
    db.insert(clueDrafts).values({ entryId: c!.id, text: "y", isChosen: true, bothApproved: true }).run();
    const res = await req(`/api/puzzles/${puzzleId}/clues`, "GET");
    const { clueStatus } = (await res.json()) as { clueStatus: Record<number, string> };
    expect(clueStatus[a!.id]).toBe("none");
    expect(clueStatus[b!.id]).toBe("drafted");
    expect(clueStatus[c!.id]).toBe("both-approved");
    const full = (await (await req(`/api/puzzles/${puzzleId}`, "GET")).json()) as { clueStatus: Record<number, string> };
    expect(full.clueStatus[b!.id]).toBe("drafted");
  });
});
