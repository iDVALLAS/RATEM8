/**
 * lib/second-look/redact.ts — pure, client-safe redaction helpers.
 *
 * Runs in the browser BEFORE anything leaves the device. No I/O, no
 * DOM. Tested in redact.test.ts.
 *
 * Two jobs:
 *   1. Text: find and mask sensitive strings (SSN-shaped, loan IDs,
 *      emails, phone numbers, simple street addresses).
 *   2. Boxes: normalize the rectangles a user draws over a preview so
 *      they can be rendered as overlays and later composited onto the
 *      image at its natural size.
 */

export type SensitiveKind = "ssn" | "loanId" | "email" | "phone" | "address";

export type SensitiveMatch = {
  kind: SensitiveKind;
  start: number;
  end: number;
  value: string;
};

/** What a masked string is replaced with, on screen and in the payload. */
export const MASK = "•••••";

/**
 * Ordered patterns. Order matters when spans overlap: the first pattern
 * to claim a character range wins (SSN before phone, so a nine-digit
 * dashed number is treated as an SSN, not a phone).
 */
export const PATTERNS: { kind: SensitiveKind; re: RegExp }[] = [
  { kind: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    kind: "loanId",
    re: /\b(?:loan|application|file|case)\s*(?:id|#|number|no\.?)[:\s]*[A-Z0-9][A-Z0-9-]{5,}\b/gi,
  },
  { kind: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  {
    kind: "phone",
    re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  {
    kind: "address",
    re: /\b\d{1,6}\s+(?:[A-Z0-9'.-]+\s+){0,4}?(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|ter|circle|cir|highway|hwy|parkway|pkwy|trail|trl)\b(?:\.?,?\s*(?:#|apt|unit|suite|ste)\.?\s*[A-Z0-9-]+)?/gi,
  },
];

/**
 * Find every sensitive span in `text`. Overlapping spans are resolved
 * in pattern order; results are sorted by start offset.
 */
export function findSensitive(text: string): SensitiveMatch[] {
  const taken: boolean[] = new Array(text.length).fill(false);
  const out: SensitiveMatch[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (end === start) {
        re.lastIndex++;
        continue;
      }
      let clash = false;
      for (let i = start; i < end; i++) {
        if (taken[i]) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      out.push({ kind, start, end, value: m[0] });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export type MaskResult = {
  masked: string;
  matches: SensitiveMatch[];
};

/** Replace every sensitive span with MASK. Idempotent. */
export function maskText(text: string): MaskResult {
  const matches = findSensitive(text);
  if (matches.length === 0) return { masked: text, matches };
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start) + MASK;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return { masked: out, matches };
}

/** Human label for a match kind (used on the "•••••" chips). */
export function kindLabel(kind: SensitiveKind): string {
  switch (kind) {
    case "ssn":
      return "SSN-shaped";
    case "loanId":
      return "Loan ID";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "address":
      return "Address";
  }
}

/* ─── Redaction boxes ───────────────────────────────────────── */

/** A rectangle in normalized (0..1) coordinates of the preview image. */
export type RedactionBox = { x: number; y: number; w: number; h: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * Turn two corner points (any order) into a normalized, clamped box.
 * Returns null when the box is too small to mean anything.
 */
export function boxFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  minSize = 0.01
): RedactionBox | null {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const w = r4(x2 - x1);
  const h = r4(y2 - y1);
  if (w < minSize || h < minSize) return null;
  return { x: r4(x1), y: r4(y1), w, h };
}

/** Scale a normalized box to pixel space (e.g. the image's natural size). */
export function boxToPixels(box: RedactionBox, width: number, height: number) {
  return {
    x: Math.floor(box.x * width),
    y: Math.floor(box.y * height),
    w: Math.ceil(box.w * width),
    h: Math.ceil(box.h * height),
  };
}

/** Naive PDF page count from raw bytes: counts `/Type /Page` objects. */
export function countPdfPages(latin1: string): number | null {
  if (!latin1.startsWith("%PDF")) return null;
  const m = latin1.match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : null;
}
