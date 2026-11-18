/**
 * lib/contacts/csv.ts — a small, strict CSV reader (D2). Client-safe.
 * Handles quotes, escaped quotes, commas and line breaks inside quotes,
 * CRLF, a UTF-8 BOM, and semicolon or tab files (detected from the header).
 */

export type Csv = { headers: string[]; rows: string[][] };

export const MAX_ROWS = 10_000;

function detectDelimiter(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(text: string): Csv {
  const src = text.replace(/^﻿/, "");
  const nl = src.search(/\r?\n/);
  const d = detectDelimiter(nl === -1 ? src : src.slice(0, nl));
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === d) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
      if (out.length > MAX_ROWS + 1) break;
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows: rows.slice(0, MAX_ROWS) };
}
