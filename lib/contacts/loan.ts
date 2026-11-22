/**
 * lib/contacts/loan.ts — the loan details kept on a contact (D80).
 * Client-safe and pure.
 *
 * What a file, the loan system or the loan officer says about a client's
 * closed loan, read into a few fixed values so lists can find them:
 * the program (conventional, FHA, VA, USDA, jumbo, HELOC, non-QM, other),
 * fixed or ARM, the term in months, the purpose, occupancy, property type
 * and the lender, plus the ARM's first change date and margin when a column
 * has them. "5/1 ARM", "7/6 ARM", "30 Yr Fixed" and "FHA 30" all read.
 *
 * Fair lending: nothing here is about who the borrower is. Age, birth date,
 * race, ethnicity, sex, marital or familial status, national origin,
 * religion and disability are never loan fields (lib/contacts/mapping.ts
 * keeps such columns out of an import entirely).
 *
 * A note rate here is the client's own closed rate from the loan officer's
 * records, shown to the loan officer only. It is never published or put
 * into a message.
 */
import { contactListsCopy as lc } from "@/lib/content/contact-lists";

export const LOAN_PROGRAMS = ["conventional", "fha", "va", "usda", "jumbo", "heloc", "non_qm", "other"] as const;
export type LoanProgram = (typeof LOAN_PROGRAMS)[number];
export const RATE_TYPES = ["fixed", "arm"] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const LOAN_PURPOSES = ["purchase", "refi", "cash_out"] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];
export const OCCUPANCIES = ["primary", "second_home", "investment"] as const;
export type Occupancy = (typeof OCCUPANCIES)[number];
export const PROPERTY_TYPES = ["single_family", "condo", "townhouse", "multi_unit", "manufactured", "other"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** A contact's loan. The first three are D2's; the rest are D80's (optional, so older records still read). */
export type LoanDetails = {
  closedOn: string | null;
  amount: number | null;
  noteRate: number | null;
  program?: LoanProgram | null;
  rateType?: RateType | null;
  /** YYYY-MM-DD, only when a column (or the loan officer) gives it. */
  armFirstChange?: string | null;
  armMargin?: number | null;
  termMonths?: number | null;
  purpose?: LoanPurpose | null;
  occupancy?: Occupancy | null;
  propertyType?: PropertyType | null;
  /** The investor or wholesale lender, from the file or the loan officer only. */
  lender?: string | null;
};

const has = (v: unknown) => v !== null && v !== undefined && v !== "";
/** Whether a loan has anything worth keeping. */
export const anyLoan = (l: Partial<LoanDetails> | null | undefined) => !!l && Object.values(l).some(has);

/** "5/1", "7/6", "10/6", "5-1", "5/5": the fixed years and the change period of an ARM. */
const ARM_RATIO = /\b(1|2|3|5|7|10|15)\s*[/-]\s*(1|5|6)\b(?!\s*(yr|year|y\b|%))/i;
const ARM_WORD = /\barms?\b|adjustable|variable|hybrid/i;
const FIXED_WORD = /\bfixed\b|\bfrm\b|\bfix\b/i;

/** Program words, most specific first. */
const PROGRAMS: [RegExp, LoanProgram][] = [
  [/\bheloc\b|home equity line/i, "heloc"],
  [/non.?qm|\bnqm\b|bank.?statement|\bdscr\b|alt.?doc|asset.?(based|depletion)/i, "non_qm"],
  [/\bfha\b|203\s*\(?k\)?|\bfha\d/i, "fha"],
  [/\bva\b|\birrrl\b|veterans? affairs|\bva\d/i, "va"],
  [/\busda\b|rural (housing|development)|\brhs\b/i, "usda"],
  [/\bjumbo\b|non.?conforming|\bhigh.?balance\b/i, "jumbo"],
  [/conv|conforming|fannie|freddie|\bfnma\b|\bfhlmc\b|home ?ready|home ?possible|\bhfa\b|\bcf\b/i, "conventional"],
];

/** The term in years from words like "30 yr", "15-year", "30Y", or a bare 10/15/20/25/30/40. */
function termOf(text: string): number | null {
  const t = text.replace(ARM_RATIO, " ");
  const y = /\b(10|15|20|25|30|40)\s*-?\s*(yrs?|years?|y)\b/i.exec(t);
  if (y) return Number(y[1]) * 12;
  const m = /\b(120|180|240|300|360|480)\s*(mo|mos|months?)?\b/i.exec(t);
  if (m) return Number(m[1]);
  const bare = /(?:^|\s)(10|15|20|25|30|40)(?:\s|$)/.exec(t);
  return bare ? Number(bare[1]) * 12 : null;
}

/**
 * A program, product or loan-type cell: "5/1 ARM" (an ARM), "30 Yr Fixed"
 * (fixed, 360 months), "FHA 30" (FHA, 360 months), "VA IRRRL". Anything it
 * can't place is null, except loan-like words it doesn't know ("other").
 */
export function readProgram(raw: string | null | undefined): { program: LoanProgram | null; rateType: RateType | null; termMonths: number | null } {
  const text = String(raw ?? "").trim();
  if (!text || /^(n\/?a|none|-+|unknown|tbd)$/i.test(text)) return { program: null, rateType: null, termMonths: null };
  const rateType: RateType | null = ARM_WORD.test(text) || ARM_RATIO.test(text) ? "arm" : FIXED_WORD.test(text) ? "fixed" : null;
  let program = PROGRAMS.find(([re]) => re.test(text))?.[1] ?? null;
  if (!program) {
    // Only rate and term words ("30 Yr Fixed", "5/1 ARM") say nothing about the program.
    const rest = text.replace(ARM_RATIO, " ").replace(ARM_WORD, " ").replace(FIXED_WORD, " ").replace(/\b\d+\s*-?\s*(yrs?|years?|y|mo|mos|months?)?\b/gi, " ").replace(/\b(rate|loan|mortgage|term|amortiz\w*|program|product)\b/gi, " ").replace(/[^a-z]/gi, "");
    if (rest.length >= 2) program = "other";
  }
  return { program, rateType, termMonths: termOf(text) };
}

/** A "Fixed or ARM" / "Amortization" cell. */
export function readRateType(raw: string | null | undefined): RateType | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (ARM_WORD.test(t) || ARM_RATIO.test(t)) return "arm";
  if (FIXED_WORD.test(t)) return "fixed";
  return null;
}

/** A term cell: "30 yr" and "30" are 360 months; "360" is 360; "15 years" is 180. */
export function readTerm(raw: string | null | undefined): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const years = /^(\d{1,2})\s*-?\s*(yrs?|years?|y)?$/i.exec(t);
  if (years && Number(years[1]) >= 5 && Number(years[1]) <= 50) return Number(years[1]) * 12;
  const months = /^(\d{2,3})\s*(mo|mos|months?)?$/i.exec(t);
  if (months && Number(months[1]) >= 60 && Number(months[1]) <= 600) return Number(months[1]);
  return termOf(t);
}

export function readPurpose(raw: string | null | undefined): LoanPurpose | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/cash.?out|\bc\/o\b|\bcashout\b|equity take/i.test(t)) return "cash_out";
  if (/refi|refinanc|rate.?(and|&|\/).?term|\br\/t\b|streamline|\birrrl\b|\bnoo refi\b/i.test(t)) return "refi";
  if (/purch|\bbuy|\bpur\b/i.test(t)) return "purchase";
  return null;
}

export function readOccupancy(raw: string | null | undefined): Occupancy | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/invest|rental|non.?owner|\bnoo\b/i.test(t)) return "investment";
  if (/second|vacation|\b2nd\b/i.test(t)) return "second_home";
  if (/primary|owner|principal|\boo\b/i.test(t)) return "primary";
  return null;
}

export function readPropertyType(raw: string | null | undefined): PropertyType | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/condo/i.test(t)) return "condo";
  if (/town ?(house|home)|\bth\b/i.test(t)) return "townhouse";
  if (/\b[234]\s*-?\s*(unit|plex)|(two|three|four)\s*-?\s*(unit|plex)|multi|duplex|triplex|fourplex|quadplex/i.test(t)) return "multi_unit";
  if (/manufactured|mobile/i.test(t)) return "manufactured";
  if (/single|\bsfr\b|\bsfd\b|detached|\bpud\b|\bhouse\b/i.test(t)) return "single_family";
  return "other";
}

/** An ARM margin like "2.75" or "2.75%" (a real margin is between 0 and 10). */
export function readMargin(raw: string | null | undefined): number | null {
  const v = Number(String(raw ?? "").replace(/[%\s]/g, ""));
  return String(raw ?? "").trim() && Number.isFinite(v) && v > 0 && v < 10 ? Math.round(v * 1000) / 1000 : null;
}

/** A lender name from the file (trimmed; never looked up anywhere). */
export const readLender = (raw: string | null | undefined): string | null => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;

/** The loan system's `loanType` and `purpose` (D6 sync) read the same way as a file. */
export function loanFromPipeline(loanType: string | null | undefined, purpose: string | null | undefined): Partial<LoanDetails> {
  const p = readProgram(loanType);
  const out: Partial<LoanDetails> = {};
  if (p.program) out.program = p.program;
  if (p.rateType) out.rateType = p.rateType;
  if (p.termMonths) out.termMonths = p.termMonths;
  const pu = readPurpose(purpose);
  if (pu) out.purpose = pu;
  return out;
}

/** A rate as the loan officer reads it: "7.875%". */
export const showRate = (r: number | null | undefined) => (r === null || r === undefined ? "" : `${r.toFixed(3)}%`);
const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Conventional ARM", "FHA", "Fixed", or "". */
export function loanKind(l: Partial<LoanDetails> | null | undefined): string {
  if (!l) return "";
  const p = l.program ? lc.loan.programs[l.program] : "";
  const r = l.rateType ? lc.loan.rateTypes[l.rateType] : "";
  return p && l.rateType === "arm" ? `${p} ${r}` : p || r;
}

/** The list row's loan line, for the loan officer only: "7.875% · Closed Oct 2023 · FHA". */
export function loanLine(l: Partial<LoanDetails> | null | undefined): string {
  if (!l) return "";
  return [showRate(l.noteRate), l.closedOn ? lc.loan.closedShort(monthYear(l.closedOn)) : "", loanKind(l)].filter(Boolean).join(" · ");
}
