/**
 * lib/accounts/auth.ts — Command Center sign-in, sessions and roles (D1).
 * SERVER-ONLY.
 *
 * Sign-in is an emailed one-time link (no passwords): 15 minutes, single
 * use. It opens a session: a random token in an httpOnly cookie, stored
 * only as a hash. D89: 12 hours, or 30 days when "Remember this device for
 * 30 days" is ticked; a remembered device also skips the authenticator
 * step (D34) for 30 days from the sign-in that passed it. Rate limited per IP and per email. The sign-in
 * form always says the same thing whether or not the email has an account.
 *
 * The owner's account is created on first use from MLO_OWNER_EMAIL. The
 * owner (and team leads, for loan officers and assistants) invites everyone
 * else on /mlo/team. During the switch from the old shared admin login,
 * HTTP Basic (MLO_ADMIN_USER / MLO_ADMIN_PASSWORD) still works unless
 * MLO_BASIC_AUTH="false".
 *
 * D94: Face ID (a passkey on the person's own device, lib/accounts/passkeys.ts)
 * is a whole sign-in on its own; it opens a session through openSession too.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { ALL_MLOS, ccAllMlos } from "@/lib/config";
import { ensureRegistry } from "@/lib/registry/cache";
import { emailConfig } from "@/lib/m8/server";
import { incr } from "@/lib/m8/kv";
import { accountStore, ROLES, type Role, type User } from "./store";
import { companyOfMlo } from "./company";
import { mfaOn, openCodeStep } from "./mfa";

export const SESSION_COOKIE = "lm8_cc_session";
/** D34: the 5-minute ticket between the emailed link and the authenticator code. */
export const MFA_COOKIE = "lm8_cc_mfa";
export const LINK_TTL_MS = 15 * 60 * 1000;
/**
 * D47: the browser that asked for a sign-in holds this (httpOnly, path
 * /sign-in, 15 minutes). The 6-digit code in the email only works together
 * with it, so typing the code signs in the computer that asked, even when
 * the email is read on a phone.
 */
export const PENDING_COOKIE = "lm8_cc_pending";
export const CODE_TRIES = 5;
const codeHash = (pending: string, code: string) => sha256(`code:${pending}:${code}`);
/** D89: a sign-in lasts 12 hours unless "Remember this device for 30 days" is ticked. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const sessionTtl = (remember: boolean) => (remember ? REMEMBER_TTL_MS : SESSION_TTL_MS);
/**
 * D89: a remembered device (httpOnly, path /sign-in, 30 days). Set only after the authenticator step is
 * passed with Remember ticked; it lets that device skip the step until it expires. The email step is
 * never skipped. Stored only as a hash beside the sessions ("dev:" prefix), so signing someone out
 * everywhere (disable, an authenticator reset) forgets it too; plain sign-out keeps it.
 */
export const DEVICE_COOKIE = "lm8_cc_device";
/** D89: carries the Remember tick from the email step to the authenticator step (path /sign-in, 5 minutes). */
export const REMEMBER_COOKIE = "lm8_cc_remember";
/** D94: carries the "Use Face ID to sign in on this device" tick to the authenticator step (path /sign-in, 5 minutes). */
export const FACEID_COOKIE = "lm8_cc_faceid";
const deviceHash = (t: string) => `dev:${sha256(`device:${t}`)}`;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const iso = (ms: number) => new Date(ms).toISOString();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ROLE_LABELS: Record<Role, string> = { owner: "Owner", team_lead: "Team lead", lo: "Loan officer", assistant: "Assistant" };

/** Who may invite or change whom. Owners: anyone. Team leads: loan officers and assistants. */
export function canManage(actor: User, targetRole: Role): boolean {
  if (actor.status !== "active") return false;
  if (actor.role === "owner") return true;
  return actor.role === "team_lead" && (targetRole === "lo" || targetRole === "assistant");
}

/** Pricing, setup, voice and training are admin areas. */
export const isAdmin = (u: User | null) => !!u && u.status === "active" && (u.role === "owner" || u.role === "team_lead");

/** Creates the owner account from MLO_OWNER_EMAIL the first time it's needed. */
export async function ensureOwner(now = Date.now()): Promise<void> {
  const email = process.env.MLO_OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return;
  const store = accountStore();
  if (await store.userByEmail(email)) return;
  const owner: User = { id: `u_${sha256(email).slice(0, 16)}`, email, name: ALL_MLOS[0]?.name ?? "Owner", role: "owner", mloId: ALL_MLOS[0]?.id ?? null, status: "active", createdAt: iso(now), createdBy: "MLO_OWNER_EMAIL" };
  await store.putUser(owner);
  await store.audit({ at: iso(now), actor: "system", action: "user.bootstrap_owner", detail: { userId: owner.id } });
}

async function sendLink(to: string, link: string, subject: string, lead: string): Promise<boolean> {
  const cfg = emailConfig();
  if (!cfg) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `LoanM8 <${cfg.from}>`,
        to: [to],
        subject,
        text: `${lead}\n\n${link}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
      }),
    });
    if (!res.ok) {
      // D46.1: say why in the server log (never the address, the link or the body), so a missing email can be traced.
      const err = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
      console.error(`[cc-email] Resend refused a sign-in email: ${res.status} ${err?.name ?? ""} ${(err?.message ?? "").replace(/[^\s@]+@[^\s@]+/g, "[address]").slice(0, 160)}`);
    }
    return res.ok;
  } catch (e) {
    console.error(`[cc-email] Couldn't reach Resend for a sign-in email: ${e instanceof Error ? e.name : "error"}`);
    return false;
  }
}

/** D47: the sign-in email: a 6-digit code for the device that asked, and a link for the device reading it. */
async function sendSignIn(to: string, link: string, code: string): Promise<boolean> {
  const cfg = emailConfig();
  if (!cfg) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `LoanM8 <${cfg.from}>`,
        to: [to],
        subject: `${code} is your LoanM8 sign-in code`,
        text: `Your MLO Command Center sign-in code is ${code}\n\nType it on the screen where you asked to sign in.\n\nOr, to sign in on the device you're reading this on, open this link:\n${link}\n\nThe code and the link each work once, for 15 minutes. If you didn't ask to sign in, ignore this email.`,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
      console.error(`[cc-email] Resend refused a sign-in email: ${res.status} ${err?.name ?? ""} ${(err?.message ?? "").replace(/[^\s@]+@[^\s@]+/g, "[address]").slice(0, 160)}`);
    }
    return res.ok;
  } catch (e) {
    console.error(`[cc-email] Couldn't reach Resend for a sign-in email: ${e instanceof Error ? e.name : "error"}`);
    return false;
  }
}

/**
 * The sign-in form. The answer never reveals whether the email has an
 * account: every success returns a fresh `pending` value for the cookie.
 */
export async function requestSignIn(emailRaw: string, origin: string, ipHash: string, now = Date.now()): Promise<{ ok: true; pending: string } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "Enter a valid email address." };
  const hour = Math.floor(now / 3_600_000);
  const [byIp, byEmail] = await Promise.all([incr(`cc:signin:ip:${ipHash}:${hour}`, 4000), incr(`cc:signin:em:${sha256(email).slice(0, 24)}:${hour}`, 4000)]);
  if (byIp > 10 || byEmail > 5) return { ok: false, error: "Too many sign-in requests. Try again in an hour." };
  if (!emailConfig()) return { ok: false, error: "Sign-in email isn't set up on this site yet (Resend)." };
  await ensureOwner(now);
  const store = accountStore();
  const user = await store.userByEmail(email);
  const pending = token();
  if (user && user.status === "active") {
    const t = token();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await store.putLoginToken(sha256(t), user.id, iso(now + LINK_TTL_MS));
    await store.putLoginToken(codeHash(pending, code), user.id, iso(now + LINK_TTL_MS));
    const sent = await sendSignIn(email, `${origin}/api/cc/verify?t=${encodeURIComponent(t)}`, code);
    await store.audit({ at: iso(now), actor: user.email, action: "signin.link_sent", detail: { sent } });
    if (sent) console.log("[cc-signin] sign-in link sent");
  } else {
    // D46.1: the page never says whether an account exists; the log does, without the address.
    console.warn(`[cc-signin] no active account for that email${process.env.MLO_OWNER_EMAIL?.trim() ? "" : " (MLO_OWNER_EMAIL isn't set here)"}`);
  }
  return { ok: true, pending };
}

/** D89: how the browser finishing sign-in asked: Remember ticked, and its remembered-device cookie if any. */
export type SignInOpts = { remember?: boolean; device?: string | null };

/** The emailed link. Returns a new session token for the cookie, or null. */
export async function verifySignIn(t: string, now = Date.now(), opts: SignInOpts = {}): Promise<{ session: string; user: User } | { mfa: string; user: User } | null> {
  if (!t || t.length > 100) return null;
  const userId = await accountStore().consumeLoginToken(sha256(t), iso(now));
  return userId ? finishSignIn(userId, now, opts) : null;
}

/** D89: whether this browser's remembered-device token is live and belongs to this person. */
export async function deviceTrusted(userId: string, device: string | null | undefined, now = Date.now()): Promise<boolean> {
  if (!device || device.length > 100) return false;
  return (await accountStore().sessionUser(deviceHash(device), iso(now))) === userId;
}

/** D89: remembers this device for 30 days after it passed the authenticator step. Returns the cookie value. */
export async function rememberDevice(user: User, now = Date.now()): Promise<string> {
  const store = accountStore();
  const t = token();
  await store.putSession(deviceHash(t), user.id, iso(now + REMEMBER_TTL_MS));
  await store.audit({ at: iso(now), actor: user.email, action: "signin.device_remembered", detail: {} });
  return t;
}

/** D89: forgets every device this person ticked Remember on (their current sign-ins and Face ID stay). */
export async function forgetDevices(user: User, now = Date.now()): Promise<number> {
  const n = await accountStore().deleteDevicesFor(user.id);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "signin.devices_forgotten", detail: { n } });
  return n;
}

/** The next step once the email step is passed: the phone code (D34), or a session. */
async function finishSignIn(userId: string, now: number, opts: SignInOpts = {}): Promise<{ session: string; user: User } | { mfa: string; user: User } | null> {
  const user = await accountStore().userById(userId);
  if (!user || user.status !== "active") return null;
  // D34: with an authenticator app on, the email step opens the code step instead of a session,
  // unless (D89) this is a device remembered after passing that step.
  if (await mfaOn(user.id)) {
    if (!(await deviceTrusted(user.id, opts.device, now))) return { mfa: await openCodeStep(user.id, now), user };
    return { session: await openSession(user, now, !!opts.remember, { device: true }), user };
  }
  return { session: await openSession(user, now, !!opts.remember), user };
}

/** D47: the 6-digit code from the email, typed in the browser that asked (its pending cookie). */
export async function verifySignInCode(pending: string | undefined, rawCode: string, now = Date.now(), opts: SignInOpts = {}): Promise<{ session: string; user: User } | { mfa: string; user: User } | { error: string; spent?: boolean }> {
  if (!pending || pending.length > 100) return { error: "That code has expired. Ask for a new one.", spent: true };
  const code = String(rawCode ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Enter the 6-digit code from the email." };
  if ((await incr(`cc:signin:code:${sha256(pending).slice(0, 24)}`, 1000)) > CODE_TRIES) return { error: "Too many tries. Ask for a new code.", spent: true };
  const userId = await accountStore().consumeLoginToken(codeHash(pending, code), iso(now));
  const done = userId ? await finishSignIn(userId, now, opts) : null;
  return done ?? { error: "That code doesn't match, or it has expired. Check the newest email, or ask for a new code." };
}

/** A new session for a user who has passed every sign-in step: 12 hours, or 30 days when remembered (D89). D94: or Face ID. */
export async function openSession(user: User, now = Date.now(), remember = false, note: { device?: boolean; passkey?: boolean } = {}): Promise<string> {
  const store = accountStore();
  const session = token();
  await store.putSession(sha256(session), user.id, iso(now + sessionTtl(remember)));
  await store.audit({ at: iso(now), actor: user.email, action: "signin.ok", detail: { remember, ...(note.device ? { rememberedComputer: true } : {}), ...(note.passkey ? { faceId: true } : {}) } });
  return session;
}

export async function userForSession(session: string | undefined, now = Date.now()): Promise<User | null> {
  if (!session) return null;
  // D45: signed-up loan officers' records, before anything reads them.
  await ensureRegistry();
  const store = accountStore();
  const id = await store.sessionUser(sha256(session), iso(now));
  if (!id) return null;
  const user = await store.userById(id);
  return user && user.status === "active" ? user : null;
}

/** The signed-in Command Center user for this request, or null. */
export async function currentUser(): Promise<User | null> {
  return userForSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const s = jar.get(SESSION_COOKIE)?.value;
  if (s) await accountStore().deleteSession(sha256(s));
  jar.delete(SESSION_COOKIE);
}

export type InviteInput = { email: string; name: string; role: string; mloId: string | null; assistsUserId?: string | null };

/** An assistant's loan officer must be an active account that has its own book, in the same company (D22). */
async function validAssist(id: string | null | undefined, assistantMloId: string | null = null): Promise<string | null> {
  if (!id) return null;
  const u = await accountStore().userById(id);
  if (!u || u.status !== "active" || u.role === "assistant") return null;
  if (assistantMloId && companyOfMlo(assistantMloId) !== companyOfMlo(u.mloId)) return null;
  return u.id;
}

/** Owner and team leads add people; the new user gets a sign-in link. */
export async function inviteUser(actor: User, input: InviteInput, origin: string, now = Date.now()): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 80);
  const role = input.role as Role;
  if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter their name." };
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: "Pick a role." };
  if (!canManage(actor, role)) return { ok: false, error: "Your role can't add that kind of account." };
  const mloId = input.mloId && ccAllMlos().some((m) => m.id === input.mloId) ? input.mloId : null;
  const store = accountStore();
  if (await store.userByEmail(email)) return { ok: false, error: "That email already has an account." };
  const assistsUserId = role === "assistant" ? await validAssist(input.assistsUserId, mloId ?? actor.mloId) : null;
  if (role === "assistant" && !assistsUserId) return { ok: false, error: "Pick the loan officer this assistant works for." };
  const user: User = { id: `u_${token().slice(0, 16)}`, email, name, role, mloId, assistsUserId, status: "active", createdAt: iso(now), createdBy: actor.email };
  await store.putUser(user);
  await store.audit({ at: iso(now), actor: actor.email, action: "user.invite", detail: { userId: user.id, role, mloId } });
  const t = token();
  await store.putLoginToken(sha256(t), user.id, iso(now + LINK_TTL_MS));
  const emailed = await sendLink(email, `${origin}/api/cc/verify?t=${encodeURIComponent(t)}`, "You've been added to MLO Command Center", `${actor.name} added you to MLO Command Center as ${ROLE_LABELS[role]}.${process.env.CC_PILOT?.trim() === "true" ? " You're one of the loan officers in the pilot: after you sign in, Home shows your first-day steps, and Report a problem is on every page." : ""} Sign in here:`);
  return { ok: true, emailed };
}

/** Change a role or disable/enable. Disabling signs them out everywhere. Nobody can lock out the last owner. */
export async function updateUser(actor: User, userId: string, change: { role?: string; status?: "active" | "disabled"; assistsUserId?: string | null }, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = accountStore();
  const target = await store.userById(userId);
  if (!target) return { ok: false, error: "No such account." };
  const role = (change.role ?? target.role) as Role;
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: "Pick a role." };
  if (!canManage(actor, target.role) || !canManage(actor, role)) return { ok: false, error: "Your role can't change that account." };
  const status = change.status ?? target.status;
  if (target.role === "owner" && (role !== "owner" || status !== "active")) {
    const owners = (await store.listUsers()).filter((u) => u.role === "owner" && u.status === "active");
    if (owners.length <= 1) return { ok: false, error: "There must always be an active owner." };
  }
  const assistsUserId = role === "assistant" ? await validAssist(change.assistsUserId !== undefined ? change.assistsUserId : target.assistsUserId, target.mloId ?? actor.mloId) : null;
  if (role === "assistant" && !assistsUserId) return { ok: false, error: "Pick the loan officer this assistant works for." };
  await store.putUser({ ...target, role, status, assistsUserId });
  if (status === "disabled") {
    await store.deleteSessionsFor(target.id);
    // D94: a disabled account's Face ID devices go too (a passkey for a disabled account signs nobody in either way).
    const n = await store.deletePasskeysFor(target.id);
    if (n) await store.audit({ at: iso(now), actor: actor.email, action: "passkey.remove_all", detail: { userId, n } });
  }
  await store.audit({ at: iso(now), actor: actor.email, action: "user.update", detail: { userId, role, status } });
  return { ok: true };
}
