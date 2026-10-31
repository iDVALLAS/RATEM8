/**
 * lib/content/posted-rate.ts — strings for the two posted rates (v37, L4).
 *
 * The only place outside RateVsAverage where a rate is compared with a
 * benchmark (allowlisted in scripts/check-copy.mjs). ⚖ Counsel reviews
 * every line here before POSTED_RATES is on in production
 * (docs/work/L4-pricing-spec.md §2). M8 never repeats these claims; it
 * links to the card.
 */
export const postedRateCopy = {
  eyebrow: "Posted rate · {product}",
  rate: "Rate",
  apr: "APR",
  points: "Discount points",
  profile: "Purchase · {down}%+ down · {credit}+ credit · primary residence · single-family · conforming.",
  claim: "At least {margin}% under Freddie Mac's weekly average for this product ({pmms}%, released {released}). Lock by {until} to get this rate or better.",
  subject: "Subject to credit approval, underwriting and property eligibility.",
  assumptions: "Rate assumptions",
  lines: [
    "Example: {price} purchase, {down} down ({downPct}%), {loan} loan.",
    "Zero discount points. APR includes LoanM8's lender fees ({fees}: underwriting and processing). It excludes prepaid interest, escrow and third-party fees.",
    "Estimated total closing costs: about {closingPct}% of the loan amount, including third-party fees.",
    "30-day rate lock, locked during the posted week.",
    "Benchmark: Freddie Mac Primary Mortgage Market Survey, weekly average for conventional, conforming, fully amortizing home purchase loans with 20% down and excellent credit. Freddie Mac does not report points or fees.",
    "Checked and confirmed by a licensed loan officer on {confirmed}.",
  ],
  source: "Freddie Mac PMMS",
  sourceUrl: "https://www.freddiemac.com/pmms",
} as const;
