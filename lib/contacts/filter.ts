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
 * D80 adds loan fields (note rate, amount, program, fixed or ARM, the ARM's
 * first change, purpose, lender, closed dates, has a closed date) and "has
 * all of these tags" to the same `ListRule`, `matches`, `ruleSql` and
 * `describeRule`. Old saved lists load unchanged (every new key is optional).
 * Rates compare as numbers to the thousandth (7.2 = 7.200%). A rate in a rule
 * is a client's own closed rate in the loan officer's records, for finding
 * people; it is never shown to anyone else or put into a message.
 *
 * Fair lending: the rule has no field for age, family status or any other
 * protected trait, and none may be added. Filters are about the relationship
 * and how you may reach someone, never who they are.
 */
import { z } from "zod";
import type { ConsentEntry } from "./store";
import { LOAN_PROGRAMS, LOAN_PURPOSES, RATE_TYPES, showRate, type LoanProgram, type LoanPurpose, type RateType } from "./loan";

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
  // ---- D80: their loan ----
  /** Has every one of these tags. */
  tagsAll?: string[];
  /** Closed on or after / on or before (YYYY-MM-DD). */
  closedFrom?: string;
  closedTo?: string;
  /** true: a closed date is on file; false: none is. */
  hasClosedDate?: boolean;
  /** Note rate at least / at most, in percent (7.2 = 7.200%). */
  rateMin?: number;
  rateMax?: number;
  amountMin?: number;
  amountMax?: number;
  /** Any of these programs. */
  program?: LoanProgram[];
  rateType?: RateType;
  /** An ARM whose first change date is between today and N days from now. */
  armChangeWithinDays?: number;
  purpose?: LoanPurpose;
  /** Words in the lender's name. */
  lender?: string;
};

const IMP = /^imp_[A-Za-z0-9_-]{6,40}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day, written YYYY-MM-DD. */
export const isDay = (s: unknown): s is string => typeof s === "string" && ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** Rates to the thousandth, so 7.2 and 7.200 are the same. */
const rate3 = (n: number) => Math.round(n * 1000) / 1000;
const okRate = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 20;
const okAmount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100_000_000;
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
  tagsAll: z.array(tagText).max(20).optional(),
  closedFrom: z.string().regex(ISO_DAY).optional(),
  closedTo: z.string().regex(ISO_DAY).optional(),
  hasClosedDate: z.boolean().optional(),
  rateMin: z.number().gt(0).lt(20).optional(),
  rateMax: z.number().gt(0).lt(20).optional(),
  amountMin: z.number().min(0).max(100_000_000).optional(),
  amountMax: z.number().min(0).max(100_000_000).optional(),
  program: z.array(z.enum(LOAN_PROGRAMS)).max(LOAN_PROGRAMS.length).optional(),
  rateType: z.enum(RATE_TYPES).optional(),
  armChangeWithinDays: z.number().int().min(1).max(3650).optional(),
  purpose: z.enum(LOAN_PURPOSES).optional(),
  lender: z.string().trim().max(60).optional(),
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
  // D80: loan fields. A range given backwards is put the right way round.
  const all = [...new Set((r.tagsAll ?? []).map((t) => t.trim()).filter(Boolean))].sort();
  if (all.length) out.tagsAll = all.slice(0, 20);
  let from = isDay(r.closedFrom) ? r.closedFrom : undefined;
  let to = isDay(r.closedTo) ? r.closedTo : undefined;
  if (from && to && from > to) [from, to] = [to, from];
  if (from) out.closedFrom = from;
  if (to) out.closedTo = to;
  // A date range already means a closed date is on file.
  if (r.hasClosedDate === false && !from && !to) out.hasClosedDate = false;
  else if (r.hasClosedDate === true && !from && !to) out.hasClosedDate = true;
  let lo = okRate(r.rateMin) ? rate3(r.rateMin) : undefined;
  let hi = okRate(r.rateMax) ? rate3(r.rateMax) : undefined;
  if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
  if (lo !== undefined) out.rateMin = lo;
  if (hi !== undefined) out.rateMax = hi;
  let amin = okAmount(r.amountMin) && r.amountMin > 0 ? Math.round(r.amountMin) : undefined;
  let amax = okAmount(r.amountMax) && r.amountMax > 0 ? Math.round(r.amountMax) : undefined;
  if (amin !== undefined && amax !== undefined && amin > amax) [amin, amax] = [amax, amin];
  if (amin !== undefined) out.amountMin = amin;
  if (amax !== undefined) out.amountMax = amax;
  const progs = LOAN_PROGRAMS.filter((p) => (r.program ?? []).includes(p));
  if (progs.length) out.program = progs;
  if (r.rateType && (RATE_TYPES as readonly string[]).includes(r.rateType)) out.rateType = r.rateType;
  if (r.armChangeWithinDays && r.armChangeWithinDays > 0) out.armChangeWithinDays = Math.min(3650, Math.round(r.armChangeWithinDays));
  if (r.purpose && (LOAN_PURPOSES as readonly string[]).includes(r.purpose)) out.purpose = r.purpose;
  const lender = r.lender?.replace(/\s+/g, " ").trim().slice(0, 60);
  if (lender) out.lender = lender;
  return out;
}

/** Whether a rule reads anything about the loan (the list then shows each person's loan line). */
export const hasLoanRule = (r: ListRule) => {
  const c = cleanRule(r);
  return !!(c.closedFrom || c.closedTo || c.hasClosedDate !== undefined || c.rateMin || c.rateMax || c.amountMin || c.amountMax || c.program || c.rateType || c.armChangeWithinDays || c.purpose || c.lender);
};

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

/** D80: several tags in one address value, split on a character no tag can hold. */
const TAG_SEP = "\u001f";
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/**
 * `?kind=agent&q=…&rel=…&tag=…&state=…&perm=…&added=7|imp_…&import=imp_…&contacted=7|30|q30|q90|never&noreply=1`
 * D80: `&tagor=…&tagall=…&cfrom=YYYY-MM-DD&cto=…&closed=1|0&rmin=7.2&rmax=9&amin=&amax=&prog=fha,va&rtype=arm&armdays=365&purpose=refi&lender=…`
 */
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
  const more = read(p, "tagor").split(TAG_SEP).map((t) => t.trim().slice(0, 200)).filter(Boolean);
  if (more.length) r.tagsAny = [...(r.tagsAny ?? []), ...more];
  const all = read(p, "tagall").split(TAG_SEP).map((t) => t.trim().slice(0, 200)).filter(Boolean);
  if (all.length) r.tagsAll = all;
  r.closedFrom = read(p, "cfrom") || undefined;
  r.closedTo = read(p, "cto") || undefined;
  const closed = read(p, "closed");
  if (closed === "1") r.hasClosedDate = true;
  else if (closed === "0") r.hasClosedDate = false;
  r.rateMin = num(read(p, "rmin"));
  r.rateMax = num(read(p, "rmax"));
  r.amountMin = num(read(p, "amin"));
  r.amountMax = num(read(p, "amax"));
  const prog = read(p, "prog").split(",").filter(Boolean) as LoanProgram[];
  if (prog.length) r.program = prog;
  const rt = read(p, "rtype");
  if ((RATE_TYPES as readonly string[]).includes(rt)) r.rateType = rt as RateType;
  const ad = Number(read(p, "armdays"));
  if (Number.isInteger(ad) && ad > 0) r.armChangeWithinDays = ad;
  const pu = read(p, "purpose");
  if ((LOAN_PURPOSES as readonly string[]).includes(pu)) r.purpose = pu as LoanPurpose;
  const lender = read(p, "lender").slice(0, 120);
  if (lender.trim()) r.lender = lender;
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
  if ((r.tagsAny?.length ?? 0) > 1) o.tagor = r.tagsAny!.slice(1).join(TAG_SEP);
  if (r.tagsAll?.length) o.tagall = r.tagsAll.join(TAG_SEP);
  if (r.state) o.state = r.state;
  if (r.permission) o.perm = r.permission;
  if (r.addedWithinDays) o.added = String(r.addedWithinDays);
  if (r.importId) o.import = r.importId;
  if (r.neverContacted) o.contacted = "never";
  else if (r.contactedWithinDays) o.contacted = String(r.contactedWithinDays);
  else if (r.quietDays) o.contacted = `q${r.quietDays}`;
  if (r.neverReplied) o.noreply = "1";
  if (r.closedFrom) o.cfrom = r.closedFrom;
  if (r.closedTo) o.cto = r.closedTo;
  if (r.hasClosedDate !== undefined) o.closed = r.hasClosedDate ? "1" : "0";
  if (r.rateMin !== undefined) o.rmin = String(r.rateMin);
  if (r.rateMax !== undefined) o.rmax = String(r.rateMax);
  if (r.amountMin !== undefined) o.amin = String(r.amountMin);
  if (r.amountMax !== undefined) o.amax = String(r.amountMax);
  if (r.program?.length) o.prog = r.program.join(",");
  if (r.rateType) o.rtype = r.rateType;
  if (r.armChangeWithinDays) o.armdays = String(r.armChangeWithinDays);
  if (r.purpose) o.purpose = r.purpose;
  if (r.lender) o.lender = r.lender;
  return o;
}
export const ruleQuery = (rule: ListRule) => new URLSearchParams(ruleToParams(rule)).toString();

/** Which address keys each chip removes (D80: a range chip removes both ends, "rmin,rmax"). */
export type RuleChip = { key: string; label: string };

/** D80: the words for loan chips. */
export type LoanChipLabels = {
  tagAll: (t: string) => string;
  rate: (min: string | null, max: string | null) => string;
  amount: (min: string | null, max: string | null) => string;
  closed: (from: string | null, to: string | null) => string;
  hasClosed: string;
  noClosed: string;
  program: (names: string[]) => string;
  rateType: (name: string) => string;
  armChange: (days: number) => string;
  purpose: (name: string) => string;
  lender: (name: string) => string;
  programs: Record<LoanProgram, string>;
  rateTypes: Record<RateType, string>;
  purposes: Record<LoanPurpose, string>;
};
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
/** "Jan 1, 2025" for chips (the day as written, never shifted by a time zone). */
export const spellDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The plain chips for a rule ("Tag: Spring", "Permission on file", "Not contacted in 90 days"). */
export function describeRule(rule: ListRule, labels: {
  relationship: Record<string, string>;
  permission: Record<PermissionClass, string>;
  chip: {
    kindAgent: string; search: (q: string) => string; relationship: (l: string) => string; tag: (t: string) => string; state: (s: string) => string; permission: (l: string) => string;
    added: (d: number) => string; importOne: string; contactedWithin: (d: number) => string; quiet: (d: number) => string; never: string; noReply: string;
    loan?: LoanChipLabels;
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
  const l = c.loan;
  if (l) {
    for (const t of r.tagsAll ?? []) out.push({ key: "tagall", label: l.tagAll(t) });
    if (r.closedFrom || r.closedTo) out.push({ key: "cfrom,cto", label: l.closed(r.closedFrom ? spellDay(r.closedFrom) : null, r.closedTo ? spellDay(r.closedTo) : null) });
    if (r.hasClosedDate === true) out.push({ key: "closed", label: l.hasClosed });
    if (r.hasClosedDate === false) out.push({ key: "closed", label: l.noClosed });
    if (r.rateMin !== undefined || r.rateMax !== undefined) out.push({ key: "rmin,rmax", label: l.rate(r.rateMin !== undefined ? showRate(r.rateMin) : null, r.rateMax !== undefined ? showRate(r.rateMax) : null) });
    if (r.amountMin !== undefined || r.amountMax !== undefined) out.push({ key: "amin,amax", label: l.amount(r.amountMin !== undefined ? money(r.amountMin) : null, r.amountMax !== undefined ? money(r.amountMax) : null) });
    if (r.program?.length) out.push({ key: "prog", label: l.program(r.program.map((p) => l.programs[p])) });
    if (r.rateType) out.push({ key: "rtype", label: l.rateType(l.rateTypes[r.rateType]) });
    if (r.armChangeWithinDays) out.push({ key: "armdays", label: l.armChange(r.armChangeWithinDays) });
    if (r.purpose) out.push({ key: "purpose", label: l.purpose(l.purposes[r.purpose]) });
    if (r.lender) out.push({ key: "lender", label: l.lender(r.lender) });
  }
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
  /** D80 */
  loan?: { closedOn: string | null; amount: number | null; noteRate: number | null; program?: string | null; rateType?: string | null; armFirstChange?: string | null; purpose?: string | null; lender?: string | null } | null;
};
/** The facts the memory store gathers when a rule needs them. */
export type RuleFacts = { consents?: ConsentEntry[]; lastOut?: string | null; anyIn?: boolean };
/** Outbound touches that count as "contacted" (a refused or failed send doesn't). */
export const NOT_CONTACT_STATUSES = ["failed", "blocked", "undelivered"] as const;

const DAY = 86_400_000;
const since = (now: Date, days: number) => new Date(now.getTime() - days * DAY).toISOString();
/** D80: the day (YYYY-MM-DD, UTC) N days from now: the end of an "ARM changes within" window. */
const dayAhead = (now: Date, days: number) => new Date(now.getTime() + days * DAY).toISOString().slice(0, 10);

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
  // D80: their loan.
  if (r.tagsAll?.length && !r.tagsAll.every((t) => (c.tags ?? []).includes(t))) return false;
  const loan = c.loan ?? null;
  const closed = loan?.closedOn || null;
  if (r.hasClosedDate === true && !closed) return false;
  if (r.hasClosedDate === false && closed) return false;
  if (r.closedFrom && !(closed && closed >= r.closedFrom)) return false;
  if (r.closedTo && !(closed && closed <= r.closedTo)) return false;
  const rate = typeof loan?.noteRate === "number" ? rate3(loan.noteRate) : null;
  if (r.rateMin !== undefined && !(rate !== null && rate >= r.rateMin)) return false;
  if (r.rateMax !== undefined && !(rate !== null && rate <= r.rateMax)) return false;
  const amount = typeof loan?.amount === "number" ? loan.amount : null;
  if (r.amountMin !== undefined && !(amount !== null && amount >= r.amountMin)) return false;
  if (r.amountMax !== undefined && !(amount !== null && amount <= r.amountMax)) return false;
  if (r.program?.length && !(loan?.program && (r.program as string[]).includes(loan.program))) return false;
  if (r.rateType && loan?.rateType !== r.rateType) return false;
  if (r.armChangeWithinDays) {
    const ch = loan?.armFirstChange ?? null;
    if (!(ch && ch >= now.toISOString().slice(0, 10) && ch <= dayAhead(now, r.armChangeWithinDays))) return false;
  }
  if (r.purpose && loan?.purpose !== r.purpose) return false;
  if (r.lender && !(loan?.lender ?? "").toLowerCase().includes(r.lender.toLowerCase())) return false;
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
  // D80: their loan (inside the JSON body). Numbers are read only when the stored value is a number.
  if (r.tagsAll?.length) where.push(`body->'tags' ?& ${bind(r.tagsAll)}::text[]`);
  if (r.hasClosedDate === true) where.push(`${CLOSED_ON} <> ''`);
  if (r.hasClosedDate === false) where.push(`${CLOSED_ON} = ''`);
  if (r.closedFrom) where.push(`${CLOSED_ON} >= ${bind(r.closedFrom)}`);
  if (r.closedTo) where.push(`(${CLOSED_ON} <> '' AND ${CLOSED_ON} <= ${bind(r.closedTo)})`);
  if (r.rateMin !== undefined) where.push(`${loanNum("noteRate", true)} >= ${bind(r.rateMin)}::numeric`);
  if (r.rateMax !== undefined) where.push(`${loanNum("noteRate", true)} <= ${bind(r.rateMax)}::numeric`);
  if (r.amountMin !== undefined) where.push(`${loanNum("amount")} >= ${bind(r.amountMin)}::numeric`);
  if (r.amountMax !== undefined) where.push(`${loanNum("amount")} <= ${bind(r.amountMax)}::numeric`);
  if (r.program?.length) where.push(`${loanText("program")} = ANY(${bind(r.program)}::text[])`);
  if (r.rateType) where.push(`${loanText("rateType")} = ${bind(r.rateType)}`);
  if (r.armChangeWithinDays) where.push(`${loanText("armFirstChange")} BETWEEN ${bind(now.toISOString().slice(0, 10))} AND ${bind(dayAhead(now, r.armChangeWithinDays))}`);
  if (r.purpose) where.push(`${loanText("purpose")} = ${bind(r.purpose)}`);
  if (r.lender) where.push(`lower(${loanText("lender")}) LIKE ${bind(`%${r.lender.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`)} ESCAPE '\\'`);
  return where;
}

/** D80: a text value in the contact's loan (fixed key names only; never a value). */
const loanText = (key: "program" | "rateType" | "armFirstChange" | "purpose" | "lender" | "closedOn") => `(body->'loan'->>'${key}')`;
const CLOSED_ON = `coalesce(body->'loan'->>'closedOn', '')`;
/** D80: a number in the contact's loan, or NULL when it isn't one (rates rounded to the thousandth, as `matches`). */
const loanNum = (key: "noteRate" | "amount", round = false) => `(CASE WHEN jsonb_typeof(body->'loan'->'${key}') = 'number' THEN ${round ? `round((body->'loan'->>'${key}')::numeric, 3)` : `(body->'loan'->>'${key}')::numeric`} END)`;
