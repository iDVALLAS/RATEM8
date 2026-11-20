/**
 * lib/forms/pdf.ts — the PDF work for LOA forms (D66). SERVER-ONLY.
 *
 *  - makeLetterPdf: a one- or two-page letter on the loan officer's
 *    letterhead (name, NMLS, company and its NMLS, Equal Housing line).
 *  - readFields: the fillable fields in a PDF someone dropped in (official
 *    forms like Fannie Mae 1005 and 1006, IRS 4506-C, SSA-89, or a title or
 *    escrow company's own).
 *  - fillPdf: puts values into those fields and keeps the form fillable, so
 *    the borrower can still add what Command Center never holds (Social
 *    Security number, date of birth, account numbers) and sign.
 * Uses pdf-lib's standard fonts, which only know Western European letters;
 * other characters are swapped for close ASCII.
 */
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type Letterhead = { name: string; nmls: string; company: string; companyNmls: string; address: string; phone: string; email: string };
export type FieldKind = "text" | "check" | "choice" | "other";
export type PdfField = { name: string; kind: FieldKind; options: string[]; value: string; maxLength: number | null };

/** Characters the standard PDF fonts can draw. */
export function winAnsi(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "-")
    .replace(/ /g, " ")
    .replace(/\t/g, "    ")
    .replace(/[^\x20-\x7E\n¡-ÿ]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsi(text).split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        // A single word wider than the line is cut.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let i = w.length - 1;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          out.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/** A letter on the loan officer's letterhead, as PDF bytes. */
export async function makeLetterPdf(head: Letterhead, title: string, body: string, now = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(title));
  doc.setAuthor(winAnsi(head.name));
  doc.setProducer("MLO Command Center");
  doc.setCreationDate(now);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.12, 0.1);
  const soft = rgb(0.35, 0.4, 0.38);
  const [W, H, M] = [612, 792, 60];
  const width = W - M * 2;
  const footer = winAnsi(`${head.company}${head.companyNmls ? ` | NMLS ${head.companyNmls}` : ""} | Equal Housing Opportunity`);

  let page = doc.addPage([W, H]);
  let y = H - M;
  const headLines = [
    [head.name ? `${head.name}${head.nmls ? `, NMLS ${head.nmls}` : ""}` : "", bold, 13, ink],
    [head.company, font, 10, soft],
    [head.address, font, 9, soft],
    [[head.phone, head.email].filter(Boolean).join(" | "), font, 9, soft],
  ] as const;
  for (const [text, f, size, color] of headLines) {
    if (!text) continue;
    page.drawText(winAnsi(text), { x: M, y, size, font: f, color });
    y -= size + 4;
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: soft });
  y -= 26;
  for (const line of wrap(title, bold, 14, width)) {
    page.drawText(line, { x: M, y, size: 14, font: bold, color: ink });
    y -= 19;
  }
  y -= 6;
  const size = 10.5;
  const lead = 15;
  const drawFooter = () => page.drawText(footer, { x: M, y: 32, size: 8, font, color: soft });
  for (const line of wrap(body, font, size, width)) {
    if (y < 70) {
      drawFooter();
      page = doc.addPage([W, H]);
      y = H - M;
    }
    if (line) page.drawText(line, { x: M, y, size, font, color: ink });
    y -= lead;
  }
  drawFooter();
  return doc.save();
}

/** Is it a PDF at all? */
export const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/** The fillable fields in a PDF (empty when it has none). Throws on a locked or broken file. */
export async function readFields(bytes: Uint8Array): Promise<PdfField[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: PdfField[] = [];
  for (const f of doc.getForm().getFields()) {
    const name = f.getName();
    if (f instanceof PDFTextField) out.push({ name, kind: "text", options: [], value: f.getText() ?? "", maxLength: f.getMaxLength() ?? null });
    else if (f instanceof PDFCheckBox) out.push({ name, kind: "check", options: [], value: f.isChecked() ? "yes" : "", maxLength: null });
    else if (f instanceof PDFDropdown || f instanceof PDFOptionList) out.push({ name, kind: "choice", options: f.getOptions(), value: f.getSelected()[0] ?? "", maxLength: null });
    else if (f instanceof PDFRadioGroup) out.push({ name, kind: "choice", options: f.getOptions(), value: f.getSelected() ?? "", maxLength: null });
    else out.push({ name, kind: "other", options: [], value: "", maxLength: null });
  }
  return out;
}

/** Fills the named fields and keeps the form fillable. Fields that can't take a value are left as they were. */
export async function fillPdf(bytes: Uint8Array, values: Record<string, string>): Promise<{ bytes: Uint8Array; filled: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let filled = 0;
  for (const f of form.getFields()) {
    const raw = values[f.getName()];
    if (raw === undefined) continue;
    const v = winAnsi(raw).replace(/\n/g, " ").trim();
    try {
      if (f instanceof PDFTextField) {
        const max = f.getMaxLength();
        f.setText(max ? v.slice(0, max) : v);
        f.updateAppearances(font);
      } else if (f instanceof PDFCheckBox) {
        if (/^(y|yes|x|true|on|1)$/i.test(v)) f.check();
        else f.uncheck();
      } else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
        if (f.getOptions().includes(v)) f.select(v);
        else continue;
      } else if (f instanceof PDFRadioGroup) {
        if (f.getOptions().includes(v)) f.select(v);
        else continue;
      } else continue;
      filled++;
    } catch {
      /* a field with a broken appearance stays as it was */
    }
  }
  return { bytes: await doc.save(), filled };
}
