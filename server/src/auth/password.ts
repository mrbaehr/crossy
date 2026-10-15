import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

// Format: scrypt$<saltHex>$<hashHex> (node built-in scrypt; no extra dependency).
const PREFIX = "scrypt";
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `${PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function isPasswordHash(value: string): boolean {
  return /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/.test(value);
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isPasswordHash(stored)) return resolve(false);
    const [, saltHex, hashHex] = stored.split("$") as [string, string, string];
    const expected = Buffer.from(hashHex, "hex");
    scrypt(password, Buffer.from(saltHex, "hex"), expected.length, (err, derived) => {
      if (err) return resolve(false);
      resolve(timingSafeEqual(derived, expected));
    });
  });
}
