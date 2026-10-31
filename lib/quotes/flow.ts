/**
 * lib/quotes/flow.ts — M8 quote mode as a pure state machine (v37, L4).
 *
 * Owner 2026-10-31: no form. M8 asks one question at a time and builds
 * the QuoteScenario behind the scenes; the borrower sees a one-line
 * summary before anything is sent. Text drives it today; voice can drive
 * the same machine later (read `currentStep`, feed `answerStep`).
 */
import {
  CREDIT_BANDS,
  LOAN_TYPES,
  OCCUPANCIES,
  PROPERTY_TYPES,
  PURPOSES,
  QuoteScenarioSchema,
  TERMS,
  stateForZip,
  type QuoteScenario,
} from "./scenario";

export type StepId = "purpose" | "loanType" | "term" | "price" | "down" | "balance" | "cashOut" | "creditBand" | "zip" | "propertyType" | "occupancy";
export type StepKind = "choice" | "amount" | "zip";

export const STEP_KIND: Record<StepId, StepKind> = {
  purpose: "choice", loanType: "choice", term: "choice", price: "amount", down: "amount", balance: "amount", cashOut: "amount",
  creditBand: "choice", zip: "zip", propertyType: "choice", occupancy: "choice",
};

export const CHOICES: Partial<Record<StepId, readonly string[]>> = {
  purpose: PURPOSES, loanType: LOAN_TYPES, term: TERMS, creditBand: CREDIT_BANDS, propertyType: PROPERTY_TYPES, occupancy: OCCUPANCIES,
};

export type Answers = Partial<Record<StepId, string>>;

/** The steps that apply, in order, given the answers so far. */
export function stepsFor(a: Answers): StepId[] {
  const out: StepId[] = ["purpose", "loanType", "term", "price"];
  if (a.purpose === "purchase" || !a.purpose) out.push("down");
  else out.push("balance");
  if (a.purpose === "cashout") out.push("cashOut");
  out.push("creditBand", "zip", "propertyType", "occupancy");
  return out;
}

export function currentStep(a: Answers): StepId | null {
  return stepsFor(a).find((s) => a[s] === undefined) ?? null;
}

/** "$520,000", "520k", "1.2m", and for a down payment "10%" (of the price). */
export function parseAmount(text: string, pctOf?: number): number | null {
  const t = text.trim().toLowerCase().replace(/[$,\s]/g, "");
  const pct = t.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return pctOf ? Math.round((Number(pct[1]) / 100) * pctOf) : null;
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export type AnswerError = "empty" | "invalid" | "zip" | "outside";

export function answerStep(a: Answers, value: string): { answers: Answers; error?: AnswerError } {
  const step = currentStep(a);
  if (!step) return { answers: a };
  const v = value.trim();
  if (!v) return { answers: a, error: "empty" };
  const kind = STEP_KIND[step];
  if (kind === "choice") {
    if (!CHOICES[step]!.includes(v)) return { answers: a, error: "invalid" };
    const next = { ...a, [step]: v };
    // Changing the purpose changes which money questions apply.
    if (step === "purpose") { delete next.down; delete next.balance; delete next.cashOut; }
    return { answers: next };
  }
  if (kind === "zip") {
    if (!/^\d{5}$/.test(v)) return { answers: a, error: "zip" };
    if (!stateForZip(v)) return { answers: a, error: "outside" };
    return { answers: { ...a, zip: v } };
  }
  const n = parseAmount(v, step === "down" ? Number(a.price) : undefined);
  if (n === null || n < 0 || (step === "price" && n < 50_000) || n > 5_000_000) return { answers: a, error: "invalid" };
  return { answers: { ...a, [step]: String(n) } };
}

/** Clear one answer so M8 asks it again (the summary's "Change"). */
export function reopen(a: Answers, step: StepId): Answers {
  const next = { ...a };
  delete next[step];
  return next;
}

export function toScenario(a: Answers): { ok: true; scenario: QuoteScenario } | { ok: false; step: StepId | null; message: string } {
  const open = currentStep(a);
  if (open) return { ok: false, step: open, message: "incomplete" };
  const num = (k: StepId) => (a[k] === undefined ? undefined : Number(a[k]));
  const raw = {
    purpose: a.purpose, loanType: a.loanType, term: a.term, price: num("price"),
    ...(a.purpose === "purchase" ? { down: num("down") } : { balance: num("balance") }),
    ...(a.purpose === "cashout" ? { cashOut: num("cashOut") } : {}),
    creditBand: a.creditBand, zip: a.zip, propertyType: a.propertyType, occupancy: a.occupancy,
  };
  const r = QuoteScenarioSchema.safeParse(raw);
  if (r.success) return { ok: true, scenario: r.data };
  const issue = r.error.issues[0];
  const step = (issue.path[0] as StepId | undefined) ?? null;
  return { ok: false, step: step && step in STEP_KIND ? step : null, message: issue.message };
}
