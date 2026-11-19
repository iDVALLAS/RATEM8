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
import type { ImportKind, ImportRecord } from "./mapping";
import { CHANNELS, contactStore, PURPOSES, type Channel, type ConsentEntry, type Contact, type Evidence, type Provenance, type Purpose } from "./store";

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

export type ImportResult = { created: number; merged: number; skipped: number };

/** One batch of an import (the browser sends the file in batches of up to 500). */
export async function importBatch(actor: User, kind: ImportKind, records: ImportRecord[], source: string, provenance: Provenance = "unknown", now = new Date()): Promise<ImportResult> {
  const store = contactStore();
  const at = now.toISOString();
  const out: ImportResult = { created: 0, merged: 0, skipped: 0 };
  for (const r of records.slice(0, MAX_BATCH)) {
    if (!r || (!r.phone && !r.email)) {
      out.skipped++;
      continue;
    }
    const { attestedOptIns, ...fields } = r;
    const dup = await store.findDuplicate(actor.id, r.phone, r.email);
    let contact: Contact;
    if (dup) {
      // Fill blanks, never overwrite what's there; tags are combined.
      const merged = { ...dup } as Contact;
      for (const [k, v] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
        const cur = (merged as Record<string, unknown>)[k];
        if ((cur === null || cur === "" || cur === undefined) && v !== null && v !== "") (merged as Record<string, unknown>)[k] = v;
      }
      merged.tags = Array.from(new Set([...dup.tags, ...r.tags])).slice(0, 30);
      if (dup.relationship === "other" && r.relationship !== "other") merged.relationship = r.relationship;
      // A stronger source replaces "unknown"; a prior-employer import can lock a merged record, never unlock it.
      if (merged.provenance === "unknown" && provenance !== "unknown") merged.provenance = provenance;
      if (provenance === "prior_employer") merged.locked = true;
      merged.updatedAt = at;
      contact = merged;
      out.merged++;
    } else {
      contact = { ...fields, id: id(), ownerUserId: actor.id, kind: kind === "agents" ? "agent" : "contact", provenance, locked: provenance === "prior_employer", source: `import: ${source}`.slice(0, 160), createdAt: at, updatedAt: at };
      out.created++;
    }
    await store.put(contact);
    for (const ch of attestedOptIns) {
      const channels: Channel[] = ch === "call" ? ["call"] : [ch];
      for (const channel of channels)
        for (const purpose of PURPOSES)
          await store.addConsent({ contactId: contact.id, channel, purpose, granted: true, evidence: "attested", proof: `opt-in column in ${source}`.slice(0, 200), at, actor: actor.email });
    }
  }
  await accountStore().audit({ at, actor: actor.email, action: `contacts.import.${kind}`, detail: { ...out, source: source.slice(0, 80), provenance } });
  return out;
}

export type ConsentState = { granted: boolean; evidence: Evidence | null; at: string | null; proof: string | null };
export type ConsentSummary = Record<Channel, Record<Purpose, ConsentState>>;

/** The latest answer for each channel and purpose. */
export function summarize(entries: ConsentEntry[]): ConsentSummary {
  const s = Object.fromEntries(CHANNELS.map((c) => [c, Object.fromEntries(PURPOSES.map((p) => [p, { granted: false, evidence: null, at: null, proof: null }]))])) as ConsentSummary;
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) s[e.channel][e.purpose] = { granted: e.granted, evidence: e.evidence, at: e.at, proof: e.proof };
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

export async function deleteContact(actor: User, contactId: string, now = new Date()): Promise<{ ok: boolean }> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c) || actor.role === "assistant") return { ok: false };
  await store.remove(contactId);
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contact.delete", detail: { contactId } });
  return { ok: true };
}
