/**
 * lib/calc/mortgage.ts — mortgage math primitives.
 *
 * Pure functions. No React, no side effects, no I/O. Every calculator
 * page consumes these and formats the results. Unit-testable in isolation.
 *
 * All rates are passed as annual percentages (e.g. 6.375 for 6.375%).
 * All amounts in dollars. All periods in months unless labeled otherwise.
 *
 * Formulas follow the standard fixed-rate mortgage amortization model:
 *   monthlyRate = annualRate / 12 / 100
 *   payment = P * r * (1+r)^n / ((1+r)^n - 1)
 *
 * Edge cases handled: 0% rate → straight-line amortization,
 * pathological inputs → returns NaN or 0 with `isFinite` guards
 * upstream so the UI shows "—" rather than crashing.
 */

/**
 * Monthly principal + interest payment for a fixed-rate loan.
 * Handles the 0% edge case (straight division, no interest).
 */
export function monthlyPI(
  principal: number,
  annualRatePct: number,
  termMonths: number
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

/**
 * Total interest paid over the life of the loan given constant P&I.
 * = payment * n - principal.
 */
export function totalInterest(
  principal: number,
  annualRatePct: number,
  termMonths: number
): number {
  const payment = monthlyPI(principal, annualRatePct, termMonths);
  return payment * termMonths - principal;
}

/**
 * Full amortization schedule — one row per month.
 * Useful for the amortization visualizer chart + payoff simulations.
 */
export type AmortRow = {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
  cumInterest: number;
  cumPrincipal: number;
};

export function amortizationSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number
): AmortRow[] {
  const payment = monthlyPI(principal, annualRatePct, termMonths);
  const r = annualRatePct / 12 / 100;
  const rows: AmortRow[] = [];
  let balance = principal;
  let cumInterest = 0;
  let cumPrincipal = 0;
  for (let m = 1; m <= termMonths; m++) {
    const interest = balance * r;
    let principalPortion = payment - interest;
    // Final-month rounding: don't overshoot the balance
    if (principalPortion > balance) principalPortion = balance;
    balance -= principalPortion;
    cumInterest += interest;
    cumPrincipal += principalPortion;
    rows.push({
      month: m,
      payment: interest + principalPortion,
      interest,
      principal: principalPortion,
      balance: Math.max(balance, 0),
      cumInterest,
      cumPrincipal,
    });
    if (balance <= 0.01) break;
  }
  return rows;
}

/**
 * How many months does it take to pay off the loan when adding an
 * extra $X to every monthly payment? Returns months + total interest.
 * Used by the loan-payoff-acceleration calculator.
 */
export function payoffWithExtraPayment(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  extraPerMonth: number
): { months: number; totalInterest: number } {
  if (extraPerMonth < 0) extraPerMonth = 0;
  const basePayment = monthlyPI(principal, annualRatePct, termMonths);
  const totalPayment = basePayment + extraPerMonth;
  const r = annualRatePct / 12 / 100;
  let balance = principal;
  let months = 0;
  let interestPaid = 0;
  // Cap at the natural term — if extra is 0, we stop at termMonths.
  // With extra, we stop early. Add a safety cap at term*2 for pathologies.
  const cap = Math.max(termMonths * 2, 720);
  while (balance > 0.01 && months < cap) {
    const interest = balance * r;
    const principalPortion = Math.min(totalPayment - interest, balance);
    if (principalPortion <= 0) {
      // Payment doesn't cover interest — negative amortization case.
      return { months: Infinity, totalInterest: Infinity };
    }
    balance -= principalPortion;
    interestPaid += interest;
    months++;
  }
  return { months, totalInterest: interestPaid };
}

/**
 * How many months does a one-time lump-sum extra payment (applied
 * today, month 0) save on payoff? Compares base schedule vs lump-sum
 * schedule with the same monthly payment.
 */
export function payoffWithLumpSum(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  lumpSum: number
): { months: number; totalInterest: number } {
  const adjustedPrincipal = Math.max(0, principal - lumpSum);
  if (adjustedPrincipal === 0) return { months: 0, totalInterest: 0 };
  const basePayment = monthlyPI(principal, annualRatePct, termMonths);
  const r = annualRatePct / 12 / 100;
  let balance = adjustedPrincipal;
  let months = 0;
  let interestPaid = 0;
  const cap = Math.max(termMonths * 2, 720);
  while (balance > 0.01 && months < cap) {
    const interest = balance * r;
    const principalPortion = Math.min(basePayment - interest, balance);
    if (principalPortion <= 0) return { months: Infinity, totalInterest: Infinity };
    balance -= principalPortion;
    interestPaid += interest;
    months++;
  }
  return { months, totalInterest: interestPaid };
}

/**
 * Given a target payoff time in months, back-solve the extra $/month
 * required (in addition to the base P&I) to hit that target.
 *
 * Uses the payment formula with a compressed term:
 *   newPayment = P * r * (1+r)^tgt / ((1+r)^tgt - 1)
 *   extra = newPayment - basePayment
 */
export function extraNeededForTargetMonths(
  principal: number,
  annualRatePct: number,
  originalTermMonths: number,
  targetMonths: number
): number {
  if (targetMonths <= 0 || targetMonths >= originalTermMonths) return 0;
  const targetPayment = monthlyPI(principal, annualRatePct, targetMonths);
  const basePayment = monthlyPI(principal, annualRatePct, originalTermMonths);
  return Math.max(0, targetPayment - basePayment);
}

/**
 * Bi-weekly comparison — pay half the monthly P&I every 2 weeks.
 * 26 half-payments/year = 13 full monthly-equivalents (vs 12 monthly),
 * i.e. one extra monthly payment per year applied to principal.
 *
 * Returned as if the extra were applied monthly (equivalent) for
 * simulation simplicity. Real bi-weekly programs apply payments as
 * they arrive; the effective savings are nearly identical.
 */
export function biWeeklyComparison(
  principal: number,
  annualRatePct: number,
  termMonths: number
): {
  monthlyPayment: number;
  biWeeklyPayment: number;
  extraPerYear: number;
  originalPayoffMonths: number;
  biWeeklyPayoffMonths: number;
  monthsShaved: number;
  originalInterest: number;
  biWeeklyInterest: number;
  interestSaved: number;
} {
  const monthlyPayment = monthlyPI(principal, annualRatePct, termMonths);
  const biWeeklyPayment = monthlyPayment / 2;
  // Extra per year = one extra monthly payment / 12 = payment / 12 per month
  const extraPerMonth = monthlyPayment / 12;
  const orig = { months: termMonths, totalInterest: totalInterest(principal, annualRatePct, termMonths) };
  const bi = payoffWithExtraPayment(principal, annualRatePct, termMonths, extraPerMonth);
  return {
    monthlyPayment,
    biWeeklyPayment,
    extraPerYear: monthlyPayment,
    originalPayoffMonths: orig.months,
    biWeeklyPayoffMonths: bi.months,
    monthsShaved: orig.months - bi.months,
    originalInterest: orig.totalInterest,
    biWeeklyInterest: bi.totalInterest,
    interestSaved: orig.totalInterest - bi.totalInterest,
  };
}
