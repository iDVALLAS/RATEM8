/**
 * lib/mail/seal.ts — encrypts mailbox tokens at rest (D52). SERVER-ONLY.
 * AES-256-GCM under CC_MAIL_KEY, or a key derived from CC_LINK_SECRET or
 * the database address (its own derivation, never shared with phone codes).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const processKey = randomBytes(32);
function key(): Buffer {
  const k = process.env.CC_MAIL_KEY?.trim() || process.env.CC_LINK_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  return k ? createHash("sha256").update(`cc-mail:${k}`).digest() : processKey;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const [iv, tag, enc] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
