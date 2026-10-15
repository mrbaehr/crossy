import { randomBytes } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Db } from "../db/index.js";
import { getUserById, getUserByUsername, upsertUserByUsername } from "../db/queries.js";
import { hashPassword, isPasswordHash, verifyPassword } from "./password.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session.js";

export interface AuthConfig {
  sessionSecret: string;
  /** Sets the `Secure` cookie flag. True in production. */
  secureCookies: boolean;
}

/** The authenticated user attached to the Hono context. `id` is the attribution id. */
export interface AuthUser {
  id: number;
  username: string;
  fullName: string | null;
  lastName: string | null;
  email: string | null;
  address: string | null;
}

export type AuthEnv = { Variables: { user: AuthUser } };

export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === "production";
  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (production) throw new Error("SESSION_SECRET is required in production");
    // Dev: ephemeral secret; sessions reset on restart.
    sessionSecret = randomBytes(32).toString("hex");
  }
  return { sessionSecret, secureCookies: production };
}

/**
 * Parse USERS="alice:secret,bob:scrypt$salt$hash". Split on the first colon.
 * Values starting with `scrypt$` are pre-hashed; anything else is plaintext
 * and hashed on boot.
 */
export function parseUsersEnv(value: string | undefined): { username: string; password: string }[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(":");
      if (i <= 0 || i === pair.length - 1) {
        throw new Error(`Invalid USERS entry (expected username:password): "${pair.split(":")[0]}"`);
      }
      return { username: pair.slice(0, i), password: pair.slice(i + 1) };
    });
}

/** Upsert env-defined users into the existing `user` table. */
export function seedUsers(db: Db, usersEnv: string | undefined): number {
  const parsed = parseUsersEnv(usersEnv);
  for (const { username, password } of parsed) {
    const passwordHash = isPasswordHash(password) ? password : hashPassword(password);
    upsertUserByUsername(db, username, passwordHash);
  }
  return parsed.length;
}

function toAuthUser(u: NonNullable<ReturnType<typeof getUserById>>): AuthUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    lastName: u.lastName,
    email: u.email,
    address: u.address,
  };
}

export function requireAuth(db: Db, config: AuthConfig): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const uid = token ? verifySessionToken(token, config.sessionSecret) : null;
    const user = uid != null ? getUserById(db, uid) : undefined;
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", toAuthUser(user));
    await next();
  };
}

// Valid hash to compare against for unknown usernames (evens out timing).
const DUMMY_HASH = hashPassword("dummy-password");

/** Routes: POST /api/auth/login, POST /api/auth/logout, GET /api/me. */
export function createAuthRoutes(db: Db, config: AuthConfig) {
  const app = new Hono<AuthEnv>();

  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const username = body?.username;
    const password = body?.password;
    if (typeof username !== "string" || typeof password !== "string") {
      return c.json({ error: "username and password required" }, 400);
    }
    const user = getUserByUsername(db, username);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return c.json({ error: "invalid credentials" }, 401);

    setCookie(c, SESSION_COOKIE, createSessionToken(user.id, config.sessionSecret), {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.json({ user: toAuthUser(user) });
  });

  app.post("/api/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "Lax",
    });
    return c.json({ ok: true });
  });

  app.get("/api/me", requireAuth(db, config), (c) => c.json({ user: c.get("user") }));

  return app;
}
