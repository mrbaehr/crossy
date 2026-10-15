import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless signed session token: base64url(payload).base64url(hmac-sha256).
// Payload = { uid, exp }. Chosen over a sessions table to avoid a schema change;
// fine for two trusted users. Logout clears the cookie; rotating SESSION_SECRET
// invalidates all sessions.

export const SESSION_COOKIE = "crossy_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  userId: number,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: nowSec + SESSION_TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the user id if the token is validly signed and unexpired, else null. */
export function verifySessionToken(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): number | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!Number.isInteger(uid) || typeof exp !== "number" || exp <= nowSec) return null;
    return uid;
  } catch {
    return null;
  }
}
