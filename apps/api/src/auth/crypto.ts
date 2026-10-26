import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// OWASP-recommended scrypt cost (N=2^17, r=8, p=1); maxmem must allow 128 * N * r bytes.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAXMEM = 256 * 1024 * 1024;

/** Stored as scrypt$N$r$p$salt$hash so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A random URL-safe token for refresh cookies and email links. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** Tokens are stored hashed so a database leak does not hand out live sessions or links. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
