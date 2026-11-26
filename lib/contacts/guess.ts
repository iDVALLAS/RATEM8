/**
 * lib/contacts/guess.ts — connecting the dots in an import file (D93).
 * Client-safe and pure; nothing here calls a model.
 *
 *  - zipCheck / zipGuess: a column of 5-digit numbers is a ZIP when its ZIPs
 *    fall in the State column's state (USPS ZIP3 ranges) or agree with the
 *    City column (one city, one ZIP prefix). Low agreement says "check
 *    this" (Excel stores dates as 5-digit numbers too).
 *  - nameGuess: First Last or Last First for a one-column name, from the
 *    header ("Last, First") and from the email beside it (john.smith@,
 *    jsmith@).
 *  - sortRows: in a mixed import (clients and agents), which rows are
 *    agents: a Type / Role column first, then an "Agent" yes/no column, then
 *    a brokerage or license column; anything else is "unsure" (M8 may read
 *    those; without it they're counted as clients until moved).
 *  - applyM8: M8's reading of the columns merged under the rules: the rules
 *    stay first, M8 fills columns they couldn't place and flags the ones it
 *    reads differently.
 *  - cardGuesses: the "Best guess" / "M8's best guess" line on each column
 *    card.
 */
import type { Csv } from "./csv";
import { autoMap, CO_FIELDS, headerAllowed, OPT_OUT_FIELDS, splitCouple, type Field, type Mapping } from "./mapping";
import { cleanEmail, cleanState, stateFromZip, type NameOrder } from "./normalize";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import type { ColumnFlag } from "./review";

const g = ic.guess;
const ZIP = /^(\d{5})(?:-\d{4})?$/;

/** One guess shown on a column card. `field` null: a note only (nothing to apply). */
export type Guess = { col: number; field: Field | null; text: string; sure: boolean; by: "rules" | "m8" };
/** M8's reading of one column: a field (or "none"), how sure, and why in a few words. */
export type M8Column = { field: string; sure: boolean; why: string };
export type M8Read = { columns: Record<number, M8Column>; nameOrder: NameOrder | null; nameWhy: string };

const cellOf = (t: Csv, mapping: Mapping, f: Field, row: string[]) => (mapping[f] !== undefined ? (row[mapping[f]!] ?? "").trim() : "");

// ---- ZIP codes ----

export type ZipCheck = { col: number; zips: number; values: number; withState: number; inState: number; cityRows: number; cityAgree: number };

/** How a column's 5-digit values agree with the file's State and City columns. */
export function zipCheck(t: Csv, mapping: Mapping, col: number): ZipCheck {
  const out: ZipCheck = { col, zips: 0, values: 0, withState: 0, inState: 0, cityRows: 0, cityAgree: 0 };
  const byCity = new Map<string, string[]>();
  for (const r of t.rows) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    out.values++;
    const m = ZIP.exec(v);
    if (!m) continue;
    out.zips++;
    const st = cleanState(cellOf(t, mapping, "state", r));
    if (st && mapping.state !== col) {
      out.withState++;
      if (stateFromZip(m[1]) === st) out.inState++;
    }
    const city = cellOf(t, mapping, "city", r).toLowerCase();
    if (city && mapping.city !== col) byCity.set(city, [...(byCity.get(city) ?? []), m[1].slice(0, 3)]);
  }
  for (const zips of byCity.values()) {
    if (zips.length < 2) continue;
    const counts = new Map<string, number>();
    for (const z of zips) counts.set(z, (counts.get(z) ?? 0) + 1);
    out.cityRows += zips.length;
    out.cityAgree += Math.max(...counts.values());
  }
  return out;
}

/** A guess for the ZIP column (mapped, or 5-digit values the rules left in notes), or null when there's nothing to say. */
export function zipGuess(t: Csv, mapping: Mapping, col: number): Guess | null {
  const z = zipCheck(t, mapping, col);
  if (z.values < 2 || z.zips / z.values < 0.8) return null;
  const mapped = mapping.zip === col;
  const free = mapping.zip === undefined;
  if (!mapped && !free) return null;
  const field: Field = "zip";
  if (z.withState >= 3) {
    const share = z.inState / z.withState;
    if (share >= 0.8) return { col, field, sure: true, by: "rules", text: g.zipState(z.inState, z.withState) };
    if (share < 0.5) return { col, field: null, sure: false, by: "rules", text: g.zipStateLow(z.inState, z.withState) };
  }
  if (z.cityRows >= 3) {
    const share = z.cityAgree / z.cityRows;
    if (share >= 0.8) return { col, field, sure: true, by: "rules", text: g.zipCity(z.cityAgree, z.cityRows) };
    if (share < 0.5) return { col, field: null, sure: false, by: "rules", text: g.zipCityLow };
  }
  return { col, field, sure: mapped, by: "rules", text: g.zipDigits };
}

/**
 * A ZIP column matched by its contents only reads Sure when the rest of the
 * row agrees (State or City); otherwise it stays "Check this".
 */
export function confirmZip(t: Csv, mapping: Mapping, flags: Record<number, ColumnFlag>): Record<number, ColumnFlag> {
  const col = mapping.zip;
  if (col === undefined || flags[col] !== "contents") return flags;
  const z = zipGuess(t, mapping, col);
  if (!z?.sure || !z.field) return flags;
  const out = { ...flags };
  delete out[col];
  return out;
}

// ---- Names ----

/** The header says how names are written ("Last, First", "Name (Last First)"). */
export function nameOrderFromHeader(header: string): NameOrder | null {
  const h = header.toLowerCase();
  if (/last\W{0,4}(name\W{0,4})?first/.test(h)) return "last_first";
  if (/first\W{0,4}(name\W{0,4})?last/.test(h)) return "first_last";
  return null;
}

/**
 * Votes from the email beside each name: "john.smith@" or "jsmith@" for
 * "John Smith" is First Last; for "Smith John" it's Last First.
 */
export function nameOrderVotes(t: Csv, mapping: Mapping): { first_last: number; last_first: number } {
  const v = { first_last: 0, last_first: 0 };
  const col = mapping.fullName;
  if (col === undefined) return v;
  for (const r of t.rows) {
    const name = (r[col] ?? "").trim();
    if (!name || name.includes(",")) continue;
    const words = name.toLowerCase().replace(/[^a-z\s'-]/g, "").split(/\s+/).filter((w) => w.length > 1);
    if (words.length < 2) continue;
    const local = (cleanEmail(cellOf(t, mapping, "email", r)) ?? "").split("@")[0].replace(/[^a-z]/g, "");
    if (local.length < 3) continue;
    const a = words[0].replace(/[^a-z]/g, "");
    const b = words[words.length - 1].replace(/[^a-z]/g, "");
    if (!a || !b || a === b) continue;
    if (local.startsWith(a + b) || local === `${a[0]}${b}` || local.startsWith(`${a[0]}${b}`)) v.first_last++;
    else if (local.startsWith(b + a) || local === `${b[0]}${a}` || local.startsWith(`${b[0]}${a}`)) v.last_first++;
  }
  return v;
}

export type NameGuess = { order: NameOrder; sure: boolean; by: "rules" | "m8"; text: string };

/** The best guess for a one-column name's order: the header, then the emails, then M8's reading. */
export function nameGuess(t: Csv, mapping: Mapping, m8?: M8Read | null): NameGuess | null {
  const col = mapping.fullName;
  if (col === undefined) return null;
  const byHeader = nameOrderFromHeader(t.headers[col] ?? "");
  if (byHeader) return { order: byHeader, sure: true, by: "rules", text: g.nameHeader(t.headers[col] ?? "") };
  const v = nameOrderVotes(t, mapping);
  const total = v.first_last + v.last_first;
  if (total >= 3) {
    const order: NameOrder = v.first_last >= v.last_first ? "first_last" : "last_first";
    const share = Math.max(v.first_last, v.last_first) / total;
    if (share >= 0.8) return { order, sure: true, by: "rules", text: g.nameEmail(Math.max(v.first_last, v.last_first), total) };
  }
  if (m8?.nameOrder) return { order: m8.nameOrder, sure: false, by: "m8", text: m8.nameWhy || g.nameM8 };
  return null;
}

// ---- Mixed imports: clients and agents ----

export type RowSort = "client" | "agent" | "unsure";
export type SortWhy = "type" | "agent_col" | "brokerage" | "m8" | "moved" | null;

const TYPE_HEADER = /^(type|role|contact ?type|contact ?role|category|relationship|client ?type|lead ?type|kind|group|record ?type|contact ?category)$/i;
const AGENT_HEADER = /^(is ?)?(an ?)?(agent|realtor)\??$|^(agent|realtor) ?\(y\/n\)$/i;
const BROKERAGE_HEADER = /brokerage|broker ?name|real estate (office|company|firm)|\blicen[cs]e\b|\blic(\.|ense)? ?(#|no|number)|mls ?id|\bdre\b|^office( name)?$/i;
const AGENT_VALUE = /\b(agents?|realtors?|brokers?|listing|selling|buyer'?s? agent|partner agent|real ?estate)\b/i;
const CLIENT_VALUE = /\b(buyers?|sellers?|borrowers?|clients?|customers?|leads?|past|homeowners?|sphere|friends?|family|prospects?|refi|purchase|homebuyers?)\b/i;
const YES = /^(y|yes|true|1|x|agent|realtor)$/i;
const NO = /^(n|no|false|0)$/i;

/** The columns that sort rows: a type column, an "Agent?" column and a brokerage or license column. */
export function sortColumns(t: Csv, mapping: Mapping): { type: number | null; agent: number | null; brokerage: number | null } {
  const find = (re: RegExp) => {
    const i = t.headers.findIndex((h) => re.test(h.trim()));
    return i >= 0 ? i : null;
  };
  const type = find(TYPE_HEADER) ?? (mapping.relationship !== undefined ? mapping.relationship : null);
  return { type, agent: find(AGENT_HEADER), brokerage: find(BROKERAGE_HEADER) };
}

/** Each row: client, agent or unsure (by the rules), and which column said so. */
export function sortRows(t: Csv, mapping: Mapping): { sorts: RowSort[]; why: SortWhy[]; brokerageCol: number | null } {
  const cols = sortColumns(t, mapping);
  const sorts: RowSort[] = [];
  const why: SortWhy[] = [];
  for (const r of t.rows) {
    const at = (c: number | null) => (c === null ? "" : (r[c] ?? "").trim());
    const type = at(cols.type);
    const yes = at(cols.agent);
    const [sort, w]: [RowSort, SortWhy] =
      type && AGENT_VALUE.test(type) ? ["agent", "type"]
      : type && CLIENT_VALUE.test(type) ? ["client", "type"]
      : yes && YES.test(yes) ? ["agent", "agent_col"]
      : yes && NO.test(yes) ? ["client", "agent_col"]
      : at(cols.brokerage) ? ["agent", "brokerage"]
      : ["unsure", null];
    sorts.push(sort);
    why.push(w);
  }
  return { sorts, why, brokerageCol: cols.brokerage };
}

/**
 * The final sort of each row: the loan officer's move wins, then the rules,
 * then M8's answer for a row the rules weren't sure of. Unsure rows count as
 * clients.
 */
export function finalSorts(rules: { sorts: RowSort[]; why: SortWhy[] }, m8: Record<number, RowSort> | undefined, moves: Record<number, "client" | "agent">): { agent: Set<number>; why: SortWhy[]; sorts: RowSort[] } {
  const agent = new Set<number>();
  const why: SortWhy[] = [];
  const sorts: RowSort[] = [];
  rules.sorts.forEach((s, i) => {
    let sort: RowSort = s;
    let w: SortWhy = rules.why[i] ?? null;
    if (moves[i]) [sort, w] = [moves[i], "moved"];
    else if (s === "unsure" && m8?.[i] && m8[i] !== "unsure") [sort, w] = [m8[i], "m8"];
    sorts.push(sort);
    why.push(w);
    if (sort === "agent") agent.add(i);
  });
  return { agent, why, sorts };
}

// ---- M8's reading, merged under the rules ----

/** Fields M8's reading may never fill: consent is the loan officer's (D69 rules and D74 questions decide it). */
const NEVER_FROM_M8 = new Set<string>([...OPT_OUT_FIELDS, "optInText", "optInCall", "optInEmail"]);
export const m8MayFill = (field: string) => !NEVER_FROM_M8.has(field);

/**
 * The rules' mapping stays; M8 fills a column the rules couldn't place (its
 * field still free), confirms a match made by contents only, and flags a
 * column it reads differently ("Check this"). Never a consent field.
 */
export function applyM8(headers: string[], mapping: Mapping, flags: Record<number, ColumnFlag>, m8: M8Read): { mapping: Mapping; flags: Record<number, ColumnFlag> } {
  const m: Mapping = { ...mapping };
  const f: Record<number, ColumnFlag> = { ...flags };
  const fieldAt = (col: number) => (Object.entries(m) as [Field, number][]).find(([, c]) => c === col)?.[0] ?? null;
  for (const [k, ans] of Object.entries(m8.columns)) {
    const col = Number(k);
    if (!(col >= 0 && col < headers.length)) continue;
    const ruled = fieldAt(col);
    if (ans.field === "none" || !m8MayFill(ans.field) || !headerAllowed(ans.field as Field, headers[col] ?? "")) {
      if (ruled && f[col] === "contents" && ans.field === "none") f[col] = "disagree";
      continue;
    }
    if (ruled === ans.field) {
      if (f[col] === "contents") delete f[col];
      continue;
    }
    if (ruled) {
      if (!(NEVER_FROM_M8.has(ruled))) f[col] = "disagree";
      continue;
    }
    if (m[ans.field as Field] !== undefined) continue;
    // One-column names: M8 never adds a full name beside first and last columns.
    if (ans.field === "fullName" && (m.firstName !== undefined || m.lastName !== undefined)) continue;
    m[ans.field as Field] = col;
    f[col] = ans.sure ? "m8" : "unsure";
  }
  return { mapping: m, flags: f };
}

/** The guess line for each column card: M8's reading where there is one, else the rules' (ZIP, co-borrower, two people in one name). */
export function cardGuesses(t: Csv, mapping: Mapping, m8: M8Read | null | undefined, fieldLabel: (f: string) => string): Record<number, Guess> {
  const out: Record<number, Guess> = {};
  t.headers.forEach((_, col) => {
    const ans = m8?.columns[col];
    if (ans && ans.field !== "none" && m8MayFill(ans.field)) {
      out[col] = { col, field: ans.field as Field, sure: ans.sure, by: "m8", text: `${fieldLabel(ans.field)}${ans.why ? `. ${ans.why}` : ""}` };
      return;
    }
    const z = zipGuess(t, mapping, col);
    if (z && (mapping.zip === col || (mapping.zip === undefined && !Object.values(mapping).includes(col)))) {
      out[col] = { ...z, text: z.field ? `${fieldLabel("zip")}. ${z.text}` : z.text };
      return;
    }
    const f = (Object.entries(mapping) as [Field, number][]).find(([, c]) => c === col)?.[0];
    if (f && (CO_FIELDS as readonly string[]).includes(f)) {
      out[col] = { col, field: f, sure: true, by: "rules", text: `${fieldLabel(f)}. ${g.co}` };
      return;
    }
    if (f === "fullName") {
      const couples = t.rows.filter((r) => splitCouple(r[col] ?? "")).length;
      if (couples && !CO_FIELDS.some((c) => mapping[c] !== undefined)) out[col] = { col, field: "fullName", sure: true, by: "rules", text: g.couples(couples) };
    }
  });
  return out;
}

/** Whether a file is (or looks like) a RETR export: RETR's terms bar its data from AI tools, so none of it goes to M8. */
export function isRetrFile(name: string, headers: string[]): boolean {
  if (/\bretr\b|retr[_\s.-]|realestate ?trends/i.test(name)) return true;
  if (headers.some((h) => /\bretr\b/i.test(h))) return true;
  const m = autoMap(headers, "agents");
  return ["units", "volume", "buyerUnits", "listingUnits", "avgPrice"].filter((f) => m[f as Field] !== undefined).length >= 2;
}
