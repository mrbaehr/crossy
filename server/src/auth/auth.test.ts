import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type Db } from "../db/index.js";
import { getUserByUsername } from "../db/queries.js";
import {
  createAuthRoutes,
  parseUsersEnv,
  requireAuth,
  seedUsers,
  type AuthConfig,
  type AuthEnv,
} from "./index.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionToken, verifySessionToken } from "./session.js";

const config: AuthConfig = { sessionSecret: "test-secret", secureCookies: true };
let db: Db;
let app: Hono<AuthEnv>;

beforeEach(() => {
  db = createDb(":memory:");
  runMigrations(db);
  seedUsers(db, `alice:wonderland,bob:${hashPassword("builder")}`);
  app = new Hono<AuthEnv>();
  app.route("/", createAuthRoutes(db, config));
  app.get("/api/protected", requireAuth(db, config), (c) =>
    c.json({ authorId: c.get("user").id }),
  );
});

const login = (username: string, password: string) =>
  app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!;

describe("password hashing", () => {
  it("verifies correct and rejects wrong passwords", async () => {
    const h = hashPassword("pw");
    expect(h).not.toContain("pw");
    expect(await verifyPassword("pw", h)).toBe(true);
    expect(await verifyPassword("nope", h)).toBe(false);
    expect(await verifyPassword("pw", "plaintext")).toBe(false);
  });
});

describe("USERS seeding", () => {
  it("parses entries and rejects malformed ones", () => {
    expect(parseUsersEnv("a:b:c, d:e")).toEqual([
      { username: "a", password: "b:c" },
      { username: "d", password: "e" },
    ]);
    expect(parseUsersEnv(undefined)).toEqual([]);
    expect(() => parseUsersEnv("nopassword")).toThrow();
  });

  it("hashes plaintext, keeps pre-hashed, and is idempotent", () => {
    const alice = getUserByUsername(db, "alice")!;
    expect(alice.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(alice.passwordHash).not.toContain("wonderland");
    seedUsers(db, "alice:wonderland");
    expect(getUserByUsername(db, "alice")!.id).toBe(alice.id);
  });
});

describe("session tokens", () => {
  it("rejects tampered, wrong-secret and expired tokens", () => {
    const t = createSessionToken(1, "s", 1000);
    expect(verifySessionToken(t, "s", 1001)).toBe(1);
    expect(verifySessionToken(t, "other", 1001)).toBeNull();
    expect(verifySessionToken(t + "x", "s", 1001)).toBeNull();
    expect(verifySessionToken(t, "s", 1000 + 60 * 60 * 24 * 31)).toBeNull();
    expect(verifySessionToken("garbage", "s")).toBeNull();
  });
});

describe("login", () => {
  it("logs in seeded users (plaintext and pre-hashed) with a hardened cookie", async () => {
    for (const [u, p] of [["alice", "wonderland"], ["bob", "builder"]] as const) {
      const res = await login(u, p);
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie")!;
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(((await res.json()) as any).user.username).toBe(u);
    }
  });

  it("rejects bad password, unknown user, and malformed body", async () => {
    expect((await login("alice", "wrong")).status).toBe(401);
    expect((await login("mallory", "x")).status).toBe(401);
    const res = await app.request("/api/auth/login", { method: "POST", body: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("requireAuth + /api/me", () => {
  it("401s without a session or with a forged one", async () => {
    expect((await app.request("/api/protected")).status).toBe(401);
    expect((await app.request("/api/me")).status).toBe(401);
    const forged = createSessionToken(1, "wrong-secret");
    const res = await app.request("/api/me", { headers: { cookie: `crossy_session=${forged}` } });
    expect(res.status).toBe(401);
  });

  it("exposes the user and author id with a valid session, never the hash", async () => {
    const cookie = cookieOf(await login("alice", "wonderland"));
    const me = await app.request("/api/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const { user } = (await me.json()) as any;
    expect(user.username).toBe("alice");
    expect(user.passwordHash).toBeUndefined();
    const prot = await app.request("/api/protected", { headers: { cookie } });
    expect(await prot.json()).toEqual({ authorId: user.id });
  });

  it("logout clears the cookie", async () => {
    const res = await app.request("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=/i);
  });
});
