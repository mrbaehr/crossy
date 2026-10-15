import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthRoutes, seedUsers, type AuthConfig, type AuthEnv } from "../auth/index.js";
import { createDb, runMigrations, type Db } from "../db/index.js";
import { getPuzzle, getUserByUsername } from "../db/queries.js";
import { memberships } from "../db/schema.js";
import { createPuzzleRoutes, validateDimensions } from "./index.js";

const config: AuthConfig = { sessionSecret: "test-secret", secureCookies: false };
let db: Db;
let app: Hono<AuthEnv>;
let cookie: string;

beforeEach(async () => {
  db = createDb(":memory:");
  runMigrations(db);
  seedUsers(db, "alice:wonderland");
  app = new Hono<AuthEnv>();
  app.route("/", createAuthRoutes(db, config));
  app.route("/", createPuzzleRoutes(db, config));
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "alice", password: "wonderland" }),
  });
  cookie = res.headers.get("set-cookie")!.split(";")[0]!;
});

const json = (r: Response) => r.json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const post = (body: unknown, withCookie = true) =>
  app.request("/api/puzzles", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("validateDimensions", () => {
  it("accepts presets, custom, odd and even", () => {
    for (const [w, h] of [[15, 15], [21, 21], [3, 50], [10, 12]]) {
      expect(validateDimensions(w, h).ok).toBe(true);
    }
  });
  it("rejects out-of-range, non-integer, and non-number", () => {
    for (const [w, h] of [[0, 15], [15, 2], [51, 15], [-1, 5], [15.5, 15], ["15", 15], [null, 15], [15, undefined]]) {
      const r = validateDimensions(w, h);
      expect(r.ok).toBe(false);
    }
  });
});

describe("POST /api/puzzles", () => {
  it("creates a puzzle with defaults and an owner membership", async () => {
    for (const size of [15, 21]) {
      const res = await post({ width: size, height: size, title: " Test " });
      expect(res.status).toBe(201);
      const { puzzle } = await json(res);
      expect(puzzle).toMatchObject({
        width: size,
        height: size,
        title: "Test",
        status: "idea",
        symmetryEnabled: true,
      });
      expect(getPuzzle(db, puzzle.id)?.width).toBe(size);
      const alice = getUserByUsername(db, "alice")!;
      const ms = db.select().from(memberships).all().filter((m) => m.puzzleId === puzzle.id);
      expect(ms).toEqual([expect.objectContaining({ userId: alice.id, role: "owner" })]);
    }
  });

  it("supports custom, non-square sizes", async () => {
    const res = await post({ width: 11, height: 9 });
    expect(res.status).toBe(201);
    expect((await json(res)).puzzle).toMatchObject({ width: 11, height: 9, title: "" });
  });

  it("rejects invalid sizes with 400 and a message, creating nothing", async () => {
    for (const body of [{ width: 0, height: 15 }, { width: 15, height: 99 }, { width: 1.5, height: 5 }, { height: 5 }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(typeof (await json(res)).error).toBe("string");
    }
    expect((await post("not json")).status).toBe(400);
    expect(db.select().from(memberships).all()).toHaveLength(0);
  });

  it("requires auth", async () => {
    expect((await post({ width: 15, height: 15 }, false)).status).toBe(401);
  });
});
