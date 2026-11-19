/**
 * lib/clientpage/link.ts — each client's own page link (D26). SERVER-ONLY.
 *
 * A private link per client (no account, no password): the contact id and a
 * version, signed with HMAC-SHA256. The loan officer can make a new link
 * at any time (the version goes up), and the old one stops working.
 * The key is CC_LINK_SECRET (Sensitive), or, until that's set, one derived
 * from the database address (server-only). With neither, links are off.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CONFIG } from "@/lib/config";

function key(): Buffer | null {
  const s = process.env.CC_LINK_SECRET?.trim();
  if (s) return Buffer.from(s);
  const db = process.env.DATABASE_URL?.trim();
  return db ? createHash("sha256").update(`cc-link:${db}`).digest() : null;
}

export const linksOn = () => key() !== null;

const sign = (k: Buffer, payload: string) => createHmac("sha256", k).update(payload).digest("base64url").slice(0, 24);

/** The token for a contact at a link version. */
export function tokenFor(contactId: string, version = 0): string | null {
  const k = key();
  if (!k) return null;
  const payload = Buffer.from(`${contactId}.${version}`).toString("base64url");
  return `${payload}.${sign(k, payload)}`;
}

/** The contact id and version a token names, if it's genuine. */
export function readToken(token: string): { contactId: string; version: number } | null {
  const k = key();
  if (!k || typeof token !== "string" || token.length > 200) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(k, payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [contactId, v] = Buffer.from(payload, "base64url").toString().split(".");
  const version = Number(v);
  return contactId && Number.isInteger(version) ? { contactId, version } : null;
}

/** The full link, on the public site address (so it passes the draft guard's link allow-list). */
export function clientLink(contactId: string, version = 0): string | null {
  const t = tokenFor(contactId, version);
  return t ? `${CONFIG.siteUrl.replace(/\/$/, "")}/my/${t}` : null;
}

/** "(•••) •••-1234". */
export const maskPhone = (e164: string | null) => (e164 ? `(•••) •••-${e164.slice(-4)}` : "no phone on file");
