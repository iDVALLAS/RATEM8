/**
 * lib/inbox/service.ts — the Inbox (D79). SERVER-ONLY.
 *
 * Every read and write is for the viewer's own book (`canSee`; an assistant
 * works the book of the loan officer they assist). Replies go through the
 * same senders as a contact's page (`sendText`, "Text from my phone",
 * `sendEmail`), so permission, stops, do-not-call, holds, quiet hours where
 * they live, caps and the sign-off all apply. Done and Snooze never send
 * anything and never touch permission.
 */
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { canSee, scopeOf } from "@/lib/contacts/service";
import { contactStore, type Contact, type Purpose } from "@/lib/contacts/store";
import { touchStore, type Touch } from "@/lib/messaging/store";
import { zoneFor } from "@/lib/profile/prefs";
import { inboxStore } from "./store";
import { threadState, tomorrowAt, type InboxMark, type ThreadState } from "./state";

export type InboxThread = { contact: Contact; latest: Touch; state: ThreadState; mark: InboxMark | null };

/** Conversations in the viewer's book, newest first, with where each stands. */
export async function inboxThreads(user: User, now = new Date(), limit = 100): Promise<InboxThread[]> {
  const latest = await touchStore().threads(scopeOf(user), limit);
  const people = await Promise.all(latest.map((t) => contactStore().get(t.contactId).catch(() => null)));
  const marks = new Map((await inboxStore().many(latest.map((t) => t.contactId)).catch(() => [])).map((m) => [m.contactId, m]));
  const out: InboxThread[] = [];
  latest.forEach((t, i) => {
    const c = people[i];
    if (!c || !canSee(user, c)) return;
    const mark = marks.get(c.id) ?? null;
    out.push({ contact: c, latest: t, state: threadState(t, mark, now), mark });
  });
  return out;
}

/** The phone tab's badge and Home's chip: conversations waiting on a reply. */
export async function needsReplyCount(user: User, now = new Date()): Promise<number> {
  const latest = (await touchStore().threads(scopeOf(user), 200)).filter((t) => t.direction === "in");
  if (!latest.length) return 0;
  const marks = new Map((await inboxStore().many(latest.map((t) => t.contactId)).catch(() => [])).map((m) => [m.contactId, m]));
  return latest.filter((t) => threadState(t, marks.get(t.contactId) ?? null, now) === "needs").length;
}

async function mine(user: User, contactId: string): Promise<Contact | null> {
  const c = await contactStore().get(contactId);
  return c && canSee(user, c) ? c : null;
}

async function save(user: User, c: Contact, change: Partial<InboxMark>, action: string, now: Date) {
  const cur = await inboxStore().get(c.id);
  const at = now.toISOString();
  await inboxStore().put({ contactId: c.id, ownerUserId: c.ownerUserId, doneAt: null, snoozedAt: null, snoozeUntil: null, ...cur, ...change, by: user.email, updatedAt: at });
  await accountStore().audit({ at, actor: user.email, action, detail: { contactId: c.id } });
}

export type MarkResult = { ok: true; first: string; until?: string } | { ok: false };

/** Done: everything up to now is handled. A new message from them brings it back. */
export async function markDone(user: User, contactId: string, now = new Date()): Promise<MarkResult> {
  const c = await mine(user, contactId);
  if (!c) return { ok: false };
  await save(user, c, { doneAt: now.toISOString(), snoozedAt: null, snoozeUntil: null }, "inbox.done", now);
  return { ok: true, first: c.firstName || "them" };
}

export async function markNotDone(user: User, contactId: string, now = new Date()): Promise<MarkResult> {
  const c = await mine(user, contactId);
  if (!c) return { ok: false };
  await save(user, c, { doneAt: null }, "inbox.reopen", now);
  return { ok: true, first: c.firstName || "them" };
}

/** Snooze until 9 AM tomorrow, in the loan officer's own time zone. */
export async function snoozeThread(user: User, contactId: string, now = new Date()): Promise<MarkResult> {
  const c = await mine(user, contactId);
  if (!c) return { ok: false };
  const until = tomorrowAt(now, await zoneFor(user), 9).toISOString();
  await save(user, c, { snoozedAt: now.toISOString(), snoozeUntil: until, doneAt: null }, "inbox.snooze", now);
  return { ok: true, first: c.firstName || "them", until };
}

export async function unsnooze(user: User, contactId: string, now = new Date()): Promise<MarkResult> {
  const c = await mine(user, contactId);
  if (!c) return { ok: false };
  await save(user, c, { snoozedAt: null, snoozeUntil: null }, "inbox.unsnooze", now);
  return { ok: true, first: c.firstName || "them" };
}

export type InboxReply =
  | { via: "text"; body: string; purpose: Purpose; statusCallback: string | null }
  | { via: "phone"; body: string; purpose: Purpose }
  | { via: "email"; subject: string; body: string; purpose: Purpose };
export type ReplyOutcome = { ok: true; href?: string } | { ok: false; error: string; retryAt?: string | null };

/** A reply from the Inbox, through the same senders (and so the same gate) as a contact's page. */
export async function replyFromInbox(user: User, contactId: string, r: InboxReply, now = new Date()): Promise<ReplyOutcome> {
  if (!(await mine(user, contactId))) return { ok: false, error: "No such contact." };
  if (r.via === "text") {
    const { sendText } = await import("@/lib/messaging/service");
    return sendText(user, contactId, r.body, r.purpose, r.statusCallback, now);
  }
  if (r.via === "phone") {
    const { textFromPhone } = await import("@/lib/messaging/phone");
    const x = await textFromPhone(user, contactId, r.body, r.purpose, now);
    return x.ok ? { ok: true, href: x.href } : x;
  }
  const { sendEmail } = await import("@/lib/messaging/email");
  return sendEmail(user, contactId, r.subject, r.body, r.purpose, now);
}
