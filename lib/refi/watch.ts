/**
 * lib/refi/watch.ts — Refi watch: which past clients may be worth a
 * refinance look, by the numbers (D12). Pure.
 *
 * From Broker Marketplace's Refi Finder and Bonzo's "refinance-ready
 * borrowers", for the loan officer's eyes only. Everything here is an
 * estimate from what the loan officer already has: the original amount,
 * the note rate and the closing date, assuming a 30-year fixed loan paid
 * on schedule. It never reaches a client and is never a quote: the loan
 * officer prices the real scenario (balance, value, credit, costs) first.
 */

export type RefiInput = { amount: number; noteRate: number; closedOn: string };
export type RefiEstimate = {
  monthsPaid: number;
  monthsLeft: number;
  balance: number;
  currentPI: number;
  gap: number;
  /** A new 30-year loan for the estimated balance at the reference rate. */
  new30PI: number;
  monthly30: number;
  breakEven30: number | null;
  /** Keeping their remaining term, at the reference rate. */
  sameTermPI: number;
  monthlySameTerm: number;
  breakEvenSameTerm: number | null;
};

/** Monthly principal and interest. */
export function payment(principal: number, annualRate: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = annualRate / 100 / 12;
  return r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months);
}

/** Balance after `paid` scheduled payments. */
export function balanceAfter(principal: number, annualRate: number, months: number, paid: number): number {
  const p = Math.min(Math.max(0, paid), months);
  const r = annualRate / 100 / 12;
  if (r === 0) return principal * (1 - p / months);
  const pmt = payment(principal, annualRate, months);
  return Math.max(0, principal * (1 + r) ** p - (pmt * ((1 + r) ** p - 1)) / r);
}

const monthsBetween = (fromIso: string, to: Date) => {
  const f = new Date(`${fromIso.slice(0, 10)}T12:00:00Z`);
  return Math.max(0, (to.getUTCFullYear() - f.getUTCFullYear()) * 12 + (to.getUTCMonth() - f.getUTCMonth()) - (to.getUTCDate() < f.getUTCDate() ? 1 : 0));
};

const round = (n: number) => Math.round(n);

/** The estimate for one loan against a reference rate and a closing-cost estimate. */
export function estimate(x: RefiInput, refRate: number, cost: number, now: Date, term = 360): RefiEstimate | null {
  if (!(x.amount > 0) || !(x.noteRate > 0) || !/^\d{4}-\d{2}-\d{2}/.test(x.closedOn)) return null;
  const monthsPaid = Math.min(monthsBetween(x.closedOn, now), term);
  const monthsLeft = term - monthsPaid;
  if (monthsLeft <= 0) return null;
  const balance = balanceAfter(x.amount, x.noteRate, term, monthsPaid);
  const currentPI = payment(x.amount, x.noteRate, term);
  const new30PI = payment(balance, refRate, 360);
  const sameTermPI = payment(balance, refRate, monthsLeft);
  const monthly30 = currentPI - new30PI;
  const monthlySameTerm = currentPI - sameTermPI;
  const be = (m: number) => (m > 1 ? Math.ceil(cost / m) : null);
  return {
    monthsPaid,
    monthsLeft,
    balance: round(balance),
    currentPI: round(currentPI),
    gap: Math.round((x.noteRate - refRate) * 1000) / 1000,
    new30PI: round(new30PI),
    monthly30: round(monthly30),
    breakEven30: be(monthly30),
    sameTermPI: round(sameTermPI),
    monthlySameTerm: round(monthlySameTerm),
    breakEvenSameTerm: be(monthlySameTerm),
  };
}
