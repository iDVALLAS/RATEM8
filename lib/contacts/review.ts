/**
 * lib/contacts/review.ts — the import review (D74). Client-safe and pure.
 *
 *  - Column cards: one per file column, what it goes into (a field, "Add to
 *    notes", "Make a tag" or "Don't import") and whether it's Sure, Check
 *    this or Not imported. Private data (SSN, birth date, account number)
 *    is never imported.
 *  - Format questions, asked only when a file is ambiguous: the order of
 *    numeric dates, how a one-column name is written, what an opt-in value
 *    like "maybe" means, and confirming an opt-out column.
 *  - "Needs a look": re-checking a typed value with the same normalize
 *    functions the import uses, a suggestion worked out here in the browser,
 *    and the plain sentence for each one.
 *  - The skipped rows as a CSV with a Reason column, formula-safe.
 *
 * Sample values and every value in "Needs a look" stay on the device. The
 * only thing that may go to M8 is a field name, a value's shape and a
 * reason code (lib/contacts/ai-fix.ts).
 */
import { cell } from "@/lib/export/csv";
import type { Csv } from "./csv";
import { headerAllowed, OPT_OUT_FIELDS, OPT_OUT_HEADER, PROTECTED_HEADER, readOptIn, readsOptOut, type BuildOptions, type Field, type FixField, type ImportKind, type ImportRecord, type Mapping, type OptOutField, type RowProblem, type RowWarning, fieldsFor } from "./mapping";
import { cleanEmail, cleanState, formatPhone, isoDate, scanDates, spellDate, splitName, toE164, type DateOrder, type NameOrder } from "./normalize";
import { MAX_TAG, MAX_TAGS, mergeTags, splitTags } from "./tags";
import { usStateName } from "@/lib/us-states";

// ---- Columns ----

export type ColumnChoice = "notes" | "tag" | "skip";
export type ColumnTarget = Field | ColumnChoice;
export type ColumnStatus = "sure" | "check" | "none";
/** Why a matched column needs a look: M8 wasn't sure, M8 and the name match disagree, or it was matched by its contents only. */
export type ColumnFlag = "unsure" | "disagree" | "contents";
export type ColumnNote = "private" | "protected" | "optout" | "question" | ColumnFlag | "notes" | "stage" | "tags" | "empty" | "skip" | null;
export type OptInField = "optInText" | "optInCall" | "optInEmail";
export const OPT_IN_FIELDS: readonly OptInField[] = ["optInText", "optInCall", "optInEmail"];

/** Social Security numbers, birth dates, account numbers, credit scores, passwords: never imported, never sent. */
export const SENSITIVE_HEADER = /\b(ssn|ss#|social security|soc\.? ?sec|tax ?id|tin|dob|date of birth|birth ?date|birthday|account ?(number|no|num|#)|acct|routing|credit ?score|fico|password|pin)\b/i;
const SSN_VALUE = /^\d{3}-\d{2}-\d{4}$/;
/** D74: a "Stage" or "Pipeline stage" column is kept as a note for now (the stage board comes later). */
export const STAGE_HEADER = /^(pipeline |lead |deal |sales )?stage$|pipeline.?stage/i;

/** The non-empty values of a column (the first `n`). */
export function columnValues(t: Csv, col: number, n = 200): string[] {
  const out: string[] = [];
  for (const r of t.rows) {
    const v = (r[col] ?? "").trim();
    if (v) out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

export function isSensitive(header: string, values: string[]): boolean {
  if (SENSITIVE_HEADER.test(header)) return true;
  // D80: protected traits (age, race, sex, marital or familial status…) are never imported either.
  if (PROTECTED_HEADER.test(header)) return true;
  return values.length > 0 && values.filter((v) => SSN_VALUE.test(v)).length / values.length > 0.5;
}

/** Where a column matched to no field goes unless the loan officer says otherwise. */
export function defaultChoice(header: string, values: string[]): ColumnChoice {
  if (!values.length || isSensitive(header, values)) return "skip";
  return "notes";
}

/** An email shown on a card: "m•••@gmail.com" (the mockup's look; it never leaves the device either way). */
const maskEmail = (v: string) => (/^[^\s@]+@[^\s@]+$/.test(v) ? `${v[0]}•••@${v.split("@")[1]}` : v);

/** Up to three different sample values for a card (shown on this device only). */
export function samplesOf(t: Csv, col: number): string[] {
  return [...new Set(columnValues(t, col, 40))].slice(0, 3).map((v) => maskEmail(v.slice(0, 40)));
}

export function fieldOfColumn(mapping: Mapping, col: number): Field | null {
  return (Object.entries(mapping) as [Field, number | undefined][]).find(([, c]) => c === col)?.[0] ?? null;
}

export function targetOf(t: Csv, mapping: Mapping, choice: Record<number, ColumnChoice>, col: number): ColumnTarget {
  const f = fieldOfColumn(mapping, col);
  if (f) return f;
  const values = columnValues(t, col, 60);
  if (isSensitive(t.headers[col] ?? "", values)) return "skip";
  return choice[col] ?? defaultChoice(t.headers[col] ?? "", values);
}

/** The columns that go into notes and tags, for `buildRecords`. */
export function extraColumns(t: Csv, mapping: Mapping, choice: Record<number, ColumnChoice>): { notes: number[]; tags: number[] } {
  const notes: number[] = [];
  const tags: number[] = [];
  t.headers.forEach((_, i) => {
    const target = targetOf(t, mapping, choice, i);
    if (target === "notes") notes.push(i);
    else if (target === "tag") tags.push(i);
  });
  return { notes, tags };
}

/** The fields a column may be matched to (D69: an opt-out column only to an opt-out field). */
export function optionsFor(kind: ImportKind, header: string): Field[] {
  return (Object.keys(fieldsFor(kind)) as Field[]).filter((f) => headerAllowed(f, header));
}

/** Whether a column's values look like phones or emails (for "Use column 'Home #' as Other phone?"). */
export function looksLike(values: string[]): "phone" | "email" | null {
  if (!values.length) return null;
  if (values.filter((v) => !!cleanEmail(v)).length / values.length >= 0.6) return "email";
  if (values.filter((v) => !!toE164(v)).length / values.length >= 0.6) return "phone";
  return null;
}

/** D74: a column in notes (or a tag) that looks like a phone or email, and the free field it could fill. */
export function reachSuggestion(t: Csv, mapping: Mapping, choice: Record<number, ColumnChoice>, col: number): Field | null {
  const target = targetOf(t, mapping, choice, col);
  if (target !== "notes" && target !== "tag") return null;
  const header = t.headers[col] ?? "";
  const kind = looksLike(columnValues(t, col, 60));
  const free = (f: Field) => mapping[f] === undefined && headerAllowed(f, header);
  if (kind === "phone") return free("phone") ? "phone" : free("phone2") ? "phone2" : null;
  if (kind === "email") return free("email") ? "email" : null;
  return null;
}

export type ValueReading = { value: string; key: string; count: number; reading: "yes" | "no" | "unknown" | "stop" };

/** Each different value in a consent column, how many people have it, and how it will be read. */
export function consentReadings(t: Csv, col: number, field: Field, answers?: Record<string, boolean>, max = 12): { values: ValueReading[]; more: number } {
  const counts = new Map<string, { value: string; count: number }>();
  for (const r of t.rows) {
    const v = (r[col] ?? "").trim();
    const key = v.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { value: v, count: 1 });
  }
  const optOut = (OPT_OUT_FIELDS as readonly string[]).includes(field);
  const all = [...counts.entries()]
    .map(([key, { value, count }]) => ({ value, key, count, reading: optOut ? (readsOptOut(value) ? "stop" : "no") : readOptIn(value, answers) }) as ValueReading)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { values: all.slice(0, max), more: Math.max(0, all.length - max) };
}

// ---- Questions ----

export type DateQuestion = { kind: "date"; col: number; header: string; example: string; readings: [string, string]; mixed: boolean };
export type NameQuestion = { kind: "name"; col: number; header: string; samples: string[] };
export type ConsentQuestion = { kind: "consent"; col: number; field: OptInField; header: string; values: ValueReading[]; other: number };
export type OptOutQuestion = { kind: "optout"; col: number; field: OptOutField; header: string; stops: number };
export type Question = DateQuestion | NameQuestion | ConsentQuestion | OptOutQuestion;

/** The loan officer's answers for one file. */
export type FileAnswers = { dateOrder?: DateOrder; nameOrder?: NameOrder; consent?: BuildOptions["consent"]; optOutOk?: number[] };

/**
 * D74: how this file's numeric dates read. A column where some first part is
 * over 12 (and none of the second) is day first; where some second part is
 * (and none of the first), month first; anything else with a date like
 * 03/04/2021 in it is asked about once.
 */
export function dateNeeds(t: Csv, mapping: Mapping): { order: DateOrder | null; question: DateQuestion | null } {
  // D83: the Application date column reads the same way as the closing date.
  const cols = [mapping.closedOn, mapping.appliedOn].filter((c): c is number => c !== undefined);
  if (!cols.length) return { order: null, question: null };
  const col = cols[0];
  const scan = scanDates(t.rows.flatMap((r) => cols.map((c) => r[c] ?? "")));
  if (scan.dmyOnly && !scan.mdyOnly) return { order: "dmy", question: null };
  if (scan.mdyOnly && !scan.dmyOnly) return { order: "mdy", question: null };
  if (!scan.example && !(scan.dmyOnly && scan.mdyOnly)) return { order: null, question: null };
  const example = scan.example ?? "03/04/2021";
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})/.exec(example);
  const mdy = isoDate(example, { order: "mdy" });
  const dmy = isoDate(example, { order: "dmy" });
  const readings: [string, string] = mdy && dmy ? [spellDate(mdy, "mdy"), spellDate(dmy, "dmy")] : ["Month first", "Day first"];
  return { order: null, question: { kind: "date", col, header: t.headers[col] ?? "", example: m ? m[0] : example, readings, mixed: !!(scan.dmyOnly && scan.mdyOnly) } };
}

/** A name with two or more words after titles and Jr/Sr are set aside, and no comma ("Garcia Maria", not "Smith, John"). */
const orderMatters = (v: string) => !v.includes(",") && splitName(v)[0] !== "" && splitName(v)[1].split(" ").filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).length > 0;

/** D74: names in one column with no comma: First Last or Last First? Asked with three samples. */
export function nameNeeds(t: Csv, mapping: Mapping): NameQuestion | null {
  const col = mapping.fullName;
  if (col === undefined || mapping.firstName !== undefined || mapping.lastName !== undefined) return null;
  const samples = columnValues(t, col, 400).filter(orderMatters);
  if (!samples.length) return null;
  return { kind: "name", col, header: t.headers[col] ?? "", samples: samples.slice(0, 3) };
}

/** Every question for one file (answered or not), in the order they're shown. */
export function fileQuestions(t: Csv, mapping: Mapping, kind: ImportKind): Question[] {
  const out: Question[] = [];
  const d = dateNeeds(t, mapping).question;
  if (d) out.push(d);
  const n = nameNeeds(t, mapping);
  if (n) out.push(n);
  if (kind === "contacts") {
    for (const field of OPT_IN_FIELDS) {
      const col = mapping[field];
      if (col === undefined) continue;
      const { values } = consentReadings(t, col, field, undefined, 10_000);
      const unknown = values.filter((v) => v.reading === "unknown");
      if (unknown.length) out.push({ kind: "consent", col, field, header: t.headers[col] ?? "", values: unknown.slice(0, 8), other: Math.max(0, unknown.length - 8) });
    }
  }
  for (const field of OPT_OUT_FIELDS) {
    const col = mapping[field];
    if (col === undefined) continue;
    const stops = t.rows.filter((r) => readsOptOut(r[col])).length;
    out.push({ kind: "optout", col, field, header: t.headers[col] ?? "", stops });
  }
  return out;
}

/** How many answers a file still needs before the import can go on. */
export function unanswered(questions: Question[], a: FileAnswers): number {
  let n = 0;
  for (const q of questions) {
    if (q.kind === "date") n += a.dateOrder ? 0 : 1;
    else if (q.kind === "name") n += a.nameOrder ? 0 : 1;
    else if (q.kind === "optout") n += a.optOutOk?.includes(q.col) ? 0 : 1;
    else {
      const ans = a.consent?.[q.field] ?? {};
      n += q.values.filter((v) => ans[v.key] === undefined).length + (q.other && ans["*"] === undefined ? 1 : 0);
    }
  }
  return n;
}

/** The date order and name order `buildRecords` should use: the loan officer's answer, else what the file plainly says. */
export function buildAnswers(t: Csv, mapping: Mapping, a: FileAnswers): Pick<BuildOptions, "dateOrder" | "nameOrder" | "consent"> {
  return { dateOrder: a.dateOrder ?? dateNeeds(t, mapping).order ?? undefined, nameOrder: a.nameOrder, consent: a.consent };
}

// ---- Cards ----

export type ColumnCard = {
  col: number;
  header: string;
  samples: string[];
  target: ColumnTarget;
  status: ColumnStatus;
  note: ColumnNote;
  sensitive: boolean;
  optOut: boolean;
  options: Field[];
  /** A free phone or email field this column could fill. */
  suggest: Field | null;
};

/**
 * One card per column. Not imported: private data, an empty column, or
 * "Don't import". Check this: an opt-out column not yet confirmed, a column
 * with an open question, one M8 wasn't sure of or disagreed on, one matched
 * by its contents only, or one no field matched (it goes to notes). Sure:
 * everything else, and anything the loan officer chose or confirmed.
 */
export function columnCards(t: Csv, mapping: Mapping, kind: ImportKind, choice: Record<number, ColumnChoice>, review: { flags?: Record<number, ColumnFlag>; ok?: number[]; optOutOk?: number[] }, questionCols: number[] = []): ColumnCard[] {
  return t.headers.map((header, col) => {
    const values = columnValues(t, col, 60);
    const sensitive = (!fieldOfColumn(mapping, col) || PROTECTED_HEADER.test(header)) && isSensitive(header, values);
    const target = targetOf(t, mapping, choice, col);
    const optOut = OPT_OUT_HEADER.test(header) || (OPT_OUT_FIELDS as readonly string[]).includes(target);
    const ok = review.ok?.includes(col);
    let status: ColumnStatus = "sure";
    let note: ColumnNote = null;
    if (sensitive) [status, note] = ["none", PROTECTED_HEADER.test(header) && !SENSITIVE_HEADER.test(header) ? "protected" : "private"];
    else if (!values.length) [status, note] = ["none", "empty"];
    else if (target === "skip") [status, note] = ["none", "skip"];
    else if (optOut && !review.optOutOk?.includes(col)) [status, note] = ["check", "optout"];
    else if (questionCols.includes(col)) [status, note] = ["check", "question"];
    else if (ok) status = "sure";
    else if (review.flags?.[col]) [status, note] = ["check", review.flags[col]];
    else if (target === "notes") [status, note] = STAGE_HEADER.test(header.trim()) ? ["sure", "stage"] : ["check", "notes"];
    if (status === "sure" && note === null && target === "tags") note = "tags";
    return { col, header, samples: samplesOf(t, col), target, status, note, sensitive, optOut, options: optionsFor(kind, header), suggest: sensitive ? null : reachSuggestion(t, mapping, choice, col) };
  });
}

export function cardCounts(cards: ColumnCard[]): Record<ColumnStatus, number> {
  return { sure: cards.filter((c) => c.status === "sure").length, check: cards.filter((c) => c.status === "check").length, none: cards.filter((c) => c.status === "none").length };
}

/**
 * D74: the "Check this" flags from matching. A column matched by its contents
 * only (the name didn't say) is flagged; with M8's answer, a column where M8
 * and the name/contents match disagree, or that M8 marked unsure, is flagged,
 * and a contents match M8 agrees with is not.
 */
export function matchFlags(t: Csv, byName: Mapping, smart: Mapping, ai?: { fields: string[]; unsure: number[] } | null): Record<number, ColumnFlag> {
  const flags: Record<number, ColumnFlag> = {};
  t.headers.forEach((header, col) => {
    const named = fieldOfColumn(byName, col);
    const guessed = fieldOfColumn(smart, col);
    if (guessed && !named) flags[col] = "contents";
    if (!ai) return;
    const said = ai.fields[col] && ai.fields[col] !== "none" && headerAllowed(ai.fields[col] as Field, header) ? (ai.fields[col] as Field) : null;
    if (said && guessed && said === guessed) delete flags[col];
    if ((said ?? null) !== (guessed ?? null) && (said || guessed)) flags[col] = "disagree";
    if (ai.unsure.includes(col) && (said || guessed)) flags[col] = "unsure";
  });
  return flags;
}

// ---- Needs a look ----

export const FIX_LABELS: Record<FixField, string> = { name: "Name", phone: "Mobile", phone2: "Other phone", email: "Email", state: "State", zip: "ZIP", closedOn: "Closed on", tags: "Tags" };

/** D74: a typed value, re-checked by the same functions the import uses. */
export function checkValue(field: FixField, raw: string, opts: { dateOrder?: DateOrder } = {}): { ok: boolean; message: string } {
  const v = raw.trim();
  if (field === "name") {
    if (!v) return { ok: false, message: "Type their name, or keep them as “(no name)”." };
    const [f, l] = splitName(v);
    return { ok: true, message: l ? `First name ${f}, last name ${l}.` : `First name ${f}.` };
  }
  if (!v) return { ok: true, message: "It will be left blank." };
  switch (field) {
    case "phone":
    case "phone2": {
      const e = toE164(v);
      return e ? { ok: true, message: `Looks right: ${formatPhone(e)}.` } : { ok: false, message: "That isn't a full US number yet." };
    }
    case "email": {
      const e = cleanEmail(v);
      return e ? { ok: true, message: `Looks right: ${e}.` } : { ok: false, message: "That isn't a complete email address yet." };
    }
    case "state": {
      const s = cleanState(v);
      return s ? { ok: true, message: `Reads as ${usStateName(s) ?? s} (${s}).` } : { ok: false, message: "That isn't a US state we know. Try the two-letter code, like NC." };
    }
    case "zip":
      return /^\d{5}(-\d{4})?$/.test(v) ? { ok: true, message: "Looks right." } : { ok: false, message: "A ZIP is 5 digits, or 5 + 4 like 98101-1234." };
    case "closedOn": {
      const d = isoDate(v, { order: opts.dateOrder });
      return d ? { ok: true, message: `Reads as ${spellDate(d)}.` } : { ok: false, message: "That can't be read as a date yet. Try 2021-03-15." };
    }
    case "tags": {
      const tags = mergeTags(splitTags(v));
      return tags.every((t) => t.length <= MAX_TAG) && tags.length <= MAX_TAGS ? { ok: true, message: `${tags.length} ${tags.length === 1 ? "tag" : "tags"}.` } : { ok: false, message: `Tags are ${MAX_TAG} characters each, ${MAX_TAGS} at most.` };
    }
  }
}

const EMAIL_DOMAIN_FIXES: Record<string, string> = { gmial: "gmail", gmal: "gmail", gmai: "gmail", gamil: "gmail", gnail: "gmail", gmaill: "gmail", yaho: "yahoo", yahooo: "yahoo", yhoo: "yahoo", hotmial: "hotmail", hotmal: "hotmail", hotmai: "hotmail", outlok: "outlook", outloo: "outlook", iclod: "icloud", icoud: "icloud" };
const DOT_COM = new Set(["gmail", "yahoo", "hotmail", "outlook", "aol", "icloud", "msn", "live"]);

/**
 * D74: a likely fix worked out on this device (never by a model, never sent):
 * a known email typo ("gmial" → "gmail.com"), a phone with an extension, a
 * ZIP that lost its leading zero in Excel, a date in the other order. Only
 * offered when it passes the same check; the loan officer still taps Save.
 */
export function localSuggestion(field: FixField, raw: string, opts: { dateOrder?: DateOrder } = {}): string | null {
  const v = raw.trim();
  if (!v) return null;
  let s: string | null = null;
  if (field === "phone" || field === "phone2") {
    const e = toE164(v.replace(/\s*(x|ext\.?|extension)\s*\d+\s*$/i, ""));
    s = e ? formatPhone(e) : null;
  } else if (field === "email") {
    let e = v.toLowerCase().replace(/\s+/g, "").replace(/,/g, ".").replace(/\.+$/, "");
    const at = e.lastIndexOf("@");
    if (at > 0) {
      let [name, domain] = [e.slice(0, at), e.slice(at + 1)];
      const parts = domain.split(".");
      parts[0] = EMAIL_DOMAIN_FIXES[parts[0]] ?? parts[0];
      if (parts.length === 1 && DOT_COM.has(parts[0])) parts.push("com");
      if (parts.length === 2 && DOT_COM.has(parts[0]) && /^(con|cmo|comm|om|co|cm|vom|xom)$/.test(parts[1])) parts[1] = "com";
      domain = parts.join(".");
      name = name.replace(/^mailto:/, "");
      e = `${name}@${domain}`;
    }
    s = cleanEmail(e);
  } else if (field === "zip") {
    if (/^\d{4}$/.test(v)) s = `0${v}`;
    else if (/^\d{9}$/.test(v)) s = `${v.slice(0, 5)}-${v.slice(5)}`;
    else if (/^\d{5}-?$/.test(v)) s = v.slice(0, 5);
  } else if (field === "closedOn") {
    const other: DateOrder = opts.dateOrder === "dmy" ? "mdy" : "dmy";
    if (!isoDate(v, { order: opts.dateOrder })) s = isoDate(v, { order: other });
  }
  return s && s !== v && checkValue(field, s, opts).ok ? s : null;
}

/** The first name to use in a sentence, or "This person". */
const who = (name: string) => (name && name !== "(no name)" ? name.split(" ")[0] : "This person");

/** D74: the sentence for one "Needs a look" row, written here (it names the person and the value, so it's never sent). */
export function fixPrompt(w: Pick<RowWarning, "field" | "raw" | "reason" | "name">): string {
  const p = who(w.name);
  const poss = p === "This person" ? "This person's" : `${p}'s`;
  switch (w.field) {
    case "name":
      return "This person has no name in the file. Type their name, or keep them as “(no name)”.";
    case "phone":
    case "phone2":
      return `${poss} ${w.field === "phone" ? "phone" : "other phone"} ${w.raw} ${w.reason}. Type the right one, or skip the phone.`;
    case "email":
      return `${poss} email ${w.raw} ${w.reason}. Type the right one, or skip the email.`;
    case "state":
      return `${poss} state “${w.raw}” ${w.reason}. Type the state, or leave it blank.`;
    case "zip":
      return `${poss} ZIP “${w.raw}” ${w.reason}. Type the right one, or leave it blank.`;
    case "closedOn":
      return `${poss} closing date ${w.raw}: ${w.reason}. Type the right date, or leave it blank.`;
    case "tags":
      return `${poss} tags were shortened (${MAX_TAG} characters each, ${MAX_TAGS} at most). Edit them, or keep the shortened ones.`;
  }
}

export function skipLabel(field: FixField): string {
  if (field === "name") return "Keep as (no name)";
  if (field === "phone" || field === "phone2") return "Skip the phone";
  if (field === "email") return "Skip the email";
  if (field === "tags") return "Keep them shortened";
  return "Leave it blank";
}

/** D74: the only description of a problem that may go to M8: a fixed code, never the value or the reason's own words. */
export const REASON_CODES = ["phone_short", "phone_long", "phone_fake", "phone_invalid", "email_at", "email_space", "email_incomplete", "email_invalid", "state", "zip", "date_order", "date_day", "date_unreadable", "tags", "name_missing"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export function reasonCode(w: Pick<RowWarning, "code" | "reason">): ReasonCode {
  const r = w.reason;
  switch (w.code) {
    case "phone":
      return /short/.test(r) ? "phone_short" : /too many/.test(r) ? "phone_long" : /555/.test(r) ? "phone_fake" : "phone_invalid";
    case "email":
      return /no @/.test(r) ? "email_at" : /space/.test(r) ? "email_space" : /complete/.test(r) ? "email_incomplete" : "email_invalid";
    case "date":
      return /swapped|order/.test(r) ? "date_order" : /has no/.test(r) ? "date_day" : "date_unreadable";
    case "name_missing":
      return "name_missing";
    default:
      return w.code;
  }
}

// ---- Skipped rows ----

export type SkippedRow = RowProblem & { file: string; headers: string[] };

/** D74: "No phone or email we could read" and the like, for the Skipped list and its download. */
export function skipReason(reason: string): string {
  return reason === "no valid phone or email" ? "No phone or email we could read" : reason.charAt(0).toUpperCase() + reason.slice(1);
}

/**
 * D74: the skipped rows as a CSV anyone can open: File, Row, Reason, then
 * every column of the files (a header repeated inside one file gets " (2)").
 * Cells that would run as a spreadsheet formula are written as text.
 */
export function skippedCsv(rows: SkippedRow[]): string {
  const uniq = (headers: string[]) => {
    const seen = new Map<string, number>();
    return headers.map((h) => {
      const base = h.trim() || "Column";
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return n > 1 ? `${base} (${n})` : base;
    });
  };
  const heads: string[] = [];
  const per = rows.map((r) => {
    const hs = uniq(r.headers);
    for (const h of hs) if (!heads.includes(h)) heads.push(h);
    return hs;
  });
  const lines = [["File", "Row", "Reason", ...heads].map(cell).join(",")];
  rows.forEach((r, i) => {
    const byHead = new Map(per[i].map((h, c) => [h, r.cells?.[c] ?? ""]));
    lines.push([r.file, r.row, skipReason(r.reason), ...heads.map((h) => byHead.get(h) ?? "")].map(cell).join(","));
  });
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ---- Where they came from ----

/** D74: who will be recorded as OK to text, call or email on the loan officer's word, and who is blocked by the file. */
export function consentSummary(records: Pick<ImportRecord, "attestedOptIns" | "optOuts">[]): { text: number; call: number; email: number; anyIn: number; stops: number } {
  const n = (c: "text" | "call" | "email") => records.filter((r) => r.attestedOptIns.includes(c)).length;
  return { text: n("text"), call: n("call"), email: n("email"), anyIn: records.filter((r) => r.attestedOptIns.length).length, stops: records.filter((r) => r.optOuts && Object.keys(r.optOuts).length).length };
}

/** D74: a name split both ways, for the "Names in this file are…" previews. */
export function namePreview(v: string, order: NameOrder): string {
  const [f, l] = splitName(v, order);
  return l ? `${f} · ${l}` : f;
}
