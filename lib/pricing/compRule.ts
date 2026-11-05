/**
 * lib/pricing/compRule.ts — which rate the loan officer would quote (C8).
 *
 * A pricing engine (LoanSifter, ARIVE) returns a whole rate grid for each
 * lender product: every rate with its price. The borrower is shown one
 * line per product, picked by the loan officer's own rule, the same way
 * the loan officer picks it by hand.
 *
 * Owner rule, 2026-11-05 (non-delegated correspondent, "NDC"):
 *  - Target total compensation: CompRule.targetPct of the loan (1.7%).
 *  - Part of it is a flat origination fee the borrower pays (CompRule.originationFee, $3,000).
 *  - The rest must come from the lender's rebate, so take the LOWEST rate
 *    whose rebate (price − 100) is at least targetPct − originationFee / loan.
 *  Owner's worked example, Kind Lending NDC, $520,000 purchase, 20% down:
 *  target $8,840, minus $3,000 → rebate of at least 1.123% → 7.125%
 *  (pays 1.159%, $6,027). Borrower sees 7.125%, $3,000 origination, no
 *  points. The rebate is the lender's payment for the loan, not a charge
 *  to the borrower, so it is never shown as a borrower cost.
 *
 * Wholesale, lender-paid compensation (an engine "LO Comp" column): the
 * lender already pays the loan officer, so no origination is charged on
 * top. Default, pending owner confirmation: the lowest rate where the
 * borrower pays no points (price at or above 100).
 *
 * One line per lender: when a lender has several products (FNMA and FHLMC,
 * two programs), only its lowest resulting rate is kept, so one lender
 * can't fill all three options.
 *
 * Pure: no network, no store. A provider fetches the grids; this decides.
 */
import { NO_RISKY_FEATURES, type QuoteInput } from "./types";

/** One line of a lender product's rate grid, as the engine shows it. */
export type GridRow = {
  /** Note rate in percent, e.g. 7.125. */
  rate: number;
  /** Price per 100 of loan, e.g. 101.159 (above 100 = rebate, below = discount). */
  price: number;
};

export type LenderProduct = {
  lenderKey: string;
  productLabel: string;
  /** "ndc" = non-delegated correspondent; "wholesale" = lender-paid compensation. */
  channel: "ndc" | "wholesale";
  lenderFees: number;
  lockDays: number;
  grid: GridRow[];
};

export type CompRule = {
  /** Target total compensation, percent of the loan (owner: 1.7). */
  targetPct: number;
  /** Flat borrower-paid origination fee in dollars on NDC loans (owner: 3000). */
  originationFee: number;
};

export const DEFAULT_COMP_RULE: CompRule = { targetPct: 1.7, originationFee: 3000 };

const EPS = 1e-9;

/** The rebate (positive) or discount (negative), percent of the loan, at a price. */
export const rebatePct = (price: number) => price - 100;

/** Validates a rule; returns problems in plain words. */
export function checkRule(r: CompRule): string[] {
  const errs: string[] = [];
  if (!(r.targetPct >= 0 && r.targetPct <= 5)) errs.push("Target compensation must be between 0% and 5% of the loan.");
  if (!(r.originationFee >= 0 && r.originationFee <= 20000)) errs.push("Origination fee must be between $0 and $20,000.");
  return errs;
}

/** The quote for one product under the rule, or null when no rate on its grid works. */
export function pickRate(p: LenderProduct, loanAmount: number, rule: CompRule): QuoteInput | null {
  const grid = [...p.grid].filter((g) => g.rate > 0 && Number.isFinite(g.price)).sort((a, b) => a.rate - b.rate);
  if (!grid.length || !(loanAmount > 0)) return null;
  let row: GridRow | undefined;
  let originationFee = 0;
  if (p.channel === "ndc") {
    const orig = Math.min(rule.originationFee, (rule.targetPct / 100) * loanAmount);
    const needed = rule.targetPct - (orig / loanAmount) * 100;
    row = grid.find((g) => rebatePct(g.price) >= needed - EPS);
    originationFee = orig;
  } else {
    row = grid.find((g) => rebatePct(g.price) >= -EPS);
  }
  if (!row) return null;
  return {
    lenderKey: p.lenderKey,
    productLabel: p.productLabel,
    eligible: true,
    noteRate: row.rate,
    // The borrower pays no discount points under either rule; the rebate is never a borrower credit here.
    pointsPct: 0,
    originationFee: Math.round(originationFee * 100) / 100,
    lenderFees: p.lenderFees,
    lockDays: p.lockDays,
    interestOnlyMonths: 0,
    features: NO_RISKY_FEATURES,
  };
}

/** One quote per lender: each product through the rule, then the lowest rate per lender. */
export function quotesFromGrids(products: LenderProduct[], loanAmount: number, rule: CompRule = DEFAULT_COMP_RULE): QuoteInput[] {
  const best = new Map<string, QuoteInput>();
  for (const p of products) {
    const q = pickRate(p, loanAmount, rule);
    if (!q) continue;
    const prev = best.get(q.lenderKey);
    const cost = (x: QuoteInput) => x.originationFee + x.lenderFees;
    if (!prev || q.noteRate! < prev.noteRate! || (q.noteRate === prev.noteRate && cost(q) < cost(prev))) best.set(q.lenderKey, q);
  }
  return [...best.values()].sort((a, b) => a.noteRate! - b.noteRate! || a.lenderKey.localeCompare(b.lenderKey));
}
