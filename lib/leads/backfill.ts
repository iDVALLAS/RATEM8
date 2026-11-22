/**
 * lib/leads/backfill.ts — D83: lead events for leads that arrived before the
 * log existed, and for imported leads. Pure (given its inputs) apart from the
 * event id's hash; `lib/leads/sync.ts` feeds it and saves what it returns.
 *
 * Owner decisions 4 and 5 (2026-11-22):
 *  - History (once per loan officer): one event per `lead.inbound` audit row
 *    written before D83 (every delivery, repeats included, with whether its
 *    form named the loan officer), and one per `lead:` contact the audit log
 *    doesn't cover, dated when the contact was made, `namesYou` from a granted
 *    text or call entry the intake wrote (actor "lead:…"), never a later yes.
 *  - Imports (every time it runs; ids are fixed, so nothing doubles): one
 *    event per imported contact with a Lead source, or from a file marked as
 *    from a lead vendor. Dated by the file's own dates: its Application date
 *    column, else its closed or funded date; only a lead-vendor file with no
 *    date uses the day of the import. Anyone else with no date counts as a lead
 *    but in no period ("none"). `namesYou` only when the import itself wrote
 *    a granted text or call entry whose wording names the loan officer.
 *  - "Referral", "Past client", "Sphere" and the like go to "Past clients &
 *    sphere" through `sourceKey`.
 */
import { eventId, type DatedBy, type LeadEvent } from "./events";
import { leadNamedYou } from "./mode";
import { sourceKey, sourceLabel, VENDOR_FILE_KEY } from "./source-key";

export type BackfillContact = {
  id: string;
  kind: "contact" | "agent";
  source: string;
  provenance?: string;
  leadSource?: string | null;
  createdAt: string;
  importId?: string | null;
  mergedFrom?: { id: string }[];
  loan?: { closedOn?: string | null; appliedOn?: string | null } | null;
};
export type BackfillEntry = { contactId: string; channel: string; granted: boolean; actor: string; proof: string; importId?: string | null; mergedFrom?: string | null };
export type BackfillAudit = { at: string; actor: string; detail: Record<string, unknown> };

export type BackfillInput = {
  owner: string;
  contacts: readonly BackfillContact[];
  entries: readonly BackfillEntry[];
  /** `lead.inbound` audit rows for this owner (rows written since D83 carry `event` and are skipped). */
  audit: readonly BackfillAudit[];
  /** Whether consent wording names the loan officer or their company (`consentNamesUs`). */
  namesUs: (text: string) => boolean;
  /** Include the one-time history part (audit rows and `lead:` contacts). */
  history: boolean;
  now: Date;
};

/** An imported contact that counts as a lead (decision 5): a Lead source, or a file marked as from a lead vendor. */
export const isImportedLead = (c: BackfillContact) => c.kind === "contact" && c.source.startsWith("import:") && (!!c.leadSource?.trim() || c.provenance === "lead_vendor");

/** A day (YYYY-MM-DD…) as a time, at noon UTC so it stays the same day across US time zones; null if missing, unreadable or after `now`. */
function day(v: string | null | undefined, now: Date): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v ?? "");
  if (!m) return null;
  const t = Date.parse(`${m[1]}T12:00:00Z`);
  if (!Number.isFinite(t) || t > now.getTime()) return null;
  return new Date(t).toISOString();
}

/**
 * Decision 5's order, from the file's own columns only: its application date, else its closed or funded date;
 * a lead-vendor file with no date uses the day of the import; anyone else has no date ("none"). A loan from the
 * loan system isn't the file's date (a past client's new application would make an old lead look new).
 */
export function importDate(c: BackfillContact, now: Date): { at: string; datedBy: DatedBy } {
  const applied = day(c.loan?.appliedOn, now);
  if (applied) return { at: applied, datedBy: "application" };
  const closed = day(c.loan?.closedOn, now);
  if (closed) return { at: closed, datedBy: "closed" };
  if (c.provenance === "lead_vendor") return { at: c.createdAt, datedBy: "import" };
  return { at: c.createdAt, datedBy: "none" };
}

const phoneYes = (e: BackfillEntry) => e.granted && !e.mergedFrom && (e.channel === "text" || e.channel === "call");

export function planLeadEvents(input: BackfillInput): LeadEvent[] {
  const { owner, contacts, entries, audit, namesUs, now } = input;
  const out = new Map<string, LeadEvent>();
  const put = (e: LeadEvent) => {
    if (!out.has(e.id)) out.set(e.id, e);
  };
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const mergedInto = new Map<string, string>();
  for (const c of contacts) for (const m of c.mergedFrom ?? []) mergedInto.set(m.id, c.id);
  const resolve = (id: string) => (byId.has(id) ? id : mergedInto.get(id) ?? id);
  const entriesOf = new Map<string, BackfillEntry[]>();
  for (const e of entries) entriesOf.set(e.contactId, [...(entriesOf.get(e.contactId) ?? []), e]);

  if (input.history) {
    // Every delivery before D83, from the audit log (oldest first, so a contact's first delivery wins its id).
    for (const a of [...audit].sort((x, y) => x.at.localeCompare(y.at))) {
      const d = a.detail;
      if (d.owner !== owner || typeof d.contactId !== "string" || "event" in d || !a.actor.startsWith("lead:")) continue;
      const label = a.actor.slice(5).trim();
      put({ id: eventId(owner, d.contactId, a.at), ownerUserId: owner, sourceKey: sourceKey(label) || "lead-vendor", sourceLabel: sourceLabel(sourceKey(label) || "lead-vendor", label), contactId: resolve(d.contactId), at: a.at, duplicate: d.created === false, namesYou: d.permission === "recorded", externalId: null, origin: "history", datedBy: "delivery" });
    }
    // Delivered leads the audit log doesn't cover (the same id when it does, so they never double).
    for (const c of contacts) {
      if (c.kind !== "contact" || !c.source.startsWith("lead:")) continue;
      const label = c.source.slice(5).trim();
      const key = sourceKey(label) || "lead-vendor";
      const named = leadNamedYou(c.id, entriesOf.get(c.id) ?? []);
      put({ id: eventId(owner, c.id, c.createdAt), ownerUserId: owner, sourceKey: key, sourceLabel: sourceLabel(key, label), contactId: c.id, at: c.createdAt, duplicate: false, namesYou: named, externalId: null, origin: "history", datedBy: "delivery" });
    }
  }

  for (const c of contacts) {
    if (!isImportedLead(c)) continue;
    const label = c.leadSource?.trim() || "";
    const key = sourceKey(label) || VENDOR_FILE_KEY;
    const when = importDate(c, now);
    // Only what the import itself recorded, and only wording that names the loan officer (decision 4). An opt-in
    // column's attestation carries no wording (its proof is "opt-in column in <file>"; a file named after the company
    // isn't consent wording), so today an imported lead's yes never names the loan officer.
    const named = (entriesOf.get(c.id) ?? []).some((e) => phoneYes(e) && (e.actor.startsWith("lead:") || (!!c.importId && e.importId === c.importId && namesUs(e.proof.replace(/^opt-in column in [\s\S]*$/, "")))));
    put({ id: eventId(owner, c.id, "import"), ownerUserId: owner, sourceKey: key, sourceLabel: sourceLabel(key, label), contactId: c.id, at: when.at, duplicate: false, namesYou: named, externalId: null, origin: "import", datedBy: when.datedBy });
  }
  return [...out.values()];
}
