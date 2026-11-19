/**
 * lib/accounts/auth.ts — Command Center sign-in, sessions and roles (D1).
 * SERVER-ONLY.
 *
 * Sign-in is an emailed one-time link (no passwords): 15 minutes, single
 * use. It opens a session: a random token in an httpOnly cookie, 14 days,
 * stored only as a hash. Rate limited per IP and per email. The sign-in
 * form always says the same thing whether or not the email has an account.
 *
 * The owner's account is created on first use from MLO_OWNER_EMAIL. The
 * owner (and team leads, for loan officers and assistants) invites everyone
 * else on /mlo/team. During the switch from the old shared admin login,
 * HTTP Basic (MLO_ADMIN_USER / MLO_ADMIN_PASSWORD) still works unless
 * MLO_BASIC_AUTH="false".
 */
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ALL_MLOS } from "@/lib/config";
import { emailConfig } from "@/lib/m8/server";
import { incr } from "@/lib/m8/kv";
import { accountStore, ROLES, type Role, type User } from "./store";
import { companyOfMlo } from "./company";
import { mfaOn, openCodeStep } from "./mfa";

export const SESSION_COOKIE = "lm8_cc_session";
/** D34: the 5-minute ticket between the emailed link and the authenticator code. */
export const MFA_COOKIE = "lm8_cc_mfa";
export const LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
    return res.ok;
  } catch {
    return false;
  }
}

/** The sign-in form. The answer never reveals whether the email has an account. */
export async function requestSignIn(emailRaw: string, origin: string, ipHash: string, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "Enter a valid email address." };
  const hour = Math.floor(now / 3_600_000);
  const [byIp, byEmail] = await Promise.all([incr(`cc:signin:ip:${ipHash}:${hour}`, 4000), incr(`cc:signin:em:${sha256(email).slice(0, 24)}:${hour}`, 4000)]);
  if (byIp > 10 || byEmail > 5) return { ok: false, error: "Too many sign-in requests. Try again in an hour." };
  if (!emailConfig()) return { ok: false, error: "Sign-in email isn't set up on this site yet (Resend)." };
  await ensureOwner(now);
  const store = accountStore();
  const user = await store.userByEmail(email);
  if (user && user.status === "active") {
    const t = token();
    await store.putLoginToken(sha256(t), user.id, iso(now + LINK_TTL_MS));
    const sent = await sendLink(email, `${origin}/api/cc/verify?t=${encodeURIComponent(t)}`, "Your LoanM8 sign-in link", "Here's your link to sign in to LoanM8 Command Center:");
    await store.audit({ at: iso(now), actor: user.email, action: "signin.link_sent", detail: { sent } });
  }
  return { ok: true };
}

/** The emailed link. Returns a new session token for the cookie, or null. */
export async function verifySignIn(t: string, now = Date.now()): Promise<{ session: string; user: User } | { mfa: string; user: User } | null> {
  if (!t || t.length > 100) return null;
  const store = accountStore();
  const userId = await store.consumeLoginToken(sha256(t), iso(now));
  if (!userId) return null;
  const user = await store.userById(userId);
  if (!user || user.status !== "active") return null;
  // D34: with an authenticator app on, the link opens the code step instead of a session.
  if (await mfaOn(user.id)) return { mfa: await openCodeStep(user.id, now), user };
  return { session: await openSession(user, now), user };
}

/** A new session for a user who has passed every sign-in step. */
export async function openSession(user: User, now = Date.now()): Promise<string> {
  const store = accountStore();
  const session = token();
  await store.putSession(sha256(session), user.id, iso(now + SESSION_TTL_MS));
  await store.audit({ at: iso(now), actor: user.email, action: "signin.ok", detail: {} });
  return session;
}

export async function userForSession(session: string | undefined, now = Date.now()): Promise<User | null> {
  if (!session) return null;
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
  const mloId = input.mloId && ALL_MLOS.some((m) => m.id === input.mloId) ? input.mloId : null;
  const store = accountStore();
  if (await store.userByEmail(email)) return { ok: false, error: "That email already has an account." };
  const assistsUserId = role === "assistant" ? await validAssist(input.assistsUserId, mloId ?? actor.mloId) : null;
  if (role === "assistant" && !assistsUserId) return { ok: false, error: "Pick the loan officer this assistant works for." };
  const user: User = { id: `u_${token().slice(0, 16)}`, email, name, role, mloId, assistsUserId, status: "active", createdAt: iso(now), createdBy: actor.email };
  await store.putUser(user);
  await store.audit({ at: iso(now), actor: actor.email, action: "user.invite", detail: { userId: user.id, role, mloId } });
  const t = token();
  await store.putLoginToken(sha256(t), user.id, iso(now + LINK_TTL_MS));
  const emailed = await sendLink(email, `${origin}/api/cc/verify?t=${encodeURIComponent(t)}`, "You've been added to LoanM8 Command Center", `${actor.name} added you to LoanM8 Command Center as ${ROLE_LABELS[role]}.${process.env.CC_PILOT?.trim() === "true" ? " You're one of the loan officers in the pilot: after you sign in, Home shows your first-day steps, and Report a problem is on every page." : ""} Sign in here:`);
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
  if (status === "disabled") await store.deleteSessionsFor(target.id);
  await store.audit({ at: iso(now), actor: actor.email, action: "user.update", detail: { userId, role, status } });
  return { ok: true };
}
