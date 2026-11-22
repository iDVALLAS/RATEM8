/**
 * lib/contacts/filter.ts — one filter engine for the Contacts list, saved
 * lists, bulk actions, campaigns and the call session (D78). Client-safe and
 * pure: no store, no clock (the caller passes `now`).
 *
 *  - `ListRule` is what a saved list stores (`cc_saved_lists`). Lists are
 *    live: the rule runs each time, so someone who fits later shows up.
 *  - `matches(contact, rule, facts, now)` is the memory store's filter, and
 *    `ruleSql(rule, now, params)` the Neon store's WHERE clauses with bound
 *    parameters only (no value is ever written into the SQL text). Tests keep
 *    the two in step.
 *  - `ruleFromParams` / `ruleToParams` are the page address (`?tag=…&perm=…`),
 *    and `describeRule` the plain chips under the filters.
 *
 * D80 adds loan fields (rate, program, ARM change, purpose, lender, closed
 * dates) to the same `ListRule`, `matches`, `ruleSql` and `describeRule`.
 *
 * Fair lending: the rule has no field for age, family status or any other
 * protected trait, and none may be added. Filters are about the relationship
 * and how you may reach someone, never who they are.
 */
import { z } from "zod";
import type { ConsentEntry } from "./store";

export const PERMISSIONS = ["on_file", "your_word", "relationship", "do_not_contact", "on_hold"] as const;
export type PermissionClass = (typeof PERMISSIONS)[number];
export const ADDED_DAYS = [7, 30, 90] as const;
export const CONTACTED = ["7", "30", "q30", "q90", "never"] as const;
export const RELATIONSHIPS = ["past_client", "lead", "sphere", "agent", "other"] as const;

export type ListRule = {
  /** People or agents (default people). */
  kind?: "contact" | "agent";
  /** Words in the name, phone, email, city or tags. */
  q?: string;
  relationship?: (typeof RELATIONSHIPS)[number];
  /** Has any of these tags (exact spelling, as D73). The page sets one; D80 may set more. */
  tagsAny?: string[];
  state?: string;
  permission?: PermissionClass;
  addedWithinDays?: number;
  /** Created or changed by one import (D75). */
  importId?: string;
  /** A text, email or call out to them in the last N days. */
  contactedWithinDays?: number;
  /** Nothing out to them in the last N days (people never contacted included). */
  quietDays?: number;
  neverContacted?: boolean;
  /** They have never written back. */
  neverReplied?: boolean;
};

const IMP = /^imp_[A-Za-z0-9_-]{6,40}$/;
const tagText = z.string().trim().min(1).max(60);
export const ListRuleSchema = z.object({
  kind: z.enum(["contact", "agent"]).optional(),
  q: z.string().trim().max(200).optional(),
  relationship: z.enum(RELATIONSHIPS).optional(),
  tagsAny: z.array(tagText).max(20).optional(),
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  permission: z.enum(PERMISSIONS).optional(),
  addedWithinDays: z.number().int().min(1).max(3650).optional(),
  importId: z.string().regex(IMP).optional(),
  contactedWithinDays: z.number().int().min(1).max(3650).optional(),
  quietDays: z.number().int().min(1).max(3650).optional(),
  neverContacted: z.boolean().optional(),
  neverReplied: z.boolean().optional(),
});

/** Drops empty parts and puts the rest in one order, so two rules can be compared. */
export function cleanRule(r: ListRule): ListRule {
  const out: ListRule = {};
  if (r.kind === "agent") out.kind = "agent";
  const q = r.q?.trim();
  if (q) out.q = q.slice(0, 200);
  // Agents are their own kind, so "agent" isn't a relationship filter on people.
  if (r.relationship && r.relationship !== "agent" && (RELATIONSHIPS as readonly string[]).includes(r.relationship) && out.kind !== "agent") out.relationship = r.relationship;
  const tags = [...new Set((r.tagsAny ?? []).map((t) => t.trim()).filter(Boolean))].sort();
  if (tags.length) out.tagsAny = tags.slice(0, 20);
  if (r.state && /^[A-Z]{2}$/.test(r.state)) out.state = r.state;
  if (r.permission && (PERMISSIONS as readonly string[]).includes(r.permission)) out.permission = r.permission;
  if (r.addedWithinDays && r.addedWithinDays > 0) out.addedWithinDays = Math.min(3650, Math.round(r.addedWithinDays));
  if (r.importId && IMP.test(r.importId)) out.importId = r.importId;
  // Last contacted is one choice: within, quiet or never.
  if (r.neverContacted) out.neverContacted = true;
  else if (r.contactedWithinDays && r.contactedWithinDays > 0) out.contactedWithinDays = Math.min(3650, Math.round(r.contactedWithinDays));
  else if (r.quietDays && r.quietDays > 0) out.quietDays = Math.min(3650, Math.round(r.quietDays));
  if (r.neverReplied) out.neverReplied = true;
  return out;
}

export const ruleKey = (r: ListRule) => JSON.stringify(cleanRule(r));
export const sameRule = (a: ListRule, b: ListRule) => ruleKey(a) === ruleKey(b);
/** A rule with nothing but the kind (Everyone, or every agent). */
export const isEmptyRule = (r: ListRule) => Object.keys(cleanRule(r)).filter((k) => k !== "kind").length === 0;
/** Facts outside the contact's own record that a rule needs (consent log, messages). */
export const needsConsents = (r: ListRule) => !!r.permission;
export const needsTouches = (r: ListRule) => !!(r.contactedWithinDays || r.quietDays || r.neverContacted || r.neverReplied);

// ---- The page address ----

type Params = { get(k: string): string | null } | Record<string, string | string[] | undefined>;
const read = (p: Params, k: string): string => {
  if (typeof (p as { get?: unknown }).get === "function") return (p as { get(k: string): string | null }).get(k) ?? "";
  const v = (p as Record<string, string | string[] | undefined>)[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

/** `?kind=agent&q=…&rel=…&tag=…&state=…&perm=…&added=7|imp_…&import=imp_…&contacted=7|30|q30|q90|never&noreply=1` */
export function ruleFromParams(p: Params): ListRule {
  const r: ListRule = {};
  if (read(p, "kind") === "agent") r.kind = "agent";
  const q = read(p, "q").trim().slice(0, 200);
  if (q) r.q = q;
  const rel = read(p, "rel");
  if ((RELATIONSHIPS as readonly string[]).includes(rel)) r.relationship = rel as ListRule["relationship"];
  const tag = read(p, "tag").trim().slice(0, 200);
  if (tag) r.tagsAny = [tag];
  const st = read(p, "state").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(st)) r.state = st;
  const perm = read(p, "perm");
  if ((PERMISSIONS as readonly string[]).includes(perm)) r.permission = perm as PermissionClass;
  const added = read(p, "added");
  if (IMP.test(added)) r.importId = added;
  else if ((ADDED_DAYS as readonly number[]).includes(Number(added))) r.addedWithinDays = Number(added);
  const imp = read(p, "import");
  if (IMP.test(imp)) r.importId = imp;
  const c = read(p, "contacted");
  if (c === "never") r.neverContacted = true;
  else if (/^q\d{1,4}$/.test(c)) r.quietDays = Number(c.slice(1));
  else if (/^\d{1,4}$/.test(c) && Number(c) > 0) r.contactedWithinDays = Number(c);
  if (read(p, "noreply") === "1") r.neverReplied = true;
  return cleanRule(r);
}

/** The rule as page-address pairs (the opposite of `ruleFromParams`). */
export function ruleToParams(rule: ListRule): Record<string, string> {
  const r = cleanRule(rule);
  const o: Record<string, string> = {};
  if (r.kind === "agent") o.kind = "agent";
  if (r.q) o.q = r.q;
  if (r.relationship) o.rel = r.relationship;
  if (r.tagsAny?.length) o.tag = r.tagsAny[0];
  if (r.state) o.state = r.state;
  if (r.permission) o.perm = r.permission;
  if (r.addedWithinDays) o.added = String(r.addedWithinDays);
  if (r.importId) o.import = r.importId;
  if (r.neverContacted) o.contacted = "never";
  else if (r.contactedWithinDays) o.contacted = String(r.contactedWithinDays);
  else if (r.quietDays) o.contacted = `q${r.quietDays}`;
  if (r.neverReplied) o.noreply = "1";
  return o;
}
export const ruleQuery = (rule: ListRule) => new URLSearchParams(ruleToParams(rule)).toString();

/** Which address key each chip removes. */
export type RuleChip = { key: string; label: string };

/** The plain chips for a rule ("Tag: Spring", "Permission on file", "Not contacted in 90 days"). */
export function describeRule(rule: ListRule, labels: {
  relationship: Record<string, string>;
  permission: Record<PermissionClass, string>;
  chip: {
    kindAgent: string; search: (q: string) => string; relationship: (l: string) => string; tag: (t: string) => string; state: (s: string) => string; permission: (l: string) => string;
    added: (d: number) => string; importOne: string; contactedWithin: (d: number) => string; quiet: (d: number) => string; never: string; noReply: string;
  };
}): RuleChip[] {
  const r = cleanRule(rule);
  const c = labels.chip;
  const out: RuleChip[] = [];
  if (r.q) out.push({ key: "q", label: c.search(r.q) });
  if (r.relationship) out.push({ key: "rel", label: c.relationship(labels.relationship[r.relationship] ?? r.relationship) });
  for (const t of r.tagsAny ?? []) out.push({ key: "tag", label: c.tag(t) });
  if (r.state) out.push({ key: "state", label: c.state(r.state) });
  if (r.permission) out.push({ key: "perm", label: c.permission(labels.permission[r.permission]) });
  if (r.addedWithinDays) out.push({ key: "added", label: c.added(r.addedWithinDays) });
  if (r.importId) out.push({ key: "import", label: c.importOne });
  if (r.neverContacted) out.push({ key: "contacted", label: c.never });
  else if (r.contactedWithinDays) out.push({ key: "contacted", label: c.contactedWithin(r.contactedWithinDays) });
  else if (r.quietDays) out.push({ key: "contacted", label: c.quiet(r.quietDays) });
  if (r.neverReplied) out.push({ key: "noreply", label: c.noReply });
  return out;
}

// ---- Permission classes (the list's own reading of the consent log) ----

const PROOF = new Set(["written", "recorded_call", "web_form", "text_reply"]);

/** The latest live entry for each channel and purpose (copies from a merged record are history only, as `summarize`). */
export function latestEntries(entries: ConsentEntry[]): ConsentEntry[] {
  const last = new Map<string, ConsentEntry>();
  const live = entries.filter((e) => !e.mergedFrom).map((e, i) => ({ e, i }));
  live.sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i);
  for (const { e } of live) last.set(`${e.channel}|${e.purpose}`, e);
  return [...last.values()];
}

/**
 * One class per person, like the list's badge: on hold first; then a stop on
 * any channel ("do not contact"); then any "yes" with proof ("on file"); then
 * any "yes" on the loan officer's word; else relationship only.
 */
export function permissionClass(entries: ConsentEntry[], locked: boolean): PermissionClass {
  if (locked) return "on_hold";
  const latest = latestEntries(entries);
  if (latest.some((e) => e.evidence === "revoked")) return "do_not_contact";
  if (latest.some((e) => e.granted && PROOF.has(e.evidence))) return "on_file";
  if (latest.some((e) => e.granted)) return "your_word";
  return "relationship";
}

// ---- Matching (memory) ----

/** A contact's own fields the rule reads. */
export type RuleContact = {
  ownerUserId: string; kind: "contact" | "agent"; relationship: string; state: string | null; tags: string[]; createdAt: string; locked: boolean; importId?: string | null; imports?: { id: string }[];
  firstName: string; lastName: string; email: string | null; phone: string | null; city: string | null; agent?: { brokerage: string | null } | null;
};
/** The facts the memory store gathers when a rule needs them. */
export type RuleFacts = { consents?: ConsentEntry[]; lastOut?: string | null; anyIn?: boolean };
/** Outbound touches that count as "contacted" (a refused or failed send doesn't). */
export const NOT_CONTACT_STATUSES = ["failed", "blocked", "undelivered"] as const;

const DAY = 86_400_000;
const since = (now: Date, days: number) => new Date(now.getTime() - days * DAY).toISOString();

export function matches(c: RuleContact, rule: ListRule, facts: RuleFacts, now: Date): boolean {
  const r = cleanRule(rule);
  if ((r.kind ?? "contact") !== c.kind) return false;
  if (r.relationship && c.relationship !== r.relationship) return false;
  if (r.state && c.state !== r.state) return false;
  if (r.tagsAny?.length && !r.tagsAny.some((t) => (c.tags ?? []).includes(t))) return false;
  if (r.importId && c.importId !== r.importId && !(c.imports ?? []).some((s) => s.id === r.importId)) return false;
  if (r.addedWithinDays && c.createdAt < since(now, r.addedWithinDays)) return false;
  if (r.q) {
    const hay = [c.firstName, c.lastName, c.email, c.phone, c.city, c.agent?.brokerage, ...(c.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(r.q.toLowerCase())) return false;
  }
  if (r.permission && permissionClass(facts.consents ?? [], c.locked) !== r.permission) return false;
  const last = facts.lastOut ?? null;
  if (r.neverContacted && last) return false;
  if (r.contactedWithinDays && !(last && last >= since(now, r.contactedWithinDays))) return false;
  if (r.quietDays && last && last >= since(now, r.quietDays)) return false;
  if (r.neverReplied && facts.anyIn) return false;
  return true;
}

// ---- Matching (Neon) ----

/** The newest of its channel and purpose, among a record's own entries (alias x). */
const LATEST = `x.contact_id = cc_contacts.id AND x.merged_from IS NULL AND NOT EXISTS (SELECT 1 FROM cc_consents y WHERE y.contact_id = x.contact_id AND y.channel = x.channel AND y.purpose = x.purpose AND y.merged_from IS NULL AND (y.at, y.id) > (x.at, x.id))`;
const hasLatest = (cond: string) => `EXISTS (SELECT 1 FROM cc_consents x WHERE ${LATEST} AND ${cond})`;
const REVOKED = hasLatest(`x.evidence = 'revoked'`);
const PROOF_SQL = hasLatest(`x.granted AND x.evidence IN ('written', 'recorded_call', 'web_form', 'text_reply')`);
const GRANTED = hasLatest(`x.granted`);
const LOCKED = `body->>'locked' = 'true'`;
const UNLOCKED = `coalesce(body->>'locked', 'false') <> 'true'`;
export const PERMISSION_SQL: Record<PermissionClass, string> = {
  on_hold: LOCKED,
  do_not_contact: `${UNLOCKED} AND ${REVOKED}`,
  on_file: `${UNLOCKED} AND NOT ${REVOKED} AND ${PROOF_SQL}`,
  your_word: `${UNLOCKED} AND NOT ${REVOKED} AND NOT ${PROOF_SQL} AND ${GRANTED}`,
  relationship: `${UNLOCKED} AND NOT ${REVOKED} AND NOT ${GRANTED}`,
};
const OUT = `t.contact_id = cc_contacts.id AND t.direction = 'out' AND t.status NOT IN (${NOT_CONTACT_STATUSES.map((s) => `'${s}'`).join(", ")})`;

/**
 * The rule as WHERE clauses on cc_contacts. Every value goes into `params`
 * and is referenced as $n; the SQL text holds only fixed words.
 */
export function ruleSql(rule: ListRule, now: Date, params: unknown[]): string[] {
  const r = cleanRule(rule);
  const where: string[] = [];
  const bind = (v: unknown) => `$${params.push(v)}`;
  where.push(`kind = ${bind(r.kind ?? "contact")}`);
  if (r.relationship) where.push(`relationship = ${bind(r.relationship)}`);
  if (r.state) where.push(`state = ${bind(r.state)}`);
  if (r.tagsAny?.length) where.push(`body->'tags' ?| ${bind(r.tagsAny)}::text[]`);
  if (r.importId) {
    const a = bind(r.importId);
    const b = bind(JSON.stringify([{ id: r.importId }]));
    where.push(`(body->>'importId' = ${a} OR body->'imports' @> ${b}::jsonb)`);
  }
  if (r.addedWithinDays) where.push(`body->>'createdAt' >= ${bind(since(now, r.addedWithinDays))}`);
  if (r.q) where.push(`search LIKE ${bind(`%${r.q.toLowerCase().replace(/[%_\\]/g, "")}%`)}`);
  if (r.permission) where.push(`(${PERMISSION_SQL[r.permission]})`);
  if (r.neverContacted) where.push(`NOT EXISTS (SELECT 1 FROM cc_touches t WHERE ${OUT})`);
  else if (r.contactedWithinDays) where.push(`EXISTS (SELECT 1 FROM cc_touches t WHERE ${OUT} AND t.at >= ${bind(since(now, r.contactedWithinDays))}::timestamptz)`);
  else if (r.quietDays) where.push(`NOT EXISTS (SELECT 1 FROM cc_touches t WHERE ${OUT} AND t.at >= ${bind(since(now, r.quietDays))}::timestamptz)`);
  if (r.neverReplied) where.push(`NOT EXISTS (SELECT 1 FROM cc_touches t WHERE t.contact_id = cc_contacts.id AND t.direction = 'in')`);
  return where;
}
