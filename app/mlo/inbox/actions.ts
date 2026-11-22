"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash, type Flash } from "@/lib/mlo/flash";
import { markDone, markNotDone, replyFromInbox, snoozeThread, unsnooze } from "@/lib/inbox/service";
import { tabOf, whenIn, zoneLabel } from "@/lib/inbox/state";
import { zoneFor } from "@/lib/profile/prefs";
import { inboxCopy as ic } from "@/lib/content/inbox";

/**
 * D79: the Inbox's buttons. Every value they carry is bound
 * (`doneAction.bind(null, contactId, tab)`), never a name/value pair, and
 * each address back is rebuilt from known keys.
 */
const ID = /^c_[A-Za-z0-9_-]{6,40}$/;
const back = (tab: string, contactId: string | null, f: Flash) => `/mlo/inbox?tab=${tabOf(tab)}${contactId && ID.test(contactId) ? `&c=${encodeURIComponent(contactId)}` : ""}&f=${encodeFlash(f)}`;

async function who() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

export async function doneAction(contactId: string, tab: string): Promise<void> {
  const u = await who();
  const r = await markDone(u, contactId);
  redirect(back(tab, null, r.ok ? { ok: true, lines: [ic.flash.done(r.first)] } : { ok: false, lines: [ic.flash.nope] }));
}

export async function notDoneAction(contactId: string, tab: string): Promise<void> {
  const u = await who();
  const r = await markNotDone(u, contactId);
  redirect(back(tab, contactId, r.ok ? { ok: true, lines: [ic.flash.notDone] } : { ok: false, lines: [ic.flash.nope] }));
}

export async function snoozeAction(contactId: string, tab: string): Promise<void> {
  const u = await who();
  const r = await snoozeThread(u, contactId);
  const zone = await zoneFor(u);
  redirect(back(tab, null, r.ok ? { ok: true, lines: [ic.flash.snoozed(r.first, `${whenIn(r.until!, zone)} ${zoneLabel(zone)} time`)] } : { ok: false, lines: [ic.flash.nope] }));
}

export async function unsnoozeAction(contactId: string, tab: string): Promise<void> {
  const u = await who();
  const r = await unsnooze(u, contactId);
  redirect(back(tab, contactId, r.ok ? { ok: true, lines: [ic.flash.unsnoozed] } : { ok: false, lines: [ic.flash.nope] }));
}

const purposeOf = (fd: FormData) => (fd.get("purpose") === "marketing" ? "marketing" : "service");

/** A text through Command Center's registered texting (the gate decides). */
export async function replyTextAction(contactId: string, tab: string, fd: FormData): Promise<void> {
  const u = await who();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const r = await replyFromInbox(u, contactId, { via: "text", body: String(fd.get("body") ?? ""), purpose: purposeOf(fd), statusCallback: `${origin}/api/twilio/status` });
  const zone = await zoneFor(u);
  redirect(back(tab, contactId, r.ok ? { ok: true, lines: [ic.flash.sent] } : { ok: false, lines: [r.error, ...(r.retryAt ? [ic.reply.window(whenIn(r.retryAt, zone), zoneLabel(zone))] : [])] }));
}

/** An email (their own mailbox when connected), through the gate. */
export async function replyEmailAction(contactId: string, tab: string, fd: FormData): Promise<void> {
  const u = await who();
  const r = await replyFromInbox(u, contactId, { via: "email", subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? ""), purpose: purposeOf(fd) });
  redirect(back(tab, contactId, r.ok ? { ok: true, lines: [ic.flash.emailSent] } : { ok: false, lines: [r.error] }));
}

/** "Draft a reply for me": the Concierge prepares one; nothing is sent. */
export async function draftReplyAction(contactId: string, tab: string): Promise<void> {
  const u = await who();
  const { draftReply } = await import("@/lib/concierge/agent");
  const r = await draftReply(u, contactId).catch(() => ({ kind: "none" as const }));
  const line = r.kind === "made" || r.kind === "exists" ? ic.draft.made : r.kind === "template" ? ic.draft.template : r.kind === "personal" ? ic.draft.personal : r.kind === "off" ? ic.draft.off : "reason" in r && r.reason ? ic.draft.noneBecause(r.reason) : ic.draft.none;
  redirect(back(tab, contactId, { ok: r.kind !== "none" && r.kind !== "skip" && r.kind !== "off", lines: [line] }));
}

/** Approve the Concierge's draft (bound: contact, tab and the draft's id). Sent through the gate. */
export async function approveDraftAction(contactId: string, tab: string, draftId: string, fd: FormData): Promise<void> {
  const u = await who();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { approve } = await import("@/lib/concierge/desk");
  const r = await approve(u, draftId, fd.has("body") ? String(fd.get("body")) : null, `${origin}/api/twilio/status`);
  redirect(back(tab, contactId, { ok: r.ok, lines: [r.ok ? ic.draft.approved : r.error] }));
}

export async function skipDraftAction(contactId: string, tab: string, draftId: string): Promise<void> {
  const u = await who();
  const { dismiss } = await import("@/lib/concierge/desk");
  await dismiss(u, draftId);
  redirect(back(tab, contactId, { ok: true, lines: [ic.draft.skipped] }));
}
