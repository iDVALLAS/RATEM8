/**
 * lib/pricing/mi.ts — mortgage insurance in the payment stream (C7).
 *
 * Mortgage insurance is a finance charge, so an APR shown for a loan that
 * carries it must include it (Reg Z §1026.4, Appendix J). This module
 * turns a scenario's MI terms into the monthly MI amounts that are added
 * to the scheduled payments before the APR is solved.
 *
 *  - PMI (conventional, borrower-paid monthly): the entered monthly amount,
 *    until the scheduled balance first reaches 78% of the original value
 *    (Homeowners Protection Act automatic termination), and never past the
 *    midpoint of the term (final termination).
 *  - FHA: the upfront MIP is financed (added to the loan amount) and is a
 *    prepaid finance charge. Annual MIP is recalculated each year on the
 *    average scheduled balance of that year, for the life of the loan when
 *    the base LTV is above 90%, and for 11 years otherwise.
 */
import type { BandedScenario } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Scheduled balance at the start of each month (index 0 = the loan amount). */
export function scheduledBalances(loanAmount: number, noteRatePct: number, termMonths: number, interestOnlyMonths = 0): number[] {
  const r = noteRatePct / 100 / 12;
  const io = Math.max(0, Math.min(interestOnlyMonths, termMonths - 1));
  const amortMonths = termMonths - io;
  const pmt = r === 0 ? loanAmount / amortMonths : (loanAmount * r) / (1 - Math.pow(1 + r, -amortMonths));
  const out: number[] = [];
  let bal = loanAmount;
  for (let k = 0; k < termMonths; k++) {
    out.push(bal);
    if (k >= io) bal = Math.max(0, bal * (1 + r) - pmt);
  }
  return out;
}

/** The amount the note is written for: FHA adds the financed upfront MIP. */
export function noteAmount(s: BandedScenario): number {
  return s.mi?.kind === "fha" ? round2(s.loanAmount * (1 + s.mi.upfrontPct / 100)) : s.loanAmount;
}

/** Upfront MIP in dollars (a prepaid finance charge), 0 when none. */
export function upfrontMi(s: BandedScenario): number {
  return s.mi?.kind === "fha" ? round2(s.loanAmount * (s.mi.upfrontPct / 100)) : 0;
}

/** Monthly MI for every month of the term (all zeros when the scenario has none). */
export function miSchedule(s: BandedScenario, noteRatePct: number, monthlyPmi = 0, interestOnlyMonths = 0): number[] {
  const n = s.termMonths;
  const out = new Array<number>(n).fill(0);
  if (!s.mi) return out;
  const loan = noteAmount(s);
  const bal = scheduledBalances(loan, noteRatePct, n, interestOnlyMonths);
  if (s.mi.kind === "pmi") {
    if (!(monthlyPmi > 0)) return out;
    const cutoff = 0.78 * s.propertyValue;
    const midpoint = Math.floor(n / 2);
    for (let k = 0; k < n; k++) {
      if (bal[k] <= cutoff || k >= midpoint) break;
      out[k] = monthlyPmi;
    }
    return out;
  }
  const baseLtv = (s.loanAmount / s.propertyValue) * 100;
  const months = baseLtv > 90 ? n : Math.min(n, 132);
  const rate = s.mi.annualPct / 100;
  for (let year = 0; year * 12 < months; year++) {
    const slice = bal.slice(year * 12, Math.min(year * 12 + 12, months));
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    const monthly = round2((avg * rate) / 12);
    for (let k = year * 12; k < year * 12 + slice.length; k++) out[k] = monthly;
  }
  return out;
}
