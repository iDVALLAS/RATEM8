/**
 * lib/contacts/suggest.ts — lists suggested at import (D80). Client-safe and
 * pure: it runs in the browser, on the rows already read there.
 *
 *  - `importCounts`: how many people per relationship and kind, closed year,
 *    program, fixed or ARM, rate band (under 5%, 5 to 6.99%, 7% and up) and
 *    state. Only these numbers and the column names may go to M8; never a
 *    name, phone, email, address or any row.
 *  - `fixedSuggestions`: the lists offered with no AI, from the same counts:
 *    "Real estate agents", "<year> closed loans" for the two most recent
 *    years, "ARM loans", "FHA and VA", "Rate 7% and up" (checked), and
 *    "Past clients in <state>", "No closing date on file" (not checked).
 *  - `checkSuggestion`: any list (M8's, or one the loan officer described) is
 *    checked against the rule schema, refused for a protected trait, counted
 *    here, and dropped when nobody in the files fits.
 *
 * Agents found in a client file are their own kind (they go to Agents, never
 * a client list), so "Real estate agents" counts kind agent.
 */
import { cleanRule, isEmptyRule, ListRuleSchema, matches, sameRule, type ListRule, type RuleContact } from "./filter";
import type { ImportKind, ImportRecord } from "./mapping";
import { listRefusal } from "./ask-words";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";

export type ImportCounts = {
  people: number;
  agents: number;
  relationship: Record<string, number>;
  closedYear: Record<string, number>;
  program: Record<string, number>;
  rateType: Record<string, number>;
  rateBand: { under5: number; from5to7: number; from7: number };
  state: Record<string, number>;
  noClosedDate: number;
};

export type Suggestion = { key: string; name: string; rule: ListRule; count: number; on: boolean; by: "fixed" | "m8" | "asked" };

export const MAX_SUGGESTIONS = 8;

const bump = (o: Record<string, number>, k: string | null | undefined) => {
  if (k) o[k] = (o[k] ?? 0) + 1;
};

/** A record as the rule matcher reads a contact. Agents in a client file are kind agent. */
export function asRuleContact(r: ImportRecord, kind: ImportKind, now: Date): RuleContact {
  const agent = kind === "agents" || r.relationship === "agent";
  return {
    ownerUserId: "",
    kind: agent ? "agent" : "contact",
    relationship: agent ? "agent" : r.relationship,
    state: r.state,
    tags: r.tags,
    createdAt: now.toISOString(),
    locked: false,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    city: r.city,
    agent: r.agent,
    loan: r.loan,
  };
}

/** The counts for the whole import (records after merging). Numbers and fixed words only. */
export function importCounts(records: readonly ImportRecord[], kind: ImportKind): ImportCounts {
  const c: ImportCounts = { people: 0, agents: 0, relationship: {}, closedYear: {}, program: {}, rateType: {}, rateBand: { under5: 0, from5to7: 0, from7: 0 }, state: {}, noClosedDate: 0 };
  for (const r of records) {
    const agent = kind === "agents" || r.relationship === "agent";
    if (agent) c.agents++;
    else c.people++;
    bump(c.relationship, agent ? "agent" : r.relationship);
    bump(c.state, r.state && /^[A-Z]{2}$/.test(r.state) ? r.state : null);
    if (agent) continue;
    const l = r.loan;
    if (l?.closedOn) bump(c.closedYear, l.closedOn.slice(0, 4));
    else if (r.relationship === "past_client") c.noClosedDate++;
    bump(c.program, l?.program ?? null);
    bump(c.rateType, l?.rateType ?? null);
    const rate = l?.noteRate;
    if (typeof rate === "number") {
      if (rate < 5) c.rateBand.under5++;
      else if (rate < 7) c.rateBand.from5to7++;
      else c.rateBand.from7++;
    }
  }
  return c;
}

/** Rule keys that can be counted in the browser (nothing that needs the consent log or messages). */
const LOCAL_KEYS = new Set(["kind", "relationship", "tagsAny", "tagsAll", "state", "closedFrom", "closedTo", "hasClosedDate", "rateMin", "rateMax", "amountMin", "amountMax", "program", "rateType", "armChangeWithinDays", "purpose", "lender"]);

/** How many people in the files fit a rule. */
export function countRule(records: readonly ImportRecord[], kind: ImportKind, rule: ListRule, now: Date): number {
  const r = cleanRule(rule);
  let n = 0;
  for (const rec of records) if (matches(asRuleContact(rec, kind, now), r, {}, now)) n++;
  return n;
}

const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/**
 * A list for the step, or null: the rule must pass the saved-list schema,
 * use only rules that can be counted here, name and rule no protected trait,
 * and fit at least one person in the files.
 */
export function checkSuggestion(name: string, rule: unknown, records: readonly ImportRecord[], kind: ImportKind, now: Date, by: Suggestion["by"], on = true): Suggestion | null {
  const label = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!label || listRefusal(label)) return null;
  const p = ListRuleSchema.safeParse(rule);
  if (!p.success) return null;
  const r = cleanRule(p.data);
  if (Object.keys(r).some((k) => !LOCAL_KEYS.has(k))) return null;
  if (isEmptyRule(r) && r.kind !== "agent") return null;
  // An agents-only import only makes agent lists.
  if (kind === "agents" && r.kind !== "agent") return null;
  const count = countRule(records, kind, r, now);
  if (!count) return null;
  return { key: `${by}:${JSON.stringify(r)}`, name: label, rule: r, count, on, by };
}

/** The suggestions with no AI, from the counts. */
export function fixedSuggestions(records: readonly ImportRecord[], kind: ImportKind, now: Date): Suggestion[] {
  const c = importCounts(records, kind);
  const n = lc.suggest.names;
  const out: (Suggestion | null)[] = [];
  const add = (name: string, rule: ListRule, on: boolean) => out.push(checkSuggestion(name, rule, records, kind, now, "fixed", on));
  if (kind === "agents") {
    const states = top(c.state);
    if (states.length > 1) for (const [st] of states.slice(0, 2)) add(n.agentsIn(st), { kind: "agent", state: st }, true);
    return out.filter((s): s is Suggestion => !!s);
  }
  if (c.agents) add(n.agents, { kind: "agent" }, true);
  const years = Object.keys(c.closedYear).sort().reverse().slice(0, 2);
  for (const y of years) add(n.year(y), { closedFrom: `${y}-01-01`, closedTo: `${y}-12-31` }, true);
  if (c.rateType.arm) add(n.arm, { rateType: "arm" }, true);
  if (c.program.fha || c.program.va) add(n.fhaVa, { program: ["fha", "va"] }, true);
  if (c.rateBand.from7) add(n.rate7, { rateMin: 7 }, true);
  const states = top(c.state);
  if (states.length > 1 && (c.relationship.past_client ?? 0) > 0) add(n.pastIn(states[0][0]), { relationship: "past_client", state: states[0][0] }, false);
  if (c.noClosedDate) add(n.noClosed, { relationship: "past_client", hasClosedDate: false }, false);
  return out.filter((s): s is Suggestion => !!s);
}

/** M8's lists first (checked), then the fixed ones it didn't already give, up to 8. */
export function mergeSuggestions(m8: readonly { name: string; rule: unknown }[], records: readonly ImportRecord[], kind: ImportKind, now: Date): Suggestion[] {
  const out: Suggestion[] = [];
  const push = (s: Suggestion | null) => {
    if (!s || out.length >= MAX_SUGGESTIONS) return;
    if (out.some((x) => sameRule(x.rule, s.rule) || x.name.toLowerCase() === s.name.toLowerCase())) return;
    out.push(s);
  };
  for (const s of m8.slice(0, MAX_SUGGESTIONS)) push(checkSuggestion(s.name, s.rule, records, kind, now, "m8", true));
  for (const s of fixedSuggestions(records, kind, now)) push(s);
  return out;
}
