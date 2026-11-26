/**
 * lib/accounts/mfa.ts — the second sign-in step (D34). SERVER-ONLY.
 *
 * The FTC Safeguards Rule asks for multi-factor authentication for anyone
 * reaching customer information (16 CFR 314.4(c)(5)). The emailed link is
 * the first factor (something you have: your inbox); a code from an
 * authenticator app on your phone is the second.
 *  - Each person turns it on at /mlo/security: scan or type the setup key,
 *    then enter one code to prove it works. They get ten one-time recovery
 *    codes, shown once and stored only as hashes.
 *  - With it on, the emailed link opens a 5-minute code step instead of a
 *    session. Five wrong codes and that link is spent.
 *  - A code can't be used twice (the last step used is kept).
 *  - The owner can require it for everyone (CC_REQUIRE_MFA="true"); anyone
 *    without it is sent to set it up before any other page.
 *  - The owner (or a team lead, for the people they manage) can reset it for
 *    someone who lost their phone; that also signs them out everywhere.
 * The secret is encrypted with AES-256-GCM under CC_MFA_KEY, or a key
 * derived from CC_LINK_SECRET or the database address.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { incr } from "@/lib/m8/kv";
import { accountStore, type MfaRecord, type User } from "./store";
import { canManage, sha256 } from "./auth";
import { groupKey, newSecret, otpauthUri, verifyTotp } from "./totp";

export const MFA_TTL_MS = 5 * 60 * 1000;
export const MFA_MAX_TRIES = 5;
export const RECOVERY_COUNT = 10;

export const mfaRequired = () => process.env.CC_REQUIRE_MFA?.trim() === "true";

const processKey = randomBytes(32);
function key(): Buffer {
  const k = process.env.CC_MFA_KEY?.trim() || process.env.CC_LINK_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  // Without any of these (tests, a local run with the memory store) the key lives only in this process.
  return k ? createHash("sha256").update(`cc-mfa:${k}`).digest() : processKey;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function unseal(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const normRecovery = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const newRecovery = () => {
  const r = randomBytes(5).toString("hex"); // 10 hex characters
  return `${r.slice(0, 5)}-${r.slice(5)}`;
};

export async function mfaOn(userId: string): Promise<boolean> {
  return !!(await accountStore().getMfa(userId))?.enabledAt;
}

/** Starts (or restarts) setup: a new secret, not yet on. */
export async function startEnroll(user: User, now = Date.now()): Promise<{ key: string; uri: string } | { error: string }> {
  const store = accountStore();
  const existing = await store.getMfa(user.id);
  if (existing?.enabledAt) return { error: "It's already on. Turn it off first to move it to a new phone." };
  const secret = newSecret();
  await store.putMfa({ userId: user.id, secretEnc: seal(secret), enabledAt: null, lastStep: -1, recoveryHashes: [], createdAt: new Date(now).toISOString() });
  return { key: groupKey(secret), uri: otpauthUri(secret, user.email) };
}

/** The pending setup key again (after a reload), or null. */
export async function pendingEnroll(user: User): Promise<{ key: string; uri: string } | null> {
  const r = await accountStore().getMfa(user.id);
  if (!r || r.enabledAt) return null;
  const secret = unseal(r.secretEnc);
  return secret ? { key: groupKey(secret), uri: otpauthUri(secret, user.email) } : null;
}

/** Proves the app works, turns it on, and returns the recovery codes (shown once). */
export async function confirmEnroll(user: User, code: string, now = Date.now()): Promise<{ ok: true; recovery: string[] } | { ok: false; error: string }> {
  const store = accountStore();
  const r = await store.getMfa(user.id);
  if (!r || r.enabledAt) return { ok: false, error: "Start setup first." };
  const secret = unseal(r.secretEnc);
  if (!secret) return { ok: false, error: "Setup expired. Start again." };
  if ((await incr(`mfa:enroll:${user.id}`, 600)) > MFA_MAX_TRIES * 2) return { ok: false, error: "Too many tries. Wait ten minutes." };
  const step = verifyTotp(secret, code, now, r.lastStep);
  if (step === null) return { ok: false, error: "That code didn't match. Check the phone's clock is set automatically, and enter the newest code." };
  const recovery = Array.from({ length: RECOVERY_COUNT }, newRecovery);
  await store.putMfa({ ...r, enabledAt: new Date(now).toISOString(), lastStep: step, recoveryHashes: recovery.map((c) => sha256(normRecovery(c))) });
  // D89: devices remembered under an earlier phone don't skip the new one. D94: Face ID stays.
  await store.deleteDevicesFor(user.id);
  await store.audit({ at: new Date(now).toISOString(), actor: user.email, action: "mfa.on", detail: {} });
  return { ok: true, recovery };
}

/** Turns it off for yourself, with a current code (or a recovery code). */
export async function disableOwn(user: User, code: string, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mfaRequired()) return { ok: false, error: "The owner requires it for everyone. To move it to a new phone, ask the owner to reset it." };
  const v = await checkCode(user.id, code, now);
  if (!v) return { ok: false, error: "That code didn't match." };
  await accountStore().deleteMfa(user.id);
  await accountStore().deleteDevicesFor(user.id);
  await accountStore().audit({ at: new Date(now).toISOString(), actor: user.email, action: "mfa.off", detail: {} });
  return { ok: true };
}

/** Owner or team lead: reset someone who lost their phone. Signs them out everywhere and removes their Face ID devices (D94). */
export async function resetFor(actor: User, userId: string, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = accountStore();
  const target = await store.userById(userId);
  if (!target || target.id === actor.id || !canManage(actor, target.role)) return { ok: false, error: "You can't reset that account." };
  await store.deleteMfa(userId);
  await store.deleteSessionsFor(userId);
  // D94: their Face ID devices too (a lost phone is the usual reason for a reset).
  const n = await store.deletePasskeysFor(userId);
  await store.audit({ at: new Date(now).toISOString(), actor: actor.email, action: "mfa.reset", detail: { userId, faceIdRemoved: n } });
  return { ok: true };
}

/** A current authenticator code or an unused recovery code. Uses it up. */
async function checkCode(userId: string, code: string, now: number): Promise<"totp" | "recovery" | null> {
  const store = accountStore();
  const r = await store.getMfa(userId);
  if (!r?.enabledAt) return null;
  const secret = unseal(r.secretEnc);
  const step = secret ? verifyTotp(secret, code, now, r.lastStep) : null;
  if (step !== null) {
    await store.putMfa({ ...r, lastStep: step });
    return "totp";
  }
  const h = Buffer.from(sha256(normRecovery(code)));
  const i = normRecovery(code).length === 10 ? r.recoveryHashes.findIndex((x) => timingSafeEqual(Buffer.from(x), h)) : -1;
  if (i >= 0) {
    await store.putMfa({ ...r, recoveryHashes: r.recoveryHashes.filter((_, j) => j !== i) });
    return "recovery";
  }
  return null;
}

// ---- The code step at sign-in ----

const pendingHash = (p: string) => sha256(`mfa:${p}`);

/** After the emailed link: a 5-minute ticket for the code step. */
export async function openCodeStep(userId: string, now = Date.now()): Promise<string> {
  const p = randomBytes(32).toString("base64url");
  await accountStore().putLoginToken(pendingHash(p), userId, new Date(now + MFA_TTL_MS).toISOString());
  return p;
}

/** The code step. On success the ticket is used up and the caller opens a session. */
export async function finishCodeStep(p: string, code: string, now = Date.now()): Promise<{ ok: true; user: User; used: "totp" | "recovery"; recoveryLeft: number } | { ok: false; error: string; spent?: boolean }> {
  if (!p || p.length > 100) return { ok: false, error: "That sign-in has expired. Ask for a new link.", spent: true };
  const store = accountStore();
  const iso = new Date(now).toISOString();
  const userId = await store.peekLoginToken(pendingHash(p), iso);
  if (!userId) return { ok: false, error: "That sign-in has expired. Ask for a new link.", spent: true };
  const tries = await incr(`mfa:try:${pendingHash(p)}`, 600);
  if (tries > MFA_MAX_TRIES) {
    await store.consumeLoginToken(pendingHash(p), iso);
    await store.audit({ at: iso, actor: userId, action: "mfa.locked", detail: {} });
    return { ok: false, error: "Too many wrong codes. Ask for a new sign-in link.", spent: true };
  }
  const used = await checkCode(userId, code, now);
  if (!used) {
    await store.audit({ at: iso, actor: userId, action: "mfa.fail", detail: { tries } });
    return { ok: false, error: `That code didn't match. ${MFA_MAX_TRIES - tries} ${MFA_MAX_TRIES - tries === 1 ? "try" : "tries"} left.` };
  }
  if (!(await store.consumeLoginToken(pendingHash(p), iso))) return { ok: false, error: "That sign-in has expired. Ask for a new link.", spent: true };
  const user = await store.userById(userId);
  if (!user || user.status !== "active") return { ok: false, error: "That account isn't active.", spent: true };
  const left = (await store.getMfa(userId))?.recoveryHashes.length ?? 0;
  await store.audit({ at: iso, actor: user.email, action: used === "recovery" ? "mfa.recovery_used" : "mfa.ok", detail: { recoveryLeft: left } });
  return { ok: true, user, used, recoveryLeft: left };
}

export type { MfaRecord };
