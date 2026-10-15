import { beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type Db } from "../db/index.js";
import { createPuzzle, createUser, getClueStatusMap, syncEntries, getEntries } from "../db/queries.js";
import { hashPassword } from "../auth/password.js";
import { createClueRoutes } from "./index.js";
import type { AuthConfig } from "../auth/index.js";
import { createSessionToken, SESSION_COOKIE } from "../auth/session.js";

const config: AuthConfig = { sessionSecret: "test-secret", secureCookies: false };
let db: Db;
let app: ReturnType<typeof createClueRoutes>;
let cookies: Record<string, string>;
let entryId: number;
let puzzleId: number;

beforeEach(() => {
  db = createDb(":memory:");
  runMigrations(db);
  const alice = createUser(db, { username: "alice", passwordHash: hashPassword("pw") });
  const bob = createUser(db, { username: "bob", passwordHash: hashPassword("pw") });
  cookies = {
    alice: `${SESSION_COOKIE}=${createSessionToken(alice.id, config.sessionSecret)}`,
    bob: `${SESSION_COOKIE}=${createSessionToken(bob.id, config.sessionSecret)}`,
  };
  const p = createPuzzle(db, { title: "T", width: 5, height: 5, ownerUserId: alice.id });
  puzzleId = p.id;
  syncEntries(db, p.id, 5, 5);
  entryId = getEntries(db, p.id)[0]!.id;
  app = createClueRoutes(db, config);
});

function req(path: string, method: string, body?: unknown, who = "alice") {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie: cookies[who]! },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function add(text: string, who = "alice") {
  const res = await req(`/api/entries/${entryId}/clues`, "POST", { text }, who);
  return { res, draft: ((await res.json()) as any).draft };
}
async function list() {
  return ((await (await req(`/api/entries/${entryId}/clues`, "GET")).json()) as any).drafts as any[];
}

describe("clue drafts", () => {
  it("requires auth", async () => {
    expect((await app.request(`/api/entries/${entryId}/clues`)).status).toBe(401);
  });

  it("adds multiple drafts per entry and rejects empty text", async () => {
    expect((await add("First")).res.status).toBe(201);
    await add("Second", "bob");
    expect((await list()).map((d) => d.text)).toEqual(["First", "Second"]);
    expect((await add("   ")).res.status).toBe(400);
    expect((await req(`/api/entries/99999/clues`, "POST", { text: "x" })).status).toBe(404);
    expect(getClueStatusMap(db, puzzleId)[entryId]).toBe("drafted");
  });

  it("attributes drafts to the logged-in user and persists it", async () => {
    await add("A", "alice");
    await add("B", "bob");
    const drafts = await list();
    expect(drafts.map((d) => [d.authorName, d.authorKind])).toEqual([
      ["alice", "user"],
      ["bob", "user"],
    ]);
    // Editing by another user does not change the author.
    await req(`/api/clues/${drafts[0].id}`, "PUT", { text: "A2" }, "bob");
    expect((await list())[0]).toMatchObject({ text: "A2", authorName: "alice" });
  });

  it("body cannot spoof the author", async () => {
    const res = await req(`/api/entries/${entryId}/clues`, "POST", { text: "x", authorUserId: 999 }, "bob");
    expect(((await res.json()) as any).draft.authorName).toBe("bob");
  });

  it("keeps exactly one chosen draft", async () => {
    const a = (await add("A")).draft;
    const b = (await add("B", "bob")).draft;
    await req(`/api/clues/${a.id}`, "PUT", { isChosen: true });
    await req(`/api/clues/${b.id}`, "PUT", { isChosen: true });
    let drafts = await list();
    expect(drafts.filter((d) => d.isChosen).map((d) => d.id)).toEqual([b.id]);
    expect(getClueStatusMap(db, puzzleId)[entryId]).toBe("chosen");
    // Unchoose -> none chosen.
    await req(`/api/clues/${b.id}`, "PUT", { isChosen: false });
    drafts = await list();
    expect(drafts.some((d) => d.isChosen)).toBe(false);
    expect(getClueStatusMap(db, puzzleId)[entryId]).toBe("drafted");
  });

  it("both-approved only on chosen draft; reset on switch/unchoose/edit", async () => {
    const a = (await add("A")).draft;
    const b = (await add("B", "bob")).draft;
    expect((await req(`/api/clues/${a.id}`, "PUT", { bothApproved: true })).status).toBe(400);
    await req(`/api/clues/${a.id}`, "PUT", { isChosen: true, bothApproved: true });
    expect(getClueStatusMap(db, puzzleId)[entryId]).toBe("both-approved");
    await req(`/api/clues/${a.id}`, "PUT", { text: "A changed" });
    expect((await list())[0].bothApproved).toBe(false);
    await req(`/api/clues/${a.id}`, "PUT", { bothApproved: true });
    await req(`/api/clues/${b.id}`, "PUT", { isChosen: true });
    expect((await list()).some((d) => d.bothApproved)).toBe(false);
  });

  it("deletes drafts", async () => {
    const a = (await add("A")).draft;
    await req(`/api/clues/${a.id}`, "PUT", { isChosen: true });
    expect((await req(`/api/clues/${a.id}`, "DELETE")).status).toBe(200);
    expect(await list()).toEqual([]);
    expect(getClueStatusMap(db, puzzleId)[entryId]).toBe("none");
    expect((await req(`/api/clues/${a.id}`, "DELETE")).status).toBe(404);
  });
});
