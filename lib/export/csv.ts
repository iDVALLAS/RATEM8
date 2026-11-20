/**
 * lib/export/csv.ts — spreadsheets for the export (D53.1). Opens cleanly in
 * Excel and Google Sheets (UTF-8 with a byte-order mark), and a cell that
 * starts like a formula is written as text so a spreadsheet never runs it.
 */
const FORMULA = /^[=@\t\r]|^[+-](?![\d\s().-]*$)/;

export function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (typeof v === "string" && FORMULA.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Nested objects become dotted columns; arrays stay as JSON in one cell. */
export function flatten(o: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else out[key] = Array.isArray(v) ? (v.length ? v : "") : v;
  }
  return out;
}

export function toCsv(rows: object[], opts: { first?: string[]; omit?: string[] } = {}): string {
  const flat = rows.map((r) => flatten(r as Record<string, unknown>));
  const omit = new Set(opts.omit ?? []);
  const cols: string[] = [];
  for (const c of opts.first ?? []) if (!cols.includes(c)) cols.push(c);
  for (const r of flat) for (const k of Object.keys(r)) if (!cols.includes(k) && !omit.has(k)) cols.push(k);
  const lines = [cols.map(cell).join(","), ...flat.map((r) => cols.map((c) => cell(r[c])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
