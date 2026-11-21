/**
 * lib/contacts/reimport.ts — people you already have (D75). Client-safe and
 * pure: the same rules decide the preview's counts and the import itself.
 *
 *  - classify: who in the book a row from a file is. An email match, or a
 *    phone match with the same first name, is that person. A phone shared
 *    with someone of a different first name (spouses on one home phone) is a
 *    new person. Matching two different people is a "possible duplicate".
 *  - applyImport: what a row changes on someone already in the book.
 *    "fill" (the default) fills blanks only. "newer" also overwrites name,
 *    address and loan (or agent production) fields and adds new notes. Never
 *    consent (an append-only log, not on the contact), phone checks
 *    (do-not-call, reassigned number, line type), provenance or the hold.
 *    Each change is kept as a snapshot (`Contact.imports`) for undo.
 *  - undoSnapshot: puts an import's changes back, field by field, only where
 *    the field still holds the import's value (a later edit wins).
 */
import type { ImportRecord } from "./mapping";
import type { Contact, ImportSnap } from "./store";
import { MAX_CONTACT_TAGS, mergeTags, sameTag, withExtraTags } from "./tags";

export const REIMPORT_MODES = ["fill", "newer"] as const;
export type ReimportMode = (typeof REIMPORT_MODES)[number];

/** How long an import can be undone. */
export const UNDO_DAYS = 30;
/** Snapshots kept on one person (older than the undo window are dropped first). */
const MAX_SNAPS = 10;

const firstKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Same first name for matching: equal, one blank, or one the start of the other ("Rob" / "Robert"). */
export function sameFirstName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = firstKey(a);
  const y = firstKey(b);
  return !x || !y || x === y || (x.length >= 2 && y.length >= 2 && (x.startsWith(y) || y.startsWith(x)));
}

export type MatchKind = "new" | "existing" | "possible" | "shares";
export type Match = { kind: MatchKind; contact: Contact | null; others: Contact[]; by: "phone" | "email" | null };

const phonesOf = (x: { phone: string | null; phone2: string | null }) => [x.phone, x.phone2].filter(Boolean) as string[];

/**
 * Who a row is, among the book's people that share a phone or email with it.
 * `matchTo` is the loan officer's pick ("new", or one of the candidates' ids).
 */
export function classify(r: Pick<ImportRecord, "firstName" | "phone" | "phone2" | "email" | "matchTo">, candidates: readonly Contact[]): Match {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const list = [...byId.values()];
  const emailHit = (c: Contact) => !!r.email && c.email === r.email;
  const phoneHit = (c: Contact) => phonesOf(r).some((p) => phonesOf(c).includes(p));
  if (r.matchTo === "new") return { kind: "new", contact: null, others: list, by: null };
  if (r.matchTo && byId.has(r.matchTo)) {
    const c = byId.get(r.matchTo)!;
    return { kind: "existing", contact: c, others: list.filter((x) => x.id !== c.id), by: emailHit(c) ? "email" : "phone" };
  }
  const strong = list.filter((c) => emailHit(c) || (phoneHit(c) && sameFirstName(r.firstName, c.firstName)));
  if (!strong.length) {
    const weak = list.filter(phoneHit);
    return weak.length ? { kind: "shares", contact: weak[0], others: weak.slice(1), by: "phone" } : { kind: "new", contact: null, others: [], by: null };
  }
  const best = strong.find(emailHit) ?? strong[0];
  return { kind: strong.length > 1 ? "possible" : "existing", contact: best, others: list.filter((c) => c.id !== best.id), by: emailHit(best) ? "email" : "phone" };
}

const blank = (v: unknown) => v === null || v === undefined || v === "";
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields "Use the newer information" overwrites (name and address); loan and agent numbers too, value by value. */
export const NEWER_FIELDS = ["firstName", "lastName", "street", "city", "state", "zip"] as const;
/** Fields only ever filled when blank. Phone and email are how people are matched, so they never change. */
const FILL_FIELDS = ["firstName", "lastName", "email", "phone", "phone2", "street", "city", "state", "zip", "leadSource", "referredBy"] as const;

/** Plain names for the preview ("Would change: Name, Address"). */
export const CHANGE_LABELS: Record<string, string> = {
  firstName: "Name", lastName: "Name", email: "Email", phone: "Phone", phone2: "Other phone", street: "Address", city: "Address", state: "Address", zip: "Address",
  leadSource: "Lead source", referredBy: "Referred by", relationship: "Relationship", notes: "Notes", loan: "Loan details", agent: "Production",
};
export const changeLabels = (fields: readonly string[]) => [...new Set(fields.map((f) => CHANGE_LABELS[f] ?? f))];

type Numbers = Record<string, string | number | null>;
/** Loan or agent numbers: fill blanks, or (newer) take every value the file has. */
function mergeNumbers<T extends Numbers | null>(cur: T, next: T, newer: boolean): T {
  if (!next) return cur;
  if (!cur) return { ...next } as T;
  const out: Numbers = { ...cur };
  for (const [k, v] of Object.entries(next)) if (!blank(v) && (newer || blank(out[k]))) out[k] = v;
  return out as T;
}

/**
 * Someone already in the book, after a row from a file. Returns the changed
 * fields (tags aside) and, with an `importId`, a snapshot for undo.
 */
export function applyImport(existing: Contact, r: ImportRecord, mode: ReimportMode, opts: { importId?: string; at: string; extraTags?: readonly string[] }): { next: Contact; changed: string[] } {
  const next = structuredClone(existing) as Contact;
  const rec = next as unknown as Record<string, unknown>;
  const src = r as unknown as Record<string, unknown>;
  const newer = mode === "newer";
  for (const f of FILL_FIELDS) {
    const v = src[f];
    if (blank(v)) continue;
    if (blank(rec[f]) || (newer && (NEWER_FIELDS as readonly string[]).includes(f))) rec[f] = v;
  }
  // A new number from a file matched by email goes in Other phone when that's free.
  if (r.phone && r.phone !== next.phone && r.phone !== next.phone2 && blank(next.phone2) && next.phone) next.phone2 = r.phone;
  if (next.relationship === "other" && r.relationship && r.relationship !== "other") next.relationship = r.relationship;
  next.loan = mergeNumbers(next.loan, r.loan, newer);
  next.agent = mergeNumbers(next.agent, r.agent, newer);
  if (r.notes) {
    if (blank(next.notes)) next.notes = r.notes;
    else if (newer && !String(next.notes).includes(r.notes)) next.notes = `${next.notes}\n${r.notes}`.slice(0, 2000);
  }
  const keys = [...FILL_FIELDS, "relationship", "loan", "agent", "notes"];
  const changed = keys.filter((k) => !same((existing as unknown as Record<string, unknown>)[k], rec[k]));
  // D73: the import's tags always land (the picked ones first), capped for a contact.
  next.tags = withExtraTags(existing.tags ?? [], mergeTags(r.tags, opts.extraTags ?? []), MAX_CONTACT_TAGS);
  const addedTags = next.tags.filter((t) => !(existing.tags ?? []).some((e) => sameTag(e, t)));
  const droppedTags = (existing.tags ?? []).filter((t) => !next.tags.some((e) => sameTag(e, t)));
  // Always kept with an import id, even with nothing changed: the import's people include everyone it matched (and its consent entries).
  if (opts.importId) {
    const before = Object.fromEntries(changed.map((k) => [k, (existing as unknown as Record<string, unknown>)[k] ?? null]));
    const after = Object.fromEntries(changed.map((k) => [k, rec[k] ?? null]));
    next.imports = withSnap(existing.imports ?? [], { id: opts.importId, at: opts.at, before, after, addedTags, droppedTags }, opts.at);
  }
  next.updatedAt = opts.at;
  return { next, changed };
}

/** Adds a snapshot; the same import touching someone twice keeps the first "before" for each field. */
function withSnap(snaps: readonly ImportSnap[], s: ImportSnap, at: string): ImportSnap[] {
  const cutoff = Date.parse(at) - (UNDO_DAYS + 1) * 86_400_000;
  const prev = snaps.find((x) => x.id === s.id);
  const merged: ImportSnap = prev
    ? {
        ...prev,
        before: { ...s.before, ...prev.before },
        after: { ...prev.after, ...s.after },
        addedTags: mergeTags(prev.addedTags, s.addedTags).filter((t) => !prev.droppedTags.some((d) => sameTag(d, t))),
        droppedTags: mergeTags(prev.droppedTags, s.droppedTags).filter((t) => !prev.addedTags.some((d) => sameTag(d, t))),
      }
    : s;
  return [...snaps.filter((x) => x.id !== s.id && Date.parse(x.at) >= cutoff), merged].slice(-MAX_SNAPS);
}

/**
 * Undo for someone an import changed: each field goes back to its value
 * before the import while it still holds the import's value; the import's
 * tags come off and any it pushed out come back. Null when the import left
 * no snapshot here.
 */
export function undoSnapshot(c: Contact, importId: string, at: string): { next: Contact; restored: string[] } | null {
  const snap = (c.imports ?? []).find((s) => s.id === importId);
  if (!snap) return null;
  const next = structuredClone(c) as Contact;
  const rec = next as unknown as Record<string, unknown>;
  const restored: string[] = [];
  for (const [k, before] of Object.entries(snap.before)) {
    if (!same(rec[k], snap.after[k])) continue;
    rec[k] = before;
    restored.push(k);
  }
  const kept = (next.tags ?? []).filter((t) => !snap.addedTags.some((a) => sameTag(a, t)));
  next.tags = mergeTags(kept, snap.droppedTags).slice(0, MAX_CONTACT_TAGS);
  next.imports = (next.imports ?? []).filter((s) => s.id !== importId);
  next.updatedAt = at;
  return { next, restored };
}

/** Whether an import (started `at`) can still be undone. */
export function undoOpen(at: string, now: Date): boolean {
  return now.getTime() - Date.parse(at) <= UNDO_DAYS * 86_400_000;
}
