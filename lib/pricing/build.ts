/**
 * lib/pricing/build.ts — the one function that turns inputs into a run.
 *
 * normalize → compute (payment, APR, totals) → anonymize → select.
 * Pure and deterministic: the same `RunInputs` always produce the same
 * canonical JSON. Providers only gather inputs; they never compute.
 */
import { computeApr, paymentSchedule } from "./apr";
import { assignLetters } from "./anonymize";
import { selectAntiSteering } from "./antiSteering";
import { canonicalJson, sha256Hex } from "./canonical";
import type { LenderQuote, PricingRun, QuoteInput, RunInputs } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

function hasRisky(q: QuoteInput): boolean {
  const f = q.features;
  return f.negativeAmortization || f.prepaymentPenalty || f.interestOnly || q.interestOnlyMonths > 0 || f.balloonFirst7Years || f.demandFeature || f.sharedEquityOrAppreciation;
}

export function validateInputs(inputs: RunInputs): string[] {
  const errs: string[] = [];
  const s = inputs.scenario;
  if (!(s.loanAmount > 0) || !(s.propertyValue > 0)) errs.push("scenario amounts must be positive");
  if (s.loanAmount > s.propertyValue) errs.push("loan amount exceeds property value");
  if (!Number.isInteger(s.termMonths) || s.termMonths < 60 || s.termMonths > 480) errs.push("term must be 60–480 months");
  if (Number.isNaN(Date.parse(inputs.pricedAt))) errs.push("pricedAt must be an ISO timestamp");
  const keys = new Set<string>();
  for (const q of inputs.quotes) {
    if (keys.has(q.lenderKey + "|" + q.productLabel)) errs.push(`duplicate quote for ${q.lenderKey}`);
    keys.add(q.lenderKey + "|" + q.productLabel);
    if (q.eligible) {
      if (q.noteRate === null || !(q.noteRate > 0 && q.noteRate < 25)) errs.push(`${q.lenderKey}: note rate must be between 0 and 25`);
      if (!(q.pointsPct > -10 && q.pointsPct < 10)) errs.push(`${q.lenderKey}: points must be between -10 and 10`);
      if (q.originationFee < 0 || q.lenderFees < 0) errs.push(`${q.lenderKey}: fees cannot be negative`);
      if (!(q.lockDays >= 0 && q.lockDays <= 360)) errs.push(`${q.lenderKey}: lock days out of range`);
      if (q.interestOnlyMonths < 0 || q.interestOnlyMonths >= s.termMonths) errs.push(`${q.lenderKey}: interest-only months out of range`);
    } else if (!q.ineligibleReason || !q.ineligibleReason.trim()) {
      errs.push(`${q.lenderKey}: ineligible results need a reason`);
    }
  }
  return errs;
}

export function buildPricingRun(inputs: RunInputs): { run: PricingRun; mapping: Record<string, string> } {
  const errs = validateInputs(inputs);
  if (errs.length) throw new Error(`invalid pricing inputs: ${errs.join("; ")}`);
  const { scenario } = inputs;
  const letters = assignLetters(inputs.runId, inputs.quotes.map((q) => q.lenderKey));

  const quotes: LenderQuote[] = inputs.quotes.map((q) => {
    const lender = letters.get(q.lenderKey)!;
    const pointsDollars = round2((q.pointsPct / 100) * scenario.loanAmount);
    const pointsAndOrigination = round2(Math.max(0, pointsDollars) + q.originationFee);
    const prepaid = round2(Math.max(0, pointsDollars + q.originationFee + q.lenderFees));
    const risky = hasRisky(q);
    if (!q.eligible || q.noteRate === null) {
      return {
        lender, productLabel: q.productLabel, eligible: false, ineligibleReason: q.ineligibleReason ?? "Not eligible",
        noteRate: null, apr: null, pointsPct: q.pointsPct, pointsDollars, originationFee: q.originationFee, lenderFees: q.lenderFees,
        pointsAndOriginationDollars: pointsAndOrigination, prepaidFinanceCharges: prepaid, monthlyPayment: null, monthlyPaymentAfterIO: null,
        lockDays: q.lockDays, interestOnlyMonths: q.interestOnlyMonths, features: q.features, hasRiskyFeature: risky,
      };
    }
    const sched = paymentSchedule(scenario.loanAmount, q.noteRate, scenario.termMonths, q.interestOnlyMonths);
    return {
      lender, productLabel: q.productLabel, eligible: true, ineligibleReason: null,
      noteRate: q.noteRate,
      apr: computeApr(scenario.loanAmount, q.noteRate, scenario.termMonths, prepaid, q.interestOnlyMonths),
      pointsPct: q.pointsPct, pointsDollars, originationFee: q.originationFee, lenderFees: q.lenderFees,
      pointsAndOriginationDollars: pointsAndOrigination, prepaidFinanceCharges: prepaid,
      monthlyPayment: round2(sched[0]),
      monthlyPaymentAfterIO: q.interestOnlyMonths > 0 ? round2(sched[sched.length - 1]) : null,
      lockDays: q.lockDays, interestOnlyMonths: q.interestOnlyMonths, features: q.features, hasRiskyFeature: risky,
    };
  });

  // Public order: eligible first by rate, then ineligible; by label on ties.
  quotes.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return ((a.noteRate ?? 0) - (b.noteRate ?? 0)) || a.lender.localeCompare(b.lender);
  });

  const mapping: Record<string, string> = {};
  for (const [key, label] of letters) mapping[label] = key;

  const run: PricingRun = {
    schemaVersion: 1,
    runId: inputs.runId,
    tenantId: inputs.tenantId,
    provider: inputs.provider,
    mode: inputs.mode,
    scenario,
    pricedAt: inputs.pricedAt,
    quotes,
    selection: selectAntiSteering(quotes),
    inputsHash: sha256Hex(canonicalJson(inputs)),
  };
  return { run, mapping };
}

/** Canonical serialization of a run. Byte-identical for identical inputs. */
export function serializeRun(run: PricingRun): string {
  return canonicalJson(run);
}
