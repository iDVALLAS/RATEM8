/**
 * lib/content/rate-vs-average.ts — every string RateVsAverage renders
 * (v19, Round 3 Item 3b). Kept in its own file on purpose: `check:copy`
 * fails the build if "national average" (or "below average" and the like)
 * appears anywhere else in shipped code, so the comparison can only ever
 * show up inside the component, next to the dated figures it rests on.
 *
 * OFF by default (SHOW_NATIONAL_AVG_COMPARISON). Counsel reviews this file
 * before the flag is turned on.
 */
export const rateVsAverage = {
  eyebrow: "// dated comparison · example pricing",
  /** Only used when lib/pricing/benchmark.ts computes `below` (lower rate, no more points). */
  headingBelow: "On {date}, this example priced below the national average for a {product} loan that week.",
  /** Every other case: side by side, no claim. */
  headingSide: "This example next to the national average for a {product} loan that week.",
  tableCaption: "Dated example pricing compared with a published weekly average",
  colExample: "LoanM8 example, {date}",
  colBenchmark: "{source}, week of {date}",
  rowRate: "Rate",
  rowCost: "Points and origination, % of loan",
  rowCostBenchmark: "Fees and points, % of loan",
  rowApr: "APR",
  rowLenderFees: "Other lender fees",
  notCompared: "Not compared",
  diff: "Rate difference: {diff} percentage points.",
  footnoteHeading: "What this comparison assumes",
  footnotes: [
    "One dated example, not a quote, an offer, or a commitment to lend, and not a statement about anyone's rate. A rate depends on credit, loan amount, property, and the day it is locked.",
    "Example side: the \"{option}\" option for the {scenario} scenario in {location}, priced {date}. Its full assumptions are listed with the example above.",
    "Benchmark side: {source}, {product}, week of {week}. The source describes its average as: {basis}",
    "Points and origination are discount points paid plus the origination fee, as a percent of the loan amount. The benchmark figure is the source's published average fees and points. This is only called \"below\" when the example's rate is lower and its points and origination are no higher.",
    "APR and other lender fees are shown for the example only and are not compared.",
    "An average describes many loans, borrowers, and terms. It is not what any one borrower is offered.",
  ],
  sourceLink: "Read the source",
} as const;
