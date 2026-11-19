/**
 * lib/accounts/totp.ts — authenticator-app codes (D34). Pure functions.
 *
 * RFC 6238 time-based one-time passwords (HMAC-SHA1, 30 seconds, 6 digits),
 * the kind Google Authenticator, Microsoft Authenticator, 1Password and
 * Authy all read. RFC 4648 base32 for the setup key.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, as base32. */
export const newSecret = () => base32Encode(randomBytes(20));

/** The HOTP value for a counter (RFC 4226). */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Checks a code against the current 30-second step and one step either
 * side (clock drift). Returns the matching step, so a code can't be used
 * twice (the caller refuses any step at or before the last one used).
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastStep = -1): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  let secret: Buffer;
  try {
    secret = base32Decode(secretB32);
  } catch {
    return null;
  }
  const now = stepAt(nowMs);
  for (const s of [now, now - 1, now + 1]) {
    if (s <= lastStep) continue;
    const want = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(want, Buffer.from(c))) return s;
  }
  return null;
}

/** The link an authenticator app opens (otpauth://), with the issuer shown in the app. */
export function otpauthUri(secretB32: string, account: string, issuer = "LoanM8 Command Center"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** The setup key in groups of four, for typing. */
export const groupKey = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();
