/**
 * lib/m8/redact.ts — removes SSNs, dates of birth and account numbers from
 * chat text before it reaches the model or a log (C4).
 *
 * Deliberately broad: a false positive masks a harmless number; a false
 * negative would send a sensitive one to the model. Dollar amounts
 * ("$640,000"), ZIP codes and percentages are left alone.
 */
import { MASK } from "@/lib/second-look/redact";

export type RedactionKind = "ssn" | "dob" | "account";
export type ChatRedaction = { text: string; kinds: RedactionKind[] };

// Number edges: a run isn't part of a dollar amount or a 640,000-style figure,
// but a trailing comma or period (end of a sentence) is fine.
const SSN = /\b\d{3}[-\s.]\d{2}[-\s.]\d{4}\b|(?<![$\d])(?<!\d[,.])\d{9}(?![\d%]|[,.]\d)/g;
const DATE = /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)?\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi;
const BIRTH = /\b(?:dob|d\.o\.b|date of birth|born|birthday|birth date)\b/i;
// 8–19 digits, spaces or dashes allowed between them: account, card and routing numbers.
const ACCOUNT = /(?<![$\d])(?<!\d[,.])\d(?:[\s-]?\d){7,18}(?![\d%]|[,.]\d)/g;

function yearOf(date: string): number | null {
  const m = date.match(/(\d{2,4})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  return m[1].length === 2 ? (y > 30 ? 1900 + y : 2000 + y) : y;
}

export function redactChatInput(input: string): ChatRedaction {
  const kinds = new Set<RedactionKind>();
  let text = input.normalize("NFKC");
  text = text.replace(SSN, () => {
    kinds.add("ssn");
    return MASK;
  });
  text = text.replace(DATE, (d, offset: number) => {
    const near = text.slice(Math.max(0, offset - 30), offset + d.length + 15);
    const y = yearOf(d);
    // A date near a birth word, or a year a borrower was likely born in.
    if (BIRTH.test(near) || (y !== null && y >= 1920 && y <= 2010)) {
      kinds.add("dob");
      return MASK;
    }
    return d;
  });
  text = text.replace(ACCOUNT, () => {
    kinds.add("account");
    return MASK;
  });
  return { text, kinds: [...kinds] };
}
