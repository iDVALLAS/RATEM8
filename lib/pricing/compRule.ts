/**
 * lib/pricing/compRule.ts — the loan officer's rule for turning rate grids
 * into the options a borrower sees (C8).
 *
 * A pricing engine (LoanSifter, ARIVE) returns a rate grid for each lender
 * product: every rate with its price. These are borrower-paid grids: the
 * loan officer's compensation is NOT built in (owner, 2026-11-05).
 *
 * Owner rule: the compensation is the same on every option, a target share
 * of the loan (CompRule.targetPct, 1.7%). At each rate the lender's rebate
 * (price − 100) pays part of it and the borrower pays the rest as points:
 *
 *     borrower points ($) = target ($) − rebate ($)
 *
 * When the rebate is larger than the target, the difference goes back to
 * the borrower as a lender credit (negative points), so the compensation
 * never changes with the rate the borrower picks.
 *
 * Owner's worked example, $520,000 purchase, 20% down, target $8,840:
 *  - Kind Lending 6.875%: rebate $1,643 → the borrower pays $7,197 in points.
 *  - Rocket 7.375%: rebate $9,090 → no points, a $250 credit.
 *
 * Two lines per lender go into the run, and the anti-steering selection
 * (antiSteering.ts) picks across lenders from them:
 *  - its lowest rate whose points stay within CompRule.maxPointsPct of the loan
 *  - its lowest rate where the borrower pays no points
 * The owner's "middle" option (some points, a lower rate) is set aside until
 * the owner explains how it is chosen.
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
  lenderFees: number;
  lockDays: number;
  grid: GridRow[];
};

export type CompRule = {
  /** The loan officer's compensation on every option, percent of the loan (owner: 1.7). */
  targetPct: number;
  /** Most points the borrower may pay on the lowest-rate option, percent of the loan. */
  maxPointsPct: number;
};

export const DEFAULT_COMP_RULE: CompRule = { targetPct: 1.7, maxPointsPct: 1.5 };

/** Reads a saved rule, filling anything missing (an older save) from the default. */
export function normalizeRule(r: Partial<CompRule> | null | undefined): CompRule {
  return {
    targetPct: typeof r?.targetPct === "number" ? r.targetPct : DEFAULT_COMP_RULE.targetPct,
    maxPointsPct: typeof r?.maxPointsPct === "number" ? r.maxPointsPct : DEFAULT_COMP_RULE.maxPointsPct,
  };
}

/** Validates a rule; returns problems in plain words. */
export function checkRule(r: CompRule): string[] {
  const errs: string[] = [];
  if (!(r.targetPct >= 0 && r.targetPct <= 5)) errs.push("Target compensation must be between 0% and 5% of the loan.");
  if (!(r.maxPointsPct >= 0 && r.maxPointsPct <= 3)) errs.push("The points cap must be between 0% and 3% of the loan.");
  return errs;
}

export type GridLine = { rate: number; price: number; pointsDollars: number };

/** Every grid line with what the borrower would pay in points (negative = credit). */
export function linesFor(p: LenderProduct, loanAmount: number, rule: CompRule): GridLine[] {
  const target = (rule.targetPct / 100) * loanAmount;
  return p.grid
    .filter((g) => g.rate > 0 && Number.isFinite(g.price))
    .map((g) => ({ rate: g.rate, price: g.price, pointsDollars: Math.round((target - ((g.price - 100) / 100) * loanAmount) * 100) / 100 }))
    .sort((a, b) => a.rate - b.rate);
}

function toQuote(p: LenderProduct, line: GridLine, loanAmount: number): QuoteInput {
  return {
    lenderKey: p.lenderKey,
    // The rate in the label keeps two lines from the same product distinct.
    productLabel: `${p.productLabel} · ${line.rate.toFixed(3)}%`,
    eligible: true,
    noteRate: line.rate,
    pointsPct: (line.pointsDollars / loanAmount) * 100,
    originationFee: 0,
    lenderFees: p.lenderFees,
    lockDays: p.lockDays,
    interestOnlyMonths: 0,
    features: NO_RISKY_FEATURES,
  };
}

/** A lender's lowest rate within the points cap. */
export function lowestRateLine(p: LenderProduct, loanAmount: number, rule: CompRule): GridLine | null {
  const cap = (rule.maxPointsPct / 100) * loanAmount + 1e-6;
  return linesFor(p, loanAmount, rule).find((l) => l.pointsDollars <= cap) ?? null;
}

/** A lender's lowest rate where the borrower pays no points. */
export function noPointsLine(p: LenderProduct, loanAmount: number, rule: CompRule): GridLine | null {
  return linesFor(p, loanAmount, rule).find((l) => l.pointsDollars <= 1e-6) ?? null;
}

/**
 * The quotes for a run: per lender, the best lowest-rate line and the best
 * no-points line across its products (lowest rate; on a tie, the fewest
 * points). Lenders with neither are left out.
 */
export function quotesFromGrids(products: LenderProduct[], loanAmount: number, rule: CompRule = DEFAULT_COMP_RULE): QuoteInput[] {
  const better = (a: { line: GridLine }, b?: { line: GridLine }) =>
    !b || a.line.rate < b.line.rate || (a.line.rate === b.line.rate && a.line.pointsDollars < b.line.pointsDollars);
  const low = new Map<string, { p: LenderProduct; line: GridLine }>();
  const free = new Map<string, { p: LenderProduct; line: GridLine }>();
  for (const p of products) {
    const l = lowestRateLine(p, loanAmount, rule);
    if (l && better({ line: l }, low.get(p.lenderKey))) low.set(p.lenderKey, { p, line: l });
    const f = noPointsLine(p, loanAmount, rule);
    if (f && better({ line: f }, free.get(p.lenderKey))) free.set(p.lenderKey, { p, line: f });
  }
  const out: QuoteInput[] = [];
  const seen = new Set<string>();
  for (const { p, line } of [...low.values(), ...free.values()]) {
    const q = toQuote(p, line, loanAmount);
    const key = `${q.lenderKey}|${q.productLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out.sort((a, b) => a.noteRate! - b.noteRate! || a.lenderKey.localeCompare(b.lenderKey));
}
