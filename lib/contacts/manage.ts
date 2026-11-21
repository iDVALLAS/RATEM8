/**
 * lib/contacts/manage.ts — adding, editing and merging people by hand, plus
 * the contact page's one-tap actions (D77). SERVER-ONLY.
 *
 * Rules:
 *  - every read and write checks `canSee`; an assistant adds and edits in
 *    the book of the loan officer they assist;
 *  - editing never touches the consent log except to append: a new phone or
 *    email sets permission given for the old one back to nothing on file
 *    ("reset", never a stop), and a stop always stays;
 *  - a new phone clears its line type, do-not-call and reassigned-number checks;
 *  - a merge keeps the stricter permission (lib/contacts/merge.ts), copies the
 *    other record's history in, moves its messages, notes, reminders, loans
 *    and campaigns, and is audited (ids and counts only);
 *  - nothing here sends anything; Call only logs a hand-dialed call the gate allows.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { campaignStore } from "@/lib/campaigns/store";
import { enroll } from "@/lib/campaigns/service";
import { conciergeStore } from "@/lib/concierge/store";
import { checkNote } from "@/lib/concierge/guard";
import { gateFor } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import { canSee } from "./service";
import { changedFields, checkEdit, type EditField, type EditInput } from "./editing";
import { mergeConsent, mergeFields, nameOf, type PairOutcome } from "./merge";
import { lastFour } from "./normalize";
import { CHANNELS, contactStore, liveEntries, PROVENANCE, PURPOSES, type Channel, type ConsentEntry, type Contact, type Provenance } from "./store";

const PHONE: Channel[] = ["call", "ai_call", "text"];
const cid = () => `c_${randomBytes(9).toString("base64url")}`;
const audit = (actor: User, at: string, action: string, detail: Record<string, string | number | boolean | null>) => accountStore().audit({ at, actor: actor.email, action, detail });

/** Whose book a hand-added person goes in: an assistant's officer's, everyone else's own. */
export function addOwner(actor: User): string | null {
  if (actor.status !== "active") return null;
  if (actor.role === "assistant") return actor.assistsUserId || null;
  return actor.id;
}

/** People in the same book with this record's phone (main or other) or email. */
export async function possibleMatches(actor: User, c: Contact): Promise<Contact[]> {
  const found = await contactStore().findMatches(c.ownerUserId, [c.phone, c.phone2].filter(Boolean) as string[], c.email ? [c.email] : []);
  return found.filter((x) => x.id !== c.id && x.kind === c.kind && canSee(actor, x)).slice(0, 10);
}

/** "Merge with…" search: the same book and kind, not this record. */
export async function searchBook(actor: User, c: Contact, q: string): Promise<Contact[]> {
  const term = q.trim().slice(0, 80);
  if (!term || !canSee(actor, c)) return [];
  const { contacts } = await contactStore().list({ ownerUserId: c.ownerUserId, kind: c.kind, q: term, limit: 11 });
  return contacts.filter((x) => x.id !== c.id && canSee(actor, x)).slice(0, 10);
}

export type AddInput = EditInput & { how?: string; provenance?: string; brokerage?: string };
export type FormResult = { ok: true; id: string; message: string } | { ok: false; errors: Partial<Record<EditField | "how" | "provenance" | "form", string>>; existingId?: string };

/** "Add a person" (or an agent) from the Contacts list. */
export async function addContact(actor: User, kind: "contact" | "agent", input: AddInput, now = new Date()): Promise<FormResult> {
  const owner = addOwner(actor);
  if (!owner) return { ok: false, errors: { form: cp.errors.noBook } };
  const chk = checkEdit(input, kind);
  const provenance = String(input.provenance ?? "personal") as Provenance;
  const errors: Partial<Record<EditField | "how" | "provenance" | "form", string>> = chk.ok ? {} : { ...chk.errors };
  if (!(PROVENANCE as readonly string[]).includes(provenance)) errors.provenance = cp.errors.relationship;
  const how = String(input.how ?? "").replace(/\s+/g, " ").trim();
  if (how.length > 200) errors.how = cp.errors.long(cp.add.how);
  const brokerage = String(input.brokerage ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!chk.ok || Object.keys(errors).length) return { ok: false, errors };
  const v = chk.values;
  const dup = (await contactStore().findMatches(owner, [v.phone, v.phone2].filter(Boolean) as string[], v.email ? [v.email] : [])).find((x) => x.kind === kind);
  if (dup) return { ok: false, errors: { form: cp.errors.exists(nameOf(dup)) }, existingId: dup.id };
  const at = now.toISOString();
  const c: Contact = {
    ...v,
    notes: [how ? cp.add.howNote(how) : null, v.notes].filter(Boolean).join("\n") || null,
    tags: [],
    loan: null,
    agent: kind === "agent" ? { brokerage: brokerage || null, units: null, volume: null, buyerUnits: null, listingUnits: null, avgPrice: null, topLender: null } : null,
    id: cid(),
    ownerUserId: owner,
    kind,
    provenance,
    // A previous employer's list is held until released, the same as an import.
    locked: provenance === "prior_employer",
    source: "added by hand",
    createdAt: at,
    updatedAt: at,
  };
  await contactStore().put(c);
  await audit(actor, at, "contact.add", { contactId: c.id, kind, provenance, ...(owner !== actor.id ? { book: owner } : {}) });
  return { ok: true, id: c.id, message: cp.add.added(nameOf(c)) };
}

export type EditResult = { ok: true; changed: EditField[]; phoneChanged: boolean; emailChanged: boolean; resets: number; sameAs: Contact | null } | { ok: false; errors: Partial<Record<EditField | "form", string>> };

/**
 * Saves the Details form. A changed phone clears the number's checks and,
 * like a changed email, sets the permission given for the old one back to
 * nothing on file (a new entry; a stop stays the latest answer).
 */
export async function updateContact(actor: User, id: string, input: EditInput, now = new Date()): Promise<EditResult> {
  const store = contactStore();
  const c = await store.get(id);
  if (!c || !canSee(actor, c)) return { ok: false, errors: { form: cp.errors.gone } };
  const chk = checkEdit(input, c.kind);
  if (!chk.ok) return { ok: false, errors: chk.errors };
  const v = chk.values;
  const changed = changedFields(c, v);
  if (!changed.length) return { ok: true, changed, phoneChanged: false, emailChanged: false, resets: 0, sameAs: null };
  const at = now.toISOString();
  const phoneChanged = (c.phone ?? null) !== v.phone;
  const emailChanged = (c.email ?? null) !== v.email;
  const next: Contact = { ...c, ...v, updatedAt: at };
  if (phoneChanged) {
    // The checks were for the old number.
    next.line = null;
    next.dnc = null;
    next.rnd = null;
  }
  await store.put(next);
  let resets = 0;
  if (phoneChanged || emailChanged) {
    const log = liveEntries(await store.consents(c.id));
    for (const ch of CHANNELS) {
      const isPhone = PHONE.includes(ch);
      if (isPhone ? !phoneChanged : !emailChanged) continue;
      for (const p of PURPOSES) {
        const last = log.filter((e) => e.channel === ch && e.purpose === p).sort((a, b) => a.at.localeCompare(b.at)).pop();
        if (!last || !last.granted) continue; // nothing on file, or a stop (which stays)
        const proof = isPhone ? `Phone changed (was ${lastFour(c.phone)}): permission for the old number doesn't cover the new one` : "Email changed: permission for the old address doesn't cover the new one";
        await store.addConsent({ contactId: c.id, channel: ch, purpose: p, granted: false, evidence: "reset", proof, at, actor: actor.email });
        resets++;
      }
    }
  }
  const sameAs = (await possibleMatches(actor, next))[0] ?? null;
  await audit(actor, at, "contact.edit", { contactId: c.id, fields: changed.join(","), phoneChanged, emailChanged, resets, ...(c.ownerUserId !== actor.id ? { book: c.ownerUserId } : {}) });
  return { ok: true, changed, phoneChanged, emailChanged, resets, sameAs };
}

/** A note for the loan officer and their team, checked like an after-call note (no protected topics or someone's numbers). */
export async function addNote(actor: User, id: string, text: string, now = new Date()): Promise<{ ok: boolean; message: string }> {
  const store = contactStore();
  const c = await store.get(id);
  if (!c || !canSee(actor, c)) return { ok: false, message: cp.errors.gone };
  const n = checkNote(text);
  if (!n.ok) return { ok: false, message: cp.compose.noteBad };
  const at = now.toISOString();
  await store.put({ ...c, notes: [c.notes, `Note (${at.slice(0, 10)}): ${n.text}`].filter(Boolean).join("\n").slice(-4000), updatedAt: at });
  await audit(actor, at, "contact.note", { contactId: c.id });
  return { ok: true, message: cp.compose.noteSaved };
}

/**
 * The header's Call: the gate decides (a stop, a hold or no number means no),
 * then the call is logged on their conversation (it counts toward the daily
 * call cap) and the phone app opens with the number.
 */
export async function logDial(actor: User, id: string, now = new Date()): Promise<{ ok: true; tel: string } | { ok: false; error: string }> {
  const c = await contactStore().get(id);
  if (!c || !canSee(actor, c)) return { ok: false, error: cp.errors.gone };
  if (!c.phone) return { ok: false, error: cp.noPhone };
  const [svc, mkt] = await Promise.all([gateFor(actor, c, "call", "service", now), gateFor(actor, c, "call", "marketing", now)]);
  const d = mkt.allowed ? mkt : svc;
  if (!d.allowed) return { ok: false, error: svc.reasons[0] ?? mkt.reasons[0] ?? cp.errors.gone };
  const at = now.toISOString();
  await touchStore().add({ id: `t_${randomBytes(9).toString("base64url")}`, contactId: c.id, ownerUserId: c.ownerUserId, channel: "call", purpose: mkt.allowed ? "marketing" : "service", direction: "out", body: cp.dial.logged, status: "dialed", providerId: null, phone: c.phone, note: d.basis, at, actor: actor.email, origin: "human" });
  await audit(actor, at, "call.dialed", { contactId: c.id });
  return { ok: true, tel: c.phone };
}

export const REMIND_KINDS = ["call", "text", "email", "check_in", "review"] as const;
const REMIND_TITLE: Record<(typeof REMIND_KINDS)[number], (first: string) => string> = {
  call: (f) => `Call ${f}`,
  text: (f) => `Text ${f}`,
  email: (f) => `Email ${f}`,
  check_in: (f) => `Check in with ${f}`,
  review: (f) => `Send ${f} a loan review`,
};
export const remindTitle = (kind: (typeof REMIND_KINDS)[number], first: string) => REMIND_TITLE[kind](first || "them");

/** "Remind me": a reminder on the book's Concierge list (titles from a fixed list, like the Concierge's own). */
export async function remindMe(actor: User, id: string, kind: string, days: number, now = new Date()): Promise<{ ok: boolean; message: string }> {
  const c = await contactStore().get(id);
  if (!c || !canSee(actor, c)) return { ok: false, message: cp.errors.gone };
  if (!(REMIND_KINDS as readonly string[]).includes(kind) || !cp.remind.whenOptions.some((o) => o.days === days)) return { ok: false, message: cp.remind.bad };
  const due = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const title = remindTitle(kind as (typeof REMIND_KINDS)[number], c.firstName);
  await conciergeStore().putTask({ id: `k_${randomBytes(9).toString("base64url")}`, ownerUserId: c.ownerUserId, contactId: c.id, title, why: "You asked to be reminded.", due, done: false, createdAt: now.toISOString() });
  await audit(actor, now.toISOString(), "contact.remind", { contactId: c.id, kind, days });
  return { ok: true, message: cp.remind.saved(title, due) };
}

/** "Add to campaign": the campaign's own rules (the loan officer's own campaign and book; every step through the gate). */
export async function addToCampaign(actor: User, id: string, campaignId: string, now = new Date()): Promise<{ ok: boolean; message: string }> {
  const c = await contactStore().get(id);
  if (!c || !canSee(actor, c)) return { ok: false, message: cp.errors.gone };
  const camp = await campaignStore().getCampaign(campaignId);
  if (!camp || camp.ownerUserId !== actor.id) return { ok: false, message: cp.campaign.failed };
  const r = await enroll(actor, campaignId, [c.id], now);
  if (!r) return { ok: false, message: cp.campaign.failed };
  return r.added ? { ok: true, message: cp.campaign.added(camp.name) } : { ok: false, message: cp.campaign.already(camp.name) };
}

// ---- Merge ----

export type MergeRefusal = "gone" | "same" | "kind" | "book";
type Pair = { keep: Contact; drop: Contact; keepLog: ConsentEntry[]; dropLog: ConsentEntry[] };

async function pairFor(actor: User, keepId: string, dropId: string): Promise<{ ok: true; pair: Pair } | { ok: false; error: MergeRefusal }> {
  if (keepId === dropId) return { ok: false, error: "same" };
  const store = contactStore();
  const [keep, drop] = await Promise.all([store.get(keepId), store.get(dropId)]);
  if (!keep || !drop || !canSee(actor, keep) || !canSee(actor, drop)) return { ok: false, error: "gone" };
  if (keep.kind !== drop.kind) return { ok: false, error: "kind" };
  if (keep.ownerUserId !== drop.ownerUserId) return { ok: false, error: "book" };
  const [keepLog, dropLog] = await Promise.all([store.consents(keep.id), store.consents(drop.id)]);
  return { ok: true, pair: { keep, drop, keepLog, dropLog } };
}

export type MergePreview = { keep: Contact; drop: Contact; merged: Contact; outcome: PairOutcome[] };

/** What a merge would do, saving nothing (the page shows it before the loan officer confirms). */
export async function mergePreview(actor: User, keepId: string, dropId: string, now = new Date()): Promise<{ ok: true; preview: MergePreview } | { ok: false; error: MergeRefusal }> {
  const r = await pairFor(actor, keepId, dropId);
  if (!r.ok) return r;
  const { keep, drop, keepLog, dropLog } = r.pair;
  const at = now.toISOString();
  const merged = mergeFields(keep, drop, at);
  return { ok: true, preview: { keep, drop, merged, outcome: mergeConsent(keep, keepLog, drop, dropLog, merged, at, actor.email).outcome } };
}

export type MergeDone = { ok: true; keptId: string; name: string; moved: number } | { ok: false; error: MergeRefusal };

/** Merges `dropId` into `keepId`. The other record is removed; its consent rows stay (append-only) and are copied in. */
export async function mergeContacts(actor: User, keepId: string, dropId: string, now = new Date()): Promise<MergeDone> {
  const r = await pairFor(actor, keepId, dropId);
  if (!r.ok) return r;
  const { keep, drop, keepLog, dropLog } = r.pair;
  const store = contactStore();
  const at = now.toISOString();
  const merged = mergeFields(keep, drop, at);
  const consent = mergeConsent(keep, keepLog, drop, dropLog, merged, at, actor.email);
  await store.put(merged);
  for (const e of [...consent.copies, ...consent.appended]) await store.addConsent(e);
  // Messages, calls and emails.
  const moved = await touchStore().moveContact(drop.id, keep.id);
  // Reminders and the Concierge's notes; drafts written for the other record go stale (they'd name the wrong record).
  const cs = conciergeStore();
  const owner = keep.ownerUserId;
  for (const t of await cs.tasks(owner)) if (t.contactId === drop.id) await cs.putTask({ ...t, contactId: keep.id });
  for (const m of await cs.memory(owner, drop.id, at, { includePending: true })) {
    await cs.addMemory({ ...m, id: `m_${randomBytes(9).toString("base64url")}`, contactId: keep.id });
    await cs.deleteMemory(owner, m.id);
  }
  await cs.markStale(drop.id);
  // Loans from the loan system point at the kept record.
  for (const l of await pipelineStore().list(owner)) if (l.contactId === drop.id) await pipelineStore().put({ ...l, contactId: keep.id, updatedAt: at });
  // Campaigns: carried over unless the kept record is already in that campaign.
  const camps = campaignStore();
  const inAlready = new Set((await camps.activeForContact(keep.id)).map((e) => e.campaignId));
  for (const e of await camps.activeForContact(drop.id)) {
    if (inAlready.has(e.campaignId)) await camps.putEnrollment({ ...e, status: "stopped", endedAt: at, reason: "Merged into another record already in this campaign." });
    else await camps.putEnrollment({ ...e, contactId: keep.id });
  }
  // An agent merge: clients whose agent updates named the other record now name the kept one.
  if (drop.kind === "agent") {
    for (let offset = 0; offset < 25_000; offset += 500) {
      const { contacts } = await store.list({ ownerUserId: owner, kind: "contact", limit: 500, offset });
      for (const c of contacts) if (c.partnerUpdates?.agentContactId === drop.id) await store.put({ ...c, partnerUpdates: { ...c.partnerUpdates, agentContactId: keep.id }, updatedAt: at });
      if (contacts.length < 500) break;
    }
  }
  await store.remove(drop.id, { keepConsents: true });
  await audit(actor, at, "contact.merge", { kept: keep.id, removed: drop.id, moved, copied: consent.copies.length, appended: consent.appended.length, ...(owner !== actor.id ? { book: owner } : {}) });
  return { ok: true, keptId: keep.id, name: nameOf(merged), moved };
}
