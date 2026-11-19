/**
 * lib/contacts/xlsx.ts — reads Excel workbooks (.xlsx) without a library
 * (D42). Client-safe and pure; the caller supplies raw-deflate
 * decompression (the browser's DecompressionStream, or Node's zlib in
 * tests), so nothing is uploaded to read a spreadsheet.
 *
 * An .xlsx file is a ZIP of XML parts. This reads the central directory,
 * the workbook (sheet names), shared strings, styles (to tell which number
 * cells are dates) and every worksheet, and returns each sheet's rows as
 * text. Dates come back as YYYY-MM-DD. Formulas come back as their cached
 * value. The old binary .xls format isn't supported: save it as .xlsx or
 * CSV first.
 */

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;
export type Sheet = { name: string; rows: string[][] };

export const MAX_SHEET_ROWS = 20_000;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** The files in a ZIP, by name: method 0 (stored) or 8 (deflate). */
export async function unzip(buf: Uint8Array, inflate: Inflate, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = u16(buf, p + 10);
    const csize = u32(buf, p + 20);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const local = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    if (u32(buf, local) !== 0x04034b50) throw new Error("bad zip entry");
    const start = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
    const data = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await inflate(data));
    else throw new Error("unsupported zip compression");
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? _m));

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
};

/** Text of a shared string or inline string: every <t> run joined (phonetic <rPh> runs skipped). */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");

/** "AB12" → 27 (zero-based column). */
export function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel's date serial (1900 system) to YYYY-MM-DD. */
export function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000)).toISOString().slice(0, 10);
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const isDateFormat = (code: string) => /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")) && !/^[#0.,%\s]+$/.test(code);

/** Which cell styles (by index) show a date. */
function dateStyles(stylesXml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode") ?? "";
    custom.set(id, code);
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  const out = new Set<number>();
  [...xfs.matchAll(/<xf\b[^>]*\/?>/g)].forEach((m, i) => {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) out.add(i);
  });
  return out;
}

/** Every sheet of a workbook, as rows of text. */
export async function readXlsx(bytes: Uint8Array, inflate: Inflate): Promise<Sheet[]> {
  const files = await unzip(bytes, inflate, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || n === "xl/styles.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const dec = new TextDecoder();
  const text = (n: string) => (files.has(n) ? dec.decode(files.get(n)!) : "");
  const wb = text("xl/workbook.xml");
  if (!wb) throw new Error("not an Excel workbook");
  const rels = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const dates = dateStyles(text("xl/styles.xml"));
  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Sheet ${sheets.length + 1}`;
    const rid = attr(m[0], "r:id");
    const path = `xl/${rid && rels.get(rid) ? rels.get(rid) : `worksheets/sheet${sheets.length + 1}.xml`}`;
    const xml = text(path);
    if (!xml) continue;
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      if (rows.length >= MAX_SHEET_ROWS) break;
      const body = r[1] ?? "";
      const row: string[] = [];
      let next = 0;
      for (const c of body.matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${c[1]}>`;
        const ref = attr(tag, "r");
        const at = ref ? colIndex(ref) : next;
        next = at + 1;
        const t = attr(tag, "t");
        const inner = c[3] ?? "";
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = textOf(inner);
        else if (t === "b") val = v === "1" ? "TRUE" : v === "0" ? "FALSE" : "";
        else if (t === "str" || t === "e") val = decodeXml(v ?? "");
        else if (v !== undefined) {
          const num = Number(v);
          const style = Number(attr(tag, "s") ?? -1);
          val = dates.has(style) ? serialToIso(num) ?? v : v;
        }
        while (row.length < at) row.push("");
        row[at] = val.trim();
      }
      if (row.some((x) => x !== "")) rows.push(row);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/** The browser's raw-deflate decompression (Chrome, Edge, Safari 16.4+, Firefox 113+). */
export const browserInflate: Inflate = async (data) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
