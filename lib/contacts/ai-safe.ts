/**
 * lib/contacts/ai-safe.ts — what of an import file may go to M8 (D93).
 * Client-safe and pure; used by the browser to build a request and again
 * by the server (lib/contacts/ai-read.ts) before anything reaches a model.
 *
 * Owner decision 2026-11-25: inside Command Center, M8 may read the real
 * contact data to help the loan officer ("AI has full access to the MLO
 * CC"; the public LoanM8 side stays private). The hard limits that remain:
 *  - Social Security numbers, birth dates and account numbers never go:
 *    their columns are left out by header and by contents (`isSensitive`),
 *    and any cell that still looks like one is masked (`scrubCell`).
 *  - Protected-trait columns (age, race, sex, family status…) never go.
 *  - RETR data never goes (an agents-only import, or a file that looks
 *    like a RETR export: lib/contacts/guess.ts `isRetrFile`).
 *  - The text goes inside nonce data blocks; answers are zod-checked.
 */
import type { Csv } from "./csv";
import { columnValues, isSensitive } from "./review";

export const READ_MAX_COLS = 80;
export const READ_SAMPLE = 12;
export const SORT_MAX_ROWS = 150;
export const FIX_MAX = 100;
export const CELL_MAX = 80;
export const MASK = "•••";

const SSN = /\b\d{3}[-\s.]\d{2}[-\s.]\d{4}\b/g;
/** 12 or more digits (spaces or dashes between): an account, card or routing number. A US phone has 10 or 11. */
const LONG_NUMBER = /(?<!\d)\d(?:[\s-]?\d){11,}(?!\d)/g;
const NINE = /(?<![\d$.,])\d{9}(?![\d%.,])/g;
const BIRTH = /\b(dob|d\.o\.b|date of birth|born|birthday|birth ?date)\b/i;
const DATE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi;

/** One cell as M8 may see it: SSN-shaped and long account-like numbers masked, a birth date in a note masked, at most 80 characters. */
export function scrubCell(raw: string): string {
  let v = String(raw ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  v = v.replace(SSN, MASK).replace(LONG_NUMBER, MASK).replace(NINE, MASK);
  if (BIRTH.test(v)) v = v.replace(DATE, MASK);
  return v.slice(0, CELL_MAX);
}

/** The columns that may be sent: not private data, not a protected trait (header and contents both checked). */
export function sendableColumns(t: Csv): number[] {
  return t.headers.map((_, i) => i).filter((i) => !isSensitive(t.headers[i] ?? "", columnValues(t, i, 60))).slice(0, READ_MAX_COLS);
}

/** Up to `n` different values from across the whole column (first, last and evenly between, not just the top rows), scrubbed. */
export function sampleColumn(t: Csv, col: number, n = READ_SAMPLE): string[] {
  const filled = t.rows.map((r) => (r[col] ?? "").trim()).filter(Boolean);
  if (!filled.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const take = (i: number) => {
    const v = scrubCell(filled[i]);
    if (!v || seen.has(v.toLowerCase()) || out.length >= n) return;
    seen.add(v.toLowerCase());
    out.push(v);
  };
  const last = filled.length - 1;
  for (let k = 0; k < n; k++) take(n === 1 ? 0 : Math.round((k * last) / (n - 1)));
  // Repeated values: fill up from the rest, in order.
  for (let i = 0; i <= last && out.length < n; i++) take(i);
  return out;
}

export type ReadColumn = { col: number; header: string; values: string[]; now: string | null };

/** What M8 reads of a file's columns: each sendable column's header, a spread sample of values, and what the rules matched it to. */
export function readColumns(t: Csv, fieldAt: (col: number) => string | null): ReadColumn[] {
  return sendableColumns(t).map((col) => ({ col, header: (t.headers[col] ?? "").slice(0, 80), values: sampleColumn(t, col), now: fieldAt(col) }));
}

/** Rows for M8 to sort (client or agent): only the sendable columns, scrubbed. */
export function readRows(t: Csv, rows: number[]): { cols: number[]; rows: { at: number; cells: string[] }[] } {
  const cols = sendableColumns(t);
  return { cols, rows: rows.slice(0, SORT_MAX_ROWS).map((at) => ({ at, cells: cols.map((c) => scrubCell(t.rows[at]?.[c] ?? "")) })) };
}
