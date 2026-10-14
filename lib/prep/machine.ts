/**
 * lib/prep/machine.ts — "Prep my application with M8" (v18, Item 2b).
 *
 * A pure, UI-agnostic state machine. The text chat (components/chat/
 * PrepFlow.tsx) drives it today; voice will drive the same machine when
 * it ships (read `promptFor`, feed `answer`). The M8 system prompt lists
 * the same fields (PREP_FIELD_IDS), so live M8 asks for exactly these.
 *
 * Hard limits, enforced here and tested:
 *  - Only non-sensitive fields. There is no field for SSN, date of birth,
 *    account numbers, or income documents, and free text that looks like
 *    one is rejected (`containsSensitive`), never stored.
 *  - Nothing is submitted. The summary stays in the browser; the hand-off
 *    is the matched MLO's own secure application (applicationUrl).
 */

export const PREP_FIELD_IDS = [
  "purpose",
  "propertyType",
  "state",
  "price",
  "down",
  "occupancy",
  "employment",
  "income",
  "timeline",
  "questions",
] as const;

export type PrepFieldId = (typeof PREP_FIELD_IDS)[number];

export type PrepFieldKind = "choice" | "state" | "text";

export const PREP_FIELDS: ReadonlyArray<{ id: PrepFieldId; kind: PrepFieldKind; optional: boolean }> = [
  { id: "purpose", kind: "choice", optional: false },
  { id: "propertyType", kind: "choice", optional: false },
  { id: "state", kind: "state", optional: false },
  { id: "price", kind: "choice", optional: false },
  { id: "down", kind: "choice", optional: false },
  { id: "occupancy", kind: "choice", optional: false },
  { id: "employment", kind: "choice", optional: false },
  { id: "income", kind: "choice", optional: false },
  { id: "timeline", kind: "choice", optional: false },
  { id: "questions", kind: "text", optional: true },
];

/** Plain descriptions of each field, for the M8 system prompt (and voice). */
export const PREP_FIELD_DESCRIPTIONS: Record<PrepFieldId, string> = {
  purpose: "loan purpose (buy, refinance, cash-out refinance)",
  propertyType: "property type",
  state: "the property's state",
  price: "rough price or current value (a range)",
  down: "down payment or equity (a range)",
  occupancy: "occupancy (primary home, second home, investment)",
  employment: "employment type (W-2, self-employed, retired, other)",
  income: "household income (a range, or prefers not to say)",
  timeline: "timeline",
  questions: "questions for the loan officer",
};

/** What M8 must never ask for, in prep or anywhere else. */
export const NEVER_ASK = ["Social Security number", "date of birth", "bank or account numbers", "income documents (pay stubs, W-2s, tax returns)"] as const;

export type PrepAnswers = Partial<Record<PrepFieldId, string>>;

export type PrepState = {
  /** Index into PREP_FIELDS; equals PREP_FIELDS.length on the summary. */
  step: number;
  answers: PrepAnswers;
};

export type PrepError = "empty" | "sensitive" | "invalid";

export const QUESTIONS_MAX = 500;

/**
 * True when free text looks like an SSN, a date of birth, or an account
 * number. Deliberately broad: a false positive just asks the borrower to
 * rephrase; a false negative would keep sensitive data in the summary.
 */
export function containsSensitive(text: string): boolean {
  const t = text.normalize("NFKC");
  if (/\b\d{3}[-\s.]?\d{2}[-\s.]?\d{4}\b/.test(t)) return true; // SSN shapes
  if (/\b(ssn|social security)\b/i.test(t) && /\d{4}/.test(t)) return true;
  if (/\b\d{1,2}[/.-]\d{1,2}[/.-](19|20)?\d{2}\b/.test(t)) return true; // dates
  if (/\b(dob|date of birth|born on)\b/i.test(t)) return true;
  if (/(?:\d[\s-]?){8,}/.test(t)) return true; // account / card / routing numbers
  return false;
}

export function start(prefill: PrepAnswers = {}): PrepState {
  return { step: 0, answers: { ...prefill } };
}

export function currentField(s: PrepState) {
  return PREP_FIELDS[s.step] ?? null;
}

export function isDone(s: PrepState): boolean {
  return s.step >= PREP_FIELDS.length;
}

/**
 * Answer the current step. `allowed` is the set of valid values for a
 * choice or state step (the UI's options); free text is screened.
 */
export function answer(s: PrepState, value: string, allowed?: readonly string[]): { state: PrepState; error?: PrepError } {
  const f = currentField(s);
  if (!f) return { state: s };
  const v = value.trim();
  if (!v) {
    if (f.optional) return { state: { ...s, step: s.step + 1, answers: { ...s.answers, [f.id]: undefined } } };
    return { state: s, error: "empty" };
  }
  if (f.kind === "text") {
    if (containsSensitive(v)) return { state: s, error: "sensitive" };
    return { state: { step: s.step + 1, answers: { ...s.answers, [f.id]: v.slice(0, QUESTIONS_MAX) } } };
  }
  if (allowed && !allowed.includes(v)) return { state: s, error: "invalid" };
  return { state: { step: s.step + 1, answers: { ...s.answers, [f.id]: v } } };
}

export function back(s: PrepState): PrepState {
  return { ...s, step: Math.max(0, s.step - 1) };
}

/** Jump to a field to edit it from the summary. */
export function editField(s: PrepState, id: PrepFieldId): PrepState {
  const i = PREP_FIELDS.findIndex((f) => f.id === id);
  return i < 0 ? s : { ...s, step: i };
}

/**
 * The summary as label/value rows, using the UI's labels. `labelOf`
 * maps a field + stored value to display text.
 */
export function summaryRows(s: PrepState, promptOf: (id: PrepFieldId) => string, labelOf: (id: PrepFieldId, value: string) => string) {
  return PREP_FIELDS.filter((f) => s.answers[f.id]).map((f) => ({ id: f.id, label: promptOf(f.id), value: labelOf(f.id, s.answers[f.id] as string) }));
}

export function summaryText(rows: ReadonlyArray<{ label: string; value: string }>, heading: string): string {
  return [heading, ...rows.map((r) => `- ${r.label} ${r.value}`)].join("\n");
}
