/**
 * lib/mail/service.ts — sending from a loan officer's own mailbox (D52).
 * SERVER-ONLY.
 *
 * Once someone connects Gmail or Microsoft 365, every email Command Center
 * sends for them (contact page, Concierge, campaigns) goes from that mailbox:
 * their own address, a copy in their Sent folder (their company keeps it),
 * and replies straight back to them. If the provider refuses the saved
 * connection, the mailbox is marked "reconnect" and sending stops with a
 * plain message. It never falls back to sending from another address.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { buildMime, base64url } from "./mime";
import { exchangeCode, grantedSend, mailboxAddress, mailFetch, refreshTokens, revoke, TokenError, PROVIDER_LABEL } from "./oauth";
import { seal, unseal } from "./seal";
import { mailboxStore, type Mailbox, type MailProvider } from "./store";

export type MailboxView = { provider: MailProvider; label: string; email: string; status: Mailbox["status"]; connectedAt: string; lastSentAt: string | null; lastError: string };

export async function mailboxFor(user: Pick<User, "id">): Promise<MailboxView | null> {
  const m = await mailboxStore().get(user.id).catch(() => null);
  return m ? { provider: m.provider, label: PROVIDER_LABEL[m.provider], email: m.email, status: m.status, connectedAt: m.connectedAt, lastSentAt: m.lastSentAt, lastError: m.lastError } : null;
}

export type ConnectResult = { ok: true; email: string } | { ok: false; error: string };

/** Finish the sign-in: swap the code for tokens, check the send permission, keep them sealed. */
export async function connectMailbox(user: User, p: MailProvider, code: string, verifier: string, origin: string, now = new Date()): Promise<ConnectResult> {
  let t;
  try {
    t = await exchangeCode(p, code, verifier, origin, now);
  } catch (e) {
    const c = e instanceof TokenError ? e.code : "error";
    console.warn(`[mail] ${p} code exchange failed: ${c}`);
    return { ok: false, error: c === "not_configured" ? `${PROVIDER_LABEL[p]} isn't set up for Command Center yet.` : `${PROVIDER_LABEL[p]} didn't finish the connection. Try again.` };
  }
  if (!grantedSend(p, t.scope)) return { ok: false, error: `Command Center needs permission to send email. Try again and leave "send email on your behalf" ticked.` };
  if (!t.refresh) return { ok: false, error: `${PROVIDER_LABEL[p]} didn't give a lasting connection. Try again.` };
  const email = await mailboxAddress(p, t.access);
  if (!email) return { ok: false, error: `Couldn't read the mailbox's address from ${PROVIDER_LABEL[p]}. Try again.` };
  const old = await mailboxStore().get(user.id).catch(() => null);
  if (old && (old.provider !== p || old.email !== email)) await revoke(old.provider, unseal(old.refreshSealed) ?? "").catch(() => null);
  await mailboxStore().put({ userId: user.id, provider: p, email, refreshSealed: seal(t.refresh), accessSealed: seal(t.access), accessExpiresAt: t.expiresAt, connectedAt: now.toISOString(), status: "connected", lastError: "", lastSentAt: null });
  await accountStore().audit({ at: now.toISOString(), actor: user.email, action: "mail.connect", detail: { provider: p } });
  return { ok: true, email };
}

export async function disconnectMailbox(user: User, now = new Date()): Promise<boolean> {
  const m = await mailboxStore().get(user.id);
  if (!m) return false;
  await revoke(m.provider, unseal(m.refreshSealed) ?? "").catch(() => null);
  await mailboxStore().remove(user.id);
  await accountStore().audit({ at: now.toISOString(), actor: user.email, action: "mail.disconnect", detail: { provider: m.provider } });
  return true;
}

const RECONNECT = (p: MailProvider) => `Reconnect your email: ${PROVIDER_LABEL[p]} stopped accepting Command Center's connection (the permission was removed or the password changed). Open Email in Settings.`;

async function markBroken(m: Mailbox, why: string): Promise<void> {
  await mailboxStore().put({ ...m, status: "needs_reconnect", lastError: why, accessSealed: null, accessExpiresAt: null });
  if (m.status !== "connected") return;
  // Tell them once, from the platform address (their own mailbox is what broke).
  try {
    const [{ resendMail }, u] = await Promise.all([import("@/lib/pilot/service"), accountStore().userById(m.userId)]);
    if (u?.email) await resendMail({ to: u.email, subject: "Reconnect your email in Command Center", text: `Command Center can no longer send from ${m.email} (${PROVIDER_LABEL[m.provider]}): ${why}\n\nNothing is being sent from another address meanwhile. Campaign emails wait until you reconnect.\n\nOpen Command Center, then Settings, then Email, and connect it again.` });
  } catch {
    /* best effort */
  }
}

/** A working access token, refreshed when it's within a minute of running out. */
async function accessFor(m: Mailbox, now: Date, force = false): Promise<{ ok: true; token: string; m: Mailbox } | { ok: false; error: string }> {
  const cached = unseal(m.accessSealed);
  if (!force && cached && m.accessExpiresAt && Date.parse(m.accessExpiresAt) - 60_000 > now.getTime()) return { ok: true, token: cached, m };
  const refresh = unseal(m.refreshSealed);
  if (!refresh) {
    await markBroken(m, "The saved connection couldn't be read.");
    return { ok: false, error: RECONNECT(m.provider) };
  }
  try {
    const t = await refreshTokens(m.provider, refresh, now);
    const next: Mailbox = { ...m, accessSealed: seal(t.access), accessExpiresAt: t.expiresAt, refreshSealed: t.refresh ? seal(t.refresh) : m.refreshSealed };
    await mailboxStore().put(next);
    return { ok: true, token: t.access, m: next };
  } catch (e) {
    const code = e instanceof TokenError ? e.code : "error";
    if (code === "invalid_grant" || code === "unauthorized_client" || code === "invalid_client") {
      await markBroken(m, code === "invalid_grant" ? "The permission was removed or has expired." : "The app's sign-in settings changed.");
      return { ok: false, error: RECONNECT(m.provider) };
    }
    return { ok: false, error: `${PROVIDER_LABEL[m.provider]} didn't answer. It will be tried again.` };
  }
}

export type MailMsg = { fromName: string; to: string; subject: string; text: string };
export type MailboxSend = { ok: true; id: string | null; from: string } | { ok: false; error: string; reconnect?: boolean };

async function post(m: Mailbox, token: string, msg: MailMsg, now: Date): Promise<Response | null> {
  try {
    if (m.provider === "google") {
      const raw = base64url(buildMime({ fromName: msg.fromName, fromEmail: m.email, to: msg.to, subject: msg.subject, text: msg.text }, now));
      return await mailFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
    }
    return await mailFetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject: msg.subject.replace(/[\r\n]+/g, " "), body: { contentType: "Text", content: msg.text }, toRecipients: [{ emailAddress: { address: msg.to } }] }, saveToSentItems: true }),
    });
  } catch {
    return null;
  }
}

/** Send one plain-text email from the person's own mailbox. */
export async function sendFromMailbox(user: Pick<User, "id">, msg: MailMsg, now = new Date()): Promise<MailboxSend> {
  const m0 = await mailboxStore().get(user.id).catch(() => null);
  if (!m0) return { ok: false, error: "No mailbox is connected." };
  if (m0.status !== "connected") return { ok: false, error: RECONNECT(m0.provider), reconnect: true };
  let a = await accessFor(m0, now);
  if (!a.ok) return { ok: false, error: a.error, reconnect: a.error.startsWith("Reconnect") };
  let res = await post(a.m, a.token, msg, now);
  if (res?.status === 401) {
    a = await accessFor(a.m, now, true);
    if (!a.ok) return { ok: false, error: a.error, reconnect: a.error.startsWith("Reconnect") };
    res = await post(a.m, a.token, msg, now);
  }
  if (!res) return { ok: false, error: `${PROVIDER_LABEL[a.m.provider]} didn't answer. Try again.` };
  if (res.status === 401 || res.status === 403) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    // 403 for a sending limit isn't a broken connection.
    if (res.status === 403 && /rateLimit|quota|limit/i.test(detail)) return { ok: false, error: `${PROVIDER_LABEL[a.m.provider]} says this mailbox hit its daily sending limit. It will be tried again.` };
    await markBroken(a.m, "The mailbox refused the send permission.");
    return { ok: false, error: RECONNECT(a.m.provider), reconnect: true };
  }
  if (res.status === 429) return { ok: false, error: `${PROVIDER_LABEL[a.m.provider]} asked Command Center to slow down. It will be tried again.` };
  if (!res.ok) {
    console.warn(`[mail] ${a.m.provider} send failed: ${res.status}`);
    return { ok: false, error: `${PROVIDER_LABEL[a.m.provider]} didn't accept the email.` };
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  await mailboxStore().put({ ...a.m, lastSentAt: now.toISOString(), lastError: "" });
  return { ok: true, id: j.id ?? `ms_${randomBytes(6).toString("base64url")}`, from: a.m.email };
}

/** A note to the person's own mailbox, to see it work end to end. */
export async function sendTestToSelf(user: User, now = new Date()): Promise<MailboxSend> {
  const m = await mailboxFor(user);
  if (!m) return { ok: false, error: "No mailbox is connected." };
  return sendFromMailbox(user, { fromName: user.name || "LoanM8 Command Center", to: m.email, subject: "Test from LoanM8 Command Center", text: `This is a test from LoanM8 Command Center.\n\nEmails you send to clients from Command Center now go from ${m.email}, land in your Sent folder, and replies come back here.` }, now);
}
