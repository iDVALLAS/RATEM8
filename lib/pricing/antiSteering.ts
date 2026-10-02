/**
 * lib/pricing/antiSteering.ts — the three loan options of the Reg Z
 * 1026.36(e)(3) safe harbor, computed ONLY from normalized pricing data:
 *
 *   (A) lowest interest rate;
 *   (B) lowest interest rate without negative amortization, a prepayment
 *       penalty, interest-only payments, a balloon in the first 7 years,
 *       a demand feature, shared equity or shared appreciation;
 *   (C) lowest total dollar amount of discount points and origination
 *       points or fees.
 *
 * Inputs are `LenderQuote`s and nothing else. Loan officer notes, lender
 * names, compensation preferences and playbook fields are not parameters,
 * so they cannot influence the result (see antiSteering.test.ts).
 * Ties break on fixed, documented keys so the result is reproducible.
 */
import type { AntiSteeringSelection, LenderQuote, SelectionPick } from "./types";

function byRateThenCost(a: LenderQuote, b: LenderQuote): number {
  return (
    (a.noteRate! - b.noteRate!) ||
    (a.pointsAndOriginationDollars - b.pointsAndOriginationDollars) ||
    ((a.apr ?? 0) - (b.apr ?? 0)) ||
    a.lender.localeCompare(b.lender)
  );
}

function byCostThenRate(a: LenderQuote, b: LenderQuote): number {
  return (
    (a.pointsAndOriginationDollars - b.pointsAndOriginationDollars) ||
    (a.noteRate! - b.noteRate!) ||
    ((a.apr ?? 0) - (b.apr ?? 0)) ||
    a.lender.localeCompare(b.lender)
  );
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function selectAntiSteering(quotes: readonly LenderQuote[]): AntiSteeringSelection {
  const eligible = quotes.filter((q) => q.eligible && q.noteRate !== null);
  const n = eligible.length;
  const pick = (list: LenderQuote[], cmp: (a: LenderQuote, b: LenderQuote) => number) => (list.length ? [...list].sort(cmp)[0] : null);

  const a = pick(eligible, byRateThenCost);
  const plain = eligible.filter((q) => !q.hasRiskyFeature);
  const b = pick(plain, byRateThenCost);
  const c = pick(eligible, byCostThenRate);

  const pickA: SelectionPick | null = a && {
    lender: a.lender,
    rationale: `Lowest note rate (${a.noteRate!.toFixed(3)}%) among ${n} eligible offers.`,
  };
  const pickB: SelectionPick | null = b && {
    lender: b.lender,
    rationale: `Lowest note rate (${b.noteRate!.toFixed(3)}%) among ${plain.length} eligible offers with no negative amortization, prepayment penalty, interest-only payments, early balloon, demand feature, or shared equity.`,
  };
  const pickC: SelectionPick | null = c && {
    lender: c.lender,
    rationale: `Lowest discount points plus origination fees (${money(c.pointsAndOriginationDollars)}) among ${n} eligible offers.`,
  };

  return {
    lowestRate: pickA,
    lowestRateWithoutRiskyFeatures: pickB,
    lowestPointsAndOrigination: pickC,
    eligibleCreditors: new Set(eligible.map((q) => q.lender)).size,
    meetsCreditorCount: new Set(eligible.map((q) => q.lender)).size >= 3,
  };
}
