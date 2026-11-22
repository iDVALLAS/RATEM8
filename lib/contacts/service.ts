/**
 * lib/contacts/service.ts — importing, viewing and recording consent for
 * Command Center contacts (D2). SERVER-ONLY.
 *
 * Rules (build prompt §2.1, §2.2, §4.2):
 *  - Every contact starts "relationship only": no consent is assumed.
 *  - A "yes" in an opt-in column is recorded as the loan officer's
 *    attestation ("attested"), not as proof. The send gate (D3) decides what
 *    attested consent allows; AI calls and marketing need proof.
 *  - Revoking calls or texts revokes every phone channel and purpose at once
 *    (the FCC treats a revocation as covering both robocalls and robotexts).
 *  - Loan officers see their own contacts; owners, team leads and assistants
 *    see the team's.
 */
import { randomBytes } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { singleCompany } from "@/lib/accounts/company";
import { accountStore } from "@/lib/accounts/store";
import { isUsState } from "@/lib/us-states";
import { contactsImportCopy } from "@/lib/content/contacts-import";
import type { ImportKind, ImportRecord } from "./mapping";
import { applyImport, classify, type ReimportMode } from "./reimport";
import { MAX_TAGS, mergeTags, POSSIBLE_DUPLICATE_TAG, sameTag } from "./tags";
import { CHANNELS, contactStore, liveEntries, PURPOSES, type Channel, type ConsentEntry, type Contact, type Evidence, type Provenance, type Purpose } from "./store";

export const MAX_BATCH = 500;

const id = () => `c_${randomBytes(9).toString("base64url")}`;

/**
 * D8.1 (research 2026-11-18, the most serious data leak): whose book a user
 * works. A loan officer and a team lead work their own; an assistant works
 * the book of the loan officer they're assigned to (none: no clients). The
 * owner sees every book only while every loan officer is under one sponsor
 * (D22, lib/accounts/company.ts); with a second sponsor, their own book.
 */
const NO_BOOK = "__no_book__";
export function bookOf(user: User): string | undefined {
  if (user.role === "owner") return singleCompany() ? undefined : user.id;
  if (user.role === "assistant") return user.assistsUserId || NO_BOOK;
  return user.id;
}
export function canSee(user: User, c: Contact): boolean {
  if (user.status !== "active") return false;
  const book = bookOf(user);
  return book === undefined || c.ownerUserId === book;
}
export const scopeOf = bookOf;

export type ImportResult = {
  created: number;
  /** Already in the book (merged into them). */
  merged: number;
  /** D75: of those, how many had a field change (tags aside). */
  updated: number;
  skipped: number;
  optedOut: number;
  /** D75: rows that matched two different people in the book ("Possible duplicate"). */
  possible: number;
};

/** D69: a refusal the loan officer can act on (shown as is). */
export class ImportRefused extends Error {}

/**
 * D69: whose book an import lands in. An assistant imports into the book of
 * the loan officer they assist (before, their imports went to their own
 * empty book, where nobody saw them); everyone else into their own.
 */
export function importOwner(actor: User): string {
  if (actor.role === "assistant") {
    if (!actor.assistsUserId) throw new ImportRefused(contactsImportCopy.noBook);
    return actor.assistsUserId;
  }
  return actor.id;
}

const latestOf = (entries: ConsentEntry[], channel: Channel, purpose: Purpose): ConsentEntry | null =>
  liveEntries(entries).filter((e) => e.channel === channel && e.purpose === purpose).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;

/** D75: an import's "yes" taken back by an undo (not a stop: they never said stop). */
export const isUndoneYes = (e: ConsentEntry) => !e.granted && e.evidence === "attested";
/** D77: nothing on file: an undone import "yes", or permission set back because their phone or email changed. */
export const isNothingOnFile = (e: ConsentEntry) => isUndoneYes(e) || e.evidence === "reset";

/** D75: the import a batch belongs to, and what to do with people already in the book. */
export type ImportOptions = { importId?: string; mode?: ReimportMode };

/** The book's people a row could be: anyone sharing a phone or email, except people this same import created (rows kept separate on purpose). */
export async function candidatesFor(owner: string, r: Pick<ImportRecord, "phone" | "phone2" | "email">, importId?: string): Promise<Contact[]> {
  const found = await contactStore().findMatches(owner, [r.phone, r.phone2].filter(Boolean) as string[], r.email ? [r.email] : []);
  return importId ? found.filter((c) => c.importId !== importId) : found;
}

/** One batch of an import (the browser sends the file in batches of up to 500). */
export async function importBatch(actor: User, kind: ImportKind, records: ImportRecord[], source: string, provenance: Provenance = "unknown", now = new Date(), opts: ImportOptions = {}): Promise<ImportResult> {
  const store = contactStore();
  const at = now.toISOString();
  const owner = importOwner(actor);
  const out: ImportResult = { created: 0, merged: 0, updated: 0, skipped: 0, optedOut: 0, possible: 0 };
  const importId = opts.importId ?? null;
  // D78: tags this batch added to each person (a "when I add this tag" campaign can take them).
  const tagged: { contact: Contact; added: string[] }[] = [];
  for (const r of records.slice(0, MAX_BATCH)) {
    if (!r || (!r.phone && !r.email)) {
      out.skipped++;
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { attestedOptIns, optOuts, sourceFile, sourceRow, matchTo, ...fields } = r;
    const file = (sourceFile || source).slice(0, 160);
    const match = classify(r, await candidatesFor(owner, r, importId ?? undefined));
    const dup = match.contact && match.kind !== "shares" ? match.contact : null;
    let contact: Contact;
    if (dup) {
      // D75: a row matching two people only fills blanks in the closer match, and both are easy to find.
      const possible = match.kind === "possible";
      const { next, changed } = applyImport(dup, r, possible ? "fill" : opts.mode ?? "fill", { importId: importId ?? undefined, at, extraTags: possible ? [POSSIBLE_DUPLICATE_TAG] : [] });
      // A stronger source replaces "unknown"; a prior-employer import can lock a merged record, never unlock it.
      if (next.provenance === "unknown" && provenance !== "unknown") next.provenance = provenance;
      if (provenance === "prior_employer") next.locked = true;
      contact = next;
      out.merged++;
      if (changed.length) out.updated++;
      if (possible) out.possible++;
    } else {
      contact = { ...fields, tags: mergeTags(r.tags).slice(0, MAX_TAGS), id: id(), ownerUserId: owner, kind: kind === "agents" ? "agent" : "contact", provenance, locked: provenance === "prior_employer", source: `import: ${file}`.slice(0, 160), createdAt: at, updatedAt: at, ...(importId ? { importId } : {}) };
      out.created++;
    }
    await store.put(contact);
    const added = dup ? contact.tags.filter((t) => !dup.tags.some((o) => sameTag(o, t))) : contact.tags;
    if (added.length) tagged.push({ contact, added });
    // D69: one consent log read per contact, so a re-import doesn't add the same answer twice.
    const log = dup ? await store.consents(contact.id) : [];
    const write = async (e: Omit<ConsentEntry, "contactId" | "at" | "actor">) => {
      const last = latestOf(log, e.channel, e.purpose);
      if (last && last.granted === e.granted && last.evidence === e.evidence) return;
      // An import's "yes" is only the loan officer's word: it never undoes a recorded stop, or replaces stronger proof.
      // (D75: a "yes" an undone import took back counts as nothing on file; D77: so does a reset after a new phone or email.)
      if (e.granted && e.evidence === "attested" && last && !isNothingOnFile(last)) return;
      const entry: ConsentEntry = { ...e, contactId: contact.id, at, actor: actor.email, ...(importId ? { importId } : {}) };
      await store.addConsent(entry);
      log.push(entry);
    };
    // D69: an opt-out in the file is a revocation, recorded the way recordConsent revokes (texts or calls stop every phone channel).
    const stops = optOuts ?? {};
    const revoke: [Channel, string][] = [];
    const phoneStop = stops.text ?? stops.call;
    if (phoneStop) for (const ch of PHONE) revoke.push([ch, phoneStop]);
    if (stops.email) revoke.push(["email", stops.email]);
    if (revoke.length) out.optedOut++;
    for (const ch of attestedOptIns) {
      if (ch === "email" ? stops.email : phoneStop) continue;
      for (const purpose of PURPOSES) await write({ channel: ch, purpose, granted: true, evidence: "attested", proof: `opt-in column in ${file}`.slice(0, 200) });
    }
    for (const [channel, where] of revoke) for (const purpose of PURPOSES) await write({ channel, purpose, granted: false, evidence: "revoked", proof: `import: ${where}`.slice(0, 200) });
  }
  await accountStore().audit({ at, actor: actor.email, action: `contacts.import.${kind}`, detail: { ...out, source: source.slice(0, 80), provenance, ...(importId ? { importId, mode: opts.mode ?? "fill" } : {}), ...(owner !== actor.id ? { book: owner } : {}) } });
  // D78: after the consent entries above, so the contact rules see the file's answers.
  if (tagged.length) {
    const { onTagsAdded } = await import("@/lib/campaigns/service");
    await onTagsAdded(tagged, now).catch(() => 0);
  }
  return out;
}

export type ConsentState = { granted: boolean; evidence: Evidence | null; at: string | null; proof: string | null };
export type ConsentSummary = Record<Channel, Record<Purpose, ConsentState>>;

/** The latest answer for each channel and purpose. D77: copies from a merged record are history only. */
export function summarize(entries: ConsentEntry[]): ConsentSummary {
  const s = Object.fromEntries(CHANNELS.map((c) => [c, Object.fromEntries(PURPOSES.map((p) => [p, { granted: false, evidence: null, at: null, proof: null }]))])) as ConsentSummary;
  for (const e of liveEntries(entries).sort((a, b) => a.at.localeCompare(b.at))) s[e.channel][e.purpose] = { granted: e.granted, evidence: e.evidence, at: e.at, proof: e.proof };
  return s;
}

/** One word for the list view: what this contact may receive. */
export function consentBadge(s: ConsentSummary): "proof" | "attested" | "revoked" | "relationship" {
  const all = CHANNELS.flatMap((c) => PURPOSES.map((p) => s[c][p]));
  if (all.some((x) => x.evidence === "revoked")) return "revoked";
  if (all.some((x) => x.granted && x.evidence !== "attested")) return "proof";
  if (all.some((x) => x.granted)) return "attested";
  return "relationship";
}

const PHONE: Channel[] = ["call", "ai_call", "text"];

export async function recordConsent(
  actor: User,
  contactId: string,
  input: { channel: Channel; purpose: Purpose; granted: boolean; evidence: Evidence; proof: string },
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "No such contact." };
  const at = now.toISOString();
  const proof = input.proof.trim().slice(0, 500);
  if (input.granted) {
    if (input.evidence === "revoked") return { ok: false, error: "Pick how they gave permission." };
    if (!proof) return { ok: false, error: "Say where the permission is (the form, recording or message)." };
    await store.addConsent({ contactId, channel: input.channel, purpose: input.purpose, granted: true, evidence: input.evidence, proof, at, actor: actor.email });
  } else {
    const channels = PHONE.includes(input.channel) ? PHONE : [input.channel];
    for (const channel of channels) for (const purpose of PURPOSES) await store.addConsent({ contactId, channel, purpose, granted: false, evidence: "revoked", proof: proof || "revoked by the loan officer", at, actor: actor.email });
  }
  await accountStore().audit({ at, actor: actor.email, action: input.granted ? "consent.grant" : "consent.revoke", detail: { contactId, channel: input.channel, purpose: input.purpose, evidence: input.evidence } });
  return { ok: true };
}

/**
 * Clears the hold on prior-employer contacts after the loan officer's
 * attestation (the text is counsel's; until then it is the placeholder in
 * the UI). Recorded in the audit log with the exact wording accepted.
 */
export async function unlockContacts(actor: User, contactIds: string[], attestation: string, now = new Date()): Promise<number> {
  const store = contactStore();
  let n = 0;
  for (const cid of contactIds.slice(0, 1000)) {
    const c = await store.get(cid);
    if (!c || !canSee(actor, c) || !c.locked || c.ownerUserId !== actor.id) continue;
    await store.put({ ...c, locked: false, updatedAt: now.toISOString() });
    n++;
  }
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contacts.unlock", detail: { count: n, attestation: attestation.slice(0, 300) } });
  return n;
}

/**
 * D75: releases everyone on hold in the signed-in loan officer's own book in
 * one go (one UPDATE in Neon; before, only the first 500 were read and
 * released). Same attestation and audit as `unlockContacts`.
 */
export async function unlockAllHeld(actor: User, attestation: string, now = new Date()): Promise<number> {
  if (actor.status !== "active") return 0;
  const n = await contactStore().unlockAll(actor.id, now.toISOString());
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contacts.unlock", detail: { count: n, attestation: attestation.slice(0, 300) } });
  return n;
}

export async function deleteContact(actor: User, contactId: string, now = new Date()): Promise<{ ok: boolean }> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c) || actor.role === "assistant") return { ok: false };
  await store.remove(contactId);
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contact.delete", detail: { contactId } });
  return { ok: true };
}

/**
 * D76: add a contact's property state from the call session ("Add their
 * state"), so licensing can be checked. Only someone who can see the
 * contact; only a real state code. The contact rules then decide as before.
 */
export async function setContactState(actor: User, contactId: string, state: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = state.trim().toUpperCase();
  if (!isUsState(code)) return { ok: false, error: "Pick their property state." };
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "That contact isn't in your book." };
  await store.put({ ...c, state: code, updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contact.state", detail: { contactId } });
  return { ok: true };
}
