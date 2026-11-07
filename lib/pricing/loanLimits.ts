/**
 * lib/pricing/loanLimits.ts — the loan limits that decide when a ZIP code
 * matters for pricing (C11.2, owner 2026-11-07: "the only bearing a zip
 * code has on pricing is if we are crossing thresholds for conforming or
 * high balance conforming and jumbo loan amounts").
 *
 * A loan at or below the national baseline is conforming in every county,
 * so its county (and ZIP) can't change its tier. Above the baseline the
 * tier depends on the county's high-cost limit (high balance, or jumbo),
 * which needs the county; the daily examples stay below the baseline, so a
 * borrower is shown one only when their loan is below it too.
 *
 * 2026 figures. Conforming baseline: FHFA, announced November 2025. FHA
 * floor: HUD, 65% of the conforming baseline. Confirmed by the owner
 * 2026-11-07. Check both every January.
 */
export const LOAN_LIMITS = {
  year: 2026,
  /** One-unit conforming baseline (FHFA). */
  conformingBaseline: 832_750,
  /** One-unit FHA floor (HUD): the lowest FHA limit in any county. */
  fhaFloor: 541_287,
} as const;

/** The highest loan amount whose tier is the same in every county, for this program. */
export function countyProofLimit(loanType: string): number {
  if (loanType === "conventional") return LOAN_LIMITS.conformingBaseline;
  if (loanType === "fha") return LOAN_LIMITS.fhaFloor;
  return Infinity; // non-QM: no agency limit
}
