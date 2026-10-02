import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * scrypt's cost. 2^17 is the parameter Node's own documentation suggests for interactive logins;
 * it takes a few hundred milliseconds here, which is unnoticeable once per sign-in and expensive
 * enough to make guessing at a stolen hash impractical.
 */
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt needs roughly 128 * N * r bytes, which at this cost is about 134MB -- well past Node's
 * 32MB default, and without raising it the call fails rather than running cheaply. The headroom
 * is what the algorithm asks for plus a margin, not a number picked to be large.
 */
const options = (cost: number) => ({
  N: cost,
  r: BLOCK_SIZE,
  p: PARALLELISM,
  maxmem: 256 * cost * BLOCK_SIZE
});

/** The shape stored in the database. Reading it back out tells an attacker nothing useful. */
const FORMAT = "scrypt";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, options(COST));
  return [FORMAT, COST, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * Compares in constant time, and returns false rather than throwing on a stored value that is
 * malformed or in a format this build no longer understands -- a sign-in should fail closed, not
 * crash in a way that distinguishes one account from another.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== FORMAT) {
    return false;
  }
  const cost = Number(parts[1]);
  if (!Number.isInteger(cost) || cost < 2 ** 14) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], "base64");
    expected = Buffer.from(parts[3], "base64");
  } catch {
    return false;
  }
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) {
    return false;
  }
  // The cost recorded with the hash, not today's: a password hashed under an older cost must
  // still verify, or raising the cost would lock everybody out.
  const actual = await scrypt(password, salt, KEY_LENGTH, options(cost));
  return timingSafeEqual(actual, expected);
}

/**
 * What a password has to be before it protects anything. Deliberately a length floor rather than a
 * character-class rule: those push people towards `Password1!` and are weaker in practice.
 */
export const MINIMUM_PASSWORD_LENGTH = 12;

export function passwordComplaint(password: string): string | null {
  if (typeof password !== "string" || password.length < MINIMUM_PASSWORD_LENGTH) {
    return `A password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }
  if (password.trim().length === 0) {
    return "A password cannot be only spaces.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { db } from "./db.ts";

/** How long a browser stays signed in without signing in again. */
export const SESSION_DAYS = 30;
export const SESSION_COOKIE = "ft_session";

/**
 * The token goes to the browser; only its hash is stored. A copy of the sessions table is then
 * not a set of working sessions. SHA-256 with no salt is right here and would be wrong for a
 * password: the token is 256 bits of randomness, so there is nothing to guess at.
 */
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export type Session = { token: string; expiresAt: string };

export function startSession(userId: string): Session {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    tokenHash(token),
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

/**
 * The person this token belongs to, or undefined. An expired session is not a session: it is
 * removed rather than merely ignored, so a stale row cannot come back to life if a clock moves.
 */
export function userForToken(token: string | undefined): { id: string; email: string } | undefined {
  if (!token) {
    return undefined;
  }
  const hash = tokenHash(token);
  const row = db
    .prepare(
      `SELECT u.id AS id, u.email AS email, s.expires_at AS expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hash) as { id: string; email: string; expires_at: string } | undefined;
  if (!row) {
    return undefined;
  }
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return undefined;
  }
  db.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?").run(hash);
  return { id: row.id, email: row.email };
}

export function endSession(token: string | undefined): void {
  if (!token) {
    return;
  }
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

/**
 * Checks an email and password and starts a session, or returns nothing.
 *
 * It costs the same whether the account exists or not: without the second hash, how long this
 * takes would tell an attacker which email addresses have accounts here.
 */
export async function signIn(email: string, password: string): Promise<Session | undefined> {
  const person = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(String(email ?? "").trim()) as { id: string; password_hash: string | null } | undefined;

  if (!person?.password_hash) {
    await verifyPassword(String(password ?? ""), DECOY_HASH);
    return undefined;
  }
  if (!(await verifyPassword(String(password ?? ""), person.password_hash))) {
    return undefined;
  }
  return startSession(person.id);
}

/**
 * A real hash of a password nobody has, so the no-such-account path does the same work as the
 * wrong-password path. Built once at start-up rather than per attempt.
 */
const DECOY_HASH = await hashPassword(randomBytes(32).toString("base64url"));
