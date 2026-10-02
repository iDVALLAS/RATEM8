/**
 * lib/pricing/playbook.ts — the loan officer's lender playbook.
 *
 * Structured fields from the MLO's own experience plus one short note per
 * lender. Notes NEVER change ranking, filtering, or the anti-steering set:
 * `selectAntiSteering()` takes quotes only. Notes render after the three
 * options as "Your loan officer's notes", with the lender anonymized.
 *
 * Free text is screened before save. Anything that references or proxies a
 * protected class, neighborhood composition, or borrower characteristics is
 * rejected with an explanation.
 */

export const NICHES = ["non_qm", "construction", "jumbo", "self_employed", "bank_statement", "dscr", "va", "fha", "usda", "renovation", "heloc"] as const;
export type Niche = (typeof NICHES)[number];

export type PlaybookEntry = {
  lenderKey: string;
  turnTimes: "fast" | "typical" | "slow" | "";
  conditionStyle: "light" | "standard" | "heavy" | "";
  exceptionAppetite: "low" | "medium" | "high" | "";
  commsQuality: "excellent" | "good" | "fair" | "";
  niches: Niche[];
  note: string;
};

export const NOTE_MAX = 280;

type Rule = { category: string; pattern: RegExp };

const w = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`, "i");

/**
 * Screening rules. Deliberately broad: a false positive costs the MLO a
 * rewrite; a false negative could put a fair-lending problem in front of a
 * borrower. Product niches (VA, FHA, self-employed) are structured fields,
 * not notes.
 */
const RULES: Rule[] = [
  { category: "race, color or ethnicity", pattern: w(["race", "racial", "races", "color", "colored", "ethnic", "ethnicity", "black", "white", "asian", "hispanic", "latino", "latina", "latinx", "african", "caucasian", "minority", "minorities"]) },
  { category: "national origin or immigration", pattern: w(["national origin", "nationality", "foreign", "foreigner", "immigrant", "immigrants", "immigration", "accent", "english speaker", "non-english", "citizenship"]) },
  { category: "religion", pattern: w(["religion", "religious", "church", "mosque", "synagogue", "temple", "jewish", "muslim", "christian", "catholic", "hindu"]) },
  { category: "sex, sexual orientation or gender identity", pattern: w(["sex", "gender", "male", "female", "women", "woman", "men", "gay", "lesbian", "transgender", "sexual orientation"]) },
  { category: "familial status or pregnancy", pattern: w(["pregnant", "pregnancy", "children", "kids", "family size", "familial", "single mom", "single mother", "single dad"]) },
  { category: "marital status", pattern: w(["married", "marital", "divorced", "divorce", "widow", "widowed", "spouse"]) },
  { category: "age", pattern: w(["age", "aged", "elderly", "senior", "seniors", "retiree", "retirees", "young", "older", "millennial", "boomer", "boomers"]) },
  { category: "disability", pattern: w(["disability", "disabled", "handicap", "handicapped", "wheelchair"]) },
  { category: "public assistance income", pattern: w(["public assistance", "welfare", "section 8", "food stamps", "snap benefits", "disability income"]) },
  { category: "neighborhood composition or location proxies", pattern: w(["neighborhood", "neighbourhood", "zip code", "zip codes", "zipcode", "inner city", "ghetto", "barrio", "bad area", "good area", "good schools", "demographic", "demographics", "redline", "redlining"]) },
  { category: "characteristics of individual borrowers", pattern: w(["these borrowers", "those borrowers", "those people", "these people", "type of borrower", "kind of borrower", "borrowers like"]) },
];

export type ScreenResult = { ok: true } | { ok: false; reasons: string[] };

export function screenNote(text: string): ScreenResult {
  const reasons: string[] = [];
  if (text.length > NOTE_MAX) reasons.push(`Notes are limited to ${NOTE_MAX} characters.`);
  for (const r of RULES) {
    const m = r.pattern.exec(text);
    if (m) reasons.push(`"${m[0]}" refers to ${r.category}. Notes may describe the lender (turn times, conditions, communication, programs), never borrowers or places.`);
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export function emptyEntry(lenderKey: string): PlaybookEntry {
  return { lenderKey, turnTimes: "", conditionStyle: "", exceptionAppetite: "", commsQuality: "", niches: [], note: "" };
}

const LABELS: Record<string, string> = {
  fast: "fast turn times", typical: "typical turn times", slow: "slower turn times",
  light: "light conditions", standard: "standard conditions", heavy: "heavier conditions",
  low: "low exception appetite", medium: "some exception appetite", high: "open to exceptions",
  excellent: "excellent communication", good: "good communication", fair: "fair communication",
};

/** Plain-language summary of the structured fields. */
export function summarize(e: PlaybookEntry): string[] {
  return [e.turnTimes, e.conditionStyle, e.exceptionAppetite, e.commsQuality].filter(Boolean).map((v) => LABELS[v as string]);
}
