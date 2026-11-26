/**
 * lib/contacts/smart.ts — the one-drop import's helpers (D42). Client-safe
 * and pure.
 *
 *  - parseVcf: phone contact cards (.vcf from iPhone, Android, Google,
 *    Outlook) into rows. Birthdays are never read.
 *  - toTable: finds the header row in a sheet that starts with a title or
 *    blank rows, or makes "Column 1…" headers when there's no header row.
 *  - smartMap: header names first (autoMap), then each column's contents
 *    for anything still unmatched (emails, phones, states, ZIPs, dates,
 *    amounts, rates, full names).
 *  - shapes: what M8 sees of a column. Letters become A/a and digits 9, so
 *    no name, number or address is ever sent.
 *  - relationshipFromName: a default relationship from the file or sheet
 *    name ("Past clients 2021.xlsx").
 *  - mergeRecords: one list from many files, duplicates (same phone or
 *    email) merged, sorted by last name.
 *  - toCleanCsv: the cleaned list as a CSV anyone can open.
 */
import type { Csv } from "./csv";
import { autoMap, fieldsFor, headerAllowed, type Field, type ImportKind, type ImportRecord, type Mapping } from "./mapping";
import { cleanEmail, cleanState, isoDate, toE164 } from "./normalize";
import { sameFirstName } from "./reimport";
import { MAX_TAGS, mergeTags, withExtraTags } from "./tags";

// ---- vCard ----

export const VCF_HEADERS = ["First name", "Last name", "Full name", "Mobile", "Other phone", "Email", "Street", "City", "State", "ZIP", "Company", "Tags", "Notes"];

const vUnescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

export function parseVcf(text: string): Csv {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const rows: string[][] = [];
  let card: Record<string, string> | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^BEGIN:VCARD$/i.test(line)) card = {};
    else if (/^END:VCARD$/i.test(line) && card) {
      rows.push(VCF_HEADERS.map((h) => card![h] ?? ""));
      card = null;
    } else if (card) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [prop, ...params] = line.slice(0, i).replace(/^item\d+\./i, "").split(";");
      const value = line.slice(i + 1);
      const p = prop.toUpperCase();
      const type = params.join(";").toUpperCase();
      if (p === "FN") card["Full name"] = vUnescape(value);
      else if (p === "N") {
        const [last = "", first = ""] = value.split(";");
        card["Last name"] = vUnescape(last);
        card["First name"] = vUnescape(first);
      } else if (p === "TEL") {
        const v = vUnescape(value.replace(/^tel:/i, ""));
        if (/CELL|MOBILE|IPHONE/.test(type) && !card["Mobile"]) card["Mobile"] = v;
        else if (!card["Mobile"] && !/FAX/.test(type)) card["Mobile"] = v;
        else if (!card["Other phone"] && !/FAX/.test(type)) card["Other phone"] = v;
      } else if (p === "EMAIL" && !card["Email"]) card["Email"] = vUnescape(value);
      else if (p === "ADR" && !card["Street"]) {
        const [, , street = "", city = "", region = "", zip = ""] = value.split(";");
        Object.assign(card, { Street: vUnescape(street), City: vUnescape(city), State: vUnescape(region), ZIP: vUnescape(zip) });
      } else if (p === "ORG") card["Company"] = vUnescape(value.split(";")[0] ?? "");
      else if (p === "CATEGORIES") card["Tags"] = vUnescape(value);
      else if (p === "NOTE") card["Notes"] = vUnescape(value).slice(0, 2000);
      // BDAY, PHOTO and the rest are never read.
    }
  }
  return { headers: [...VCF_HEADERS], rows };
}

// ---- Finding the table ----

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const looksData = (v: string) => EMAIL.test(v) || /^\+?[\d\s().-]{10,}$/.test(v) || /^\d+([.,]\d+)?$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The rows of a sheet as a table: the header row found (title rows above it skipped), or generated. */
export function toTable(rows: string[][]): Csv {
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  let best = -1;
  let bestScore = 1;
  for (let i = 0; i < Math.min(rows.length - 1, 15); i++) {
    const cells = rows[i].map((c) => c.trim()).filter(Boolean);
    if (cells.some(looksData)) continue;
    const score = new Set(cells.map((c) => c.toLowerCase())).size;
    // A header spans most of the table's width; a title is one cell.
    if (score > bestScore && score >= Math.min(2, width)) {
      best = i;
      bestScore = score;
    }
  }
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim());
  if (best < 0) return { headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), rows: rows.map(pad) };
  return { headers: pad(rows[best]).map((h, i) => h || `Column ${i + 1}`), rows: rows.slice(best + 1).map(pad).filter((r) => r.some(Boolean)) };
}

// ---- Matching columns by their contents ----

type Sniff = "email" | "phone" | "state" | "zip" | "date" | "money" | "rate" | "name" | null;

export function sniffColumn(values: string[]): Sniff {
  const v = values.map((x) => x.trim()).filter(Boolean).slice(0, 60);
  if (v.length < 2) return null;
  const share = (f: (s: string) => boolean) => v.filter(f).length / v.length;
  if (share((s) => !!cleanEmail(s)) > 0.7) return "email";
  if (share((s) => !!toE164(s) || /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(s)) > 0.7) return "phone";
  if (share((s) => /^\d{5}(-\d{4})?$/.test(s)) > 0.8) return "zip";
  if (share((s) => !!cleanState(s)) > 0.8) return "state";
  if (share((s) => /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s) && !!isoDate(s)) > 0.7) return "date";
  const nums = v.map((s) => Number(s.replace(/[$,%\s]/g, ""))).filter((n) => Number.isFinite(n));
  if (nums.length / v.length > 0.8) {
    if (nums.every((n) => n > 0 && n < 20) && nums.some((n) => !Number.isInteger(n))) return "rate";
    if (nums.every((n) => n >= 10_000 && n < 100_000_000)) return "money";
  }
  if (share((s) => /^[A-Za-z][A-Za-z'.-]+(,?\s+[A-Za-z][A-Za-z'.-]+){1,3}$/.test(s)) > 0.7) return "name";
  return null;
}

const SNIFF_FIELD: Record<Exclude<Sniff, null>, Field[]> = { email: ["email"], phone: ["phone", "phone2"], state: ["state"], zip: ["zip"], date: ["closedOn"], money: ["loanAmount"], rate: ["noteRate"], name: ["fullName"] };

/** Header names first, then each unmatched column's contents. */
export function smartMap(csv: Csv, kind: ImportKind): Mapping {
  const m = autoMap(csv.headers, kind);
  const allowed = new Set(Object.keys(fieldsFor(kind)));
  const used = new Set(Object.values(m));
  const nameMapped = m.fullName !== undefined || m.firstName !== undefined;
  csv.headers.forEach((_, i) => {
    if (used.has(i)) return;
    const s = sniffColumn(csv.rows.map((r) => r[i] ?? ""));
    if (!s) return;
    if (s === "name" && nameMapped) return;
    if (s === "money" && kind === "agents") return;
    // D69: contents never put a co-borrower's or spouse's column into the person's own name, phone or email.
    const field = SNIFF_FIELD[s].find((f) => allowed.has(f) && m[f] === undefined && headerAllowed(f, csv.headers[i] ?? ""));
    if (field) {
      m[field] = i;
      used.add(i);
    }
  });
  return m;
}

/** What M8 sees of a column: up to three value shapes (A/a for letters, 9 for digits), never the values. */
export function shapeOf(v: string): string {
  return v.trim().slice(0, 24).replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/\d/g, "9").replace(/[^\sAa9@.,:;()/#&+'-]/g, "?");
}
export function shapes(csv: Csv): { header: string; shapes: string[] }[] {
  return csv.headers.map((h, i) => ({ header: h.slice(0, 60), shapes: [...new Set(csv.rows.slice(0, 40).map((r) => (r[i] ?? "").trim()).filter(Boolean).map(shapeOf))].slice(0, 3) }));
}

/** A default relationship from a file or sheet name. */
export function relationshipFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/past|closed|funded|client|customer|borrower|closings/.test(n)) return "past_client";
  if (/lead|prospect|inquir|zillow|leadpops|bankrate/.test(n)) return "lead";
  if (/sphere|friend|family|soi|personal|phone contacts|contacts\.vcf/.test(n)) return "sphere";
  return null;
}

// ---- One list from many files ----

const keyOf = (r: ImportRecord) => [r.phone, r.phone2, r.email].filter(Boolean) as string[];

/** D75: one person in the merge review: their name, file and row. */
export type MergeWho = { ref: string; name: string; file: string; row: number | null };
/**
 * D75: two rows that share a phone or email. `possible` when only a phone is
 * shared and the first names differ (spouses sharing a home phone): those are
 * kept separate unless the loan officer merges them. `merged` is what happens.
 */
export type MergePair = { key: string; a: MergeWho; b: MergeWho; shared: "phone" | "email"; value: string; possible: boolean; merged: boolean };
export type MergeOptions = {
  /** An id per list (the wizard's item ids), so a decision survives edits elsewhere. */
  refs?: readonly string[];
  /** The loan officer's "Keep separate" / "Merge them" answers, by pair key. */
  decide?: Readonly<Record<string, boolean>>;
  /** The tag on a record made from merged rows ("Merged at import Nov 21, 2026"). */
  mergedTag?: string;
};

const whoOf = (r: ImportRecord, ref: string): MergeWho => ({ ref, name: `${r.firstName} ${r.lastName}`.trim() || "(no name)", file: r.sourceFile ?? "", row: r.sourceRow ?? null });

/**
 * Merges duplicates (same phone or email) across files, filling gaps from
 * later copies, and sorts by last name. D75: every merge is reported as a
 * pair for review; a shared phone with different first names is kept
 * separate by default; `decide` overrides either way.
 */
export function mergeRecords(lists: ImportRecord[][], opts: MergeOptions = {}): { records: ImportRecord[]; refs: string[]; merged: number; pairs: MergePair[] } {
  const out: ImportRecord[] = [];
  const roots: MergeWho[] = [];
  const index = new Map<string, number>();
  const pairs: MergePair[] = [];
  let merged = 0;
  const add = (r: ImportRecord, who: MergeWho) => {
    out.push({ ...r, tags: [...r.tags], ...(r.optOuts ? { optOuts: { ...r.optOuts } } : {}) });
    roots.push(who);
    for (const k of keyOf(r)) if (!index.has(k)) index.set(k, out.length - 1);
  };
  lists.forEach((list, li) => {
    list.forEach((r, j) => {
      const who = whoOf(r, `${opts.refs?.[li] ?? li}:${r.sourceRow ?? j}`);
      const hits = keyOf(r).map((k) => [k, index.get(k)] as const).filter((h): h is readonly [string, number] => h[1] !== undefined);
      if (!hits.length) return add(r, who);
      const hit = hits[0][1];
      const a = out[hit];
      const byEmail = hits.find(([k]) => k === r.email && k === a.email);
      const shared = byEmail ? "email" : "phone";
      const possible = !byEmail && !sameFirstName(a.firstName, r.firstName);
      const key = `${roots[hit].ref}|${who.ref}`;
      const together = opts.decide?.[key] ?? !possible;
      pairs.push({ key, a: roots[hit], b: who, shared, value: byEmail ? byEmail[0] : hits[0][0], possible, merged: together });
      if (!together) return add(r, who);
      merged++;
      const fill = <K extends keyof ImportRecord>(k: K) => {
        if ((a[k] === null || a[k] === undefined || a[k] === "") && r[k] !== null && r[k] !== undefined && r[k] !== "") a[k] = r[k];
      };
      (["firstName", "lastName", "email", "street", "city", "state", "zip", "notes", "leadSource", "referredBy", "coBorrower", "loan", "agent"] as const).forEach(fill);
      if (!a.phone && r.phone) a.phone = r.phone;
      else if (r.phone && r.phone !== a.phone && !a.phone2) a.phone2 = r.phone;
      if (a.relationship === "other" && r.relationship !== "other") a.relationship = r.relationship;
      // The tags both rows carry (the import's own) and the merge tag always fit.
      const both = a.tags.filter((t) => r.tags.includes(t));
      const all = mergeTags(a.tags, r.tags, opts.mergedTag ? [opts.mergedTag] : []);
      a.tags = all.length <= MAX_TAGS ? all : withExtraTags(all, [...both, ...(opts.mergedTag ? [opts.mergedTag] : [])], MAX_TAGS);
      // D75: the real file names, not "2 files".
      const files = [...new Set([a.sourceFile, r.sourceFile].filter(Boolean) as string[])];
      if (files.length) a.sourceFile = files.join(", ").slice(0, 160);
      // D69: an opt-out in any copy wins over an opt-in in any other.
      if (r.optOuts) a.optOuts = { ...r.optOuts, ...a.optOuts };
      const phoneStopped = !!(a.optOuts?.text || a.optOuts?.call);
      a.attestedOptIns = [...new Set([...a.attestedOptIns, ...r.attestedOptIns])].filter((c) => (c === "email" ? !a.optOuts?.email : !phoneStopped));
      for (const k of keyOf(a)) index.set(k, hit);
    });
  });
  const name = (r: ImportRecord) => `${r.lastName} ${r.firstName}`.trim().toLowerCase() || r.email || "";
  const order = out.map((_, i) => i).sort((x, y) => name(out[x]).localeCompare(name(out[y])));
  return { records: order.map((i) => out[i]), refs: order.map((i) => roots[i].ref), merged, pairs };
}

/** D69: "text; call; email" for the channels a person opted out of, so the cleaned file keeps them. */
const optedOutOf = (r: ImportRecord) => (["text", "call", "email"] as const).filter((c) => r.optOuts?.[c]).join("; ");

/** The cleaned list as CSV. Cells that would run as spreadsheet formulas are quoted. */
export function toCleanCsv(records: ImportRecord[]): string {
  const q = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["First name", "Last name", "Email", "Mobile", "Other phone", "Street", "City", "State", "ZIP", "Relationship", "Tags", "Notes", "Loan closed on", "Loan amount", "Note rate", "Lead source", "Referred by", "Co-borrower first name", "Co-borrower last name", "Co-borrower phone", "Co-borrower email", "Opted out of"];
  const co = (r: ImportRecord) => r.coBorrower ?? null;
  const rows = records.map((r) => [r.firstName, r.lastName, r.email, r.phone, r.phone2, r.street, r.city, r.state, r.zip, r.relationship, r.tags.join("; "), r.notes, r.loan?.closedOn, r.loan?.amount, r.loan?.noteRate, r.leadSource, r.referredBy, co(r)?.firstName, co(r)?.lastName, co(r)?.phone, co(r)?.email, optedOutOf(r)].map(q).join(","));
  return [head.join(","), ...rows].join("\n") + "\n";
}
