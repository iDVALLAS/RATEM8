/**
 * lib/pricing/apr.ts — APR by the actuarial method (Reg Z Appendix J).
 *
 * APR is the annual rate at which the present value of the scheduled
 * payments equals the amount financed (loan amount minus prepaid finance
 * charges). Solved by bisection on the monthly rate; deterministic.
 *
 * Simplifications, stated on every price as assumptions: prepaid interest,
 * mortgage insurance and third-party charges are not modelled; fixed-rate
 * loans only; first payment one month after consummation.
 */

/** Scheduled monthly payments for a fixed-rate loan, with an optional interest-only start. */
export function paymentSchedule(loanAmount: number, noteRatePct: number, termMonths: number, interestOnlyMonths = 0): number[] {
  const r = noteRatePct / 100 / 12;
  const io = Math.max(0, Math.min(interestOnlyMonths, termMonths - 1));
  const amortMonths = termMonths - io;
  const ioPayment = loanAmount * r;
  const amortPayment = r === 0 ? loanAmount / amortMonths : (loanAmount * r) / (1 - Math.pow(1 + r, -amortMonths));
  const out: number[] = [];
  for (let k = 0; k < io; k++) out.push(ioPayment);
  for (let k = 0; k < amortMonths; k++) out.push(amortPayment);
  return out;
}

function presentValue(payments: number[], monthlyRate: number): number {
  let pv = 0;
  let disc = 1;
  for (const p of payments) {
    disc /= 1 + monthlyRate;
    pv += p * disc;
  }
  return pv;
}

/**
 * APR in percent, rounded to 3 decimals (Reg Z tolerance is 1/8 point for
 * regular transactions). Returns the note rate when there are no prepaid
 * finance charges.
 */
export function computeApr(loanAmount: number, noteRatePct: number, termMonths: number, prepaidFinanceCharges: number, interestOnlyMonths = 0): number {
  const payments = paymentSchedule(loanAmount, noteRatePct, termMonths, interestOnlyMonths);
  const amountFinanced = loanAmount - Math.max(0, prepaidFinanceCharges);
  if (amountFinanced <= 0) throw new Error("amount financed must be positive");
  let lo = 0;
  let hi = 1; // 100% per month: far above any real APR
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(payments, mid) > amountFinanced) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 100 * 1000) / 1000;
}

/** Exposed for tests: the PV identity the solver satisfies. */
export function _presentValue(payments: number[], monthlyRate: number): number {
  return presentValue(payments, monthlyRate);
}
