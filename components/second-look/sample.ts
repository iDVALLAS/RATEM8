/**
 * components/second-look/sample.ts — the FICTIONAL Loan Estimate used
 * by the Layer 1 demo. Every number here is invented for illustration.
 * Nothing is an offer, a quote, or a real borrower. Every frame that
 * shows this data carries <SampleBadge />.
 */

import type { PointsVsCreditInput } from "@/lib/calc";

export type SampleFieldId = "rate" | "apr" | "points" | "lenderCredits" | "sectionA" | "sectionBC" | "cashToClose";

export type SampleField = { id: SampleFieldId; label: string; value: string };

/** The seven standard fields M8 reads, in reading order. */
export const SAMPLE_FIELDS: SampleField[] = [
  { id: "rate", label: "Interest rate", value: "6.500%" },
  { id: "apr", label: "APR", value: "6.712%" },
  { id: "points", label: "Points (1.000%)", value: "$4,000" },
  { id: "lenderCredits", label: "Lender credits", value: "$0" },
  { id: "sectionA", label: "A. Origination charges", value: "$5,195" },
  { id: "sectionBC", label: "B + C. Services", value: "$3,880" },
  { id: "cashToClose", label: "Estimated cash to close", value: "$47,250" },
];

export const SAMPLE_DOC = {
  borrower: "Sample Borrower",
  property: "123 Sample St",
  loanAmount: "$400,000",
  term: "30 years",
  purpose: "Purchase",
  product: "Fixed rate",
  dateIssued: "Sample date",
  sectionA: [
    { label: "% of Loan Amount (Points) 1.000%", value: "$4,000" },
    { label: "Application fee", value: "$395" },
    { label: "Underwriting fee", value: "$800" },
  ],
  sectionB: [
    { label: "Appraisal fee", value: "$650" },
    { label: "Credit report fee", value: "$55" },
    { label: "Flood determination", value: "$25" },
  ],
  sectionC: [
    { label: "Title — lender's policy", value: "$1,150" },
    { label: "Title — settlement agent", value: "$1,500" },
    { label: "Survey fee", value: "$500" },
  ],
};

/** Inputs for the interactive points-vs-credit toggle (fictional). */
export const SAMPLE_PVC: PointsVsCreditInput = {
  loanAmount: 400_000,
  parRate: 6.75,
  pointsPct: 1,
  rateReductionForPoints: 0.25,
  creditPct: 1,
  rateIncreaseForCredit: 0.25,
  termMonths: 360,
};

/** Timeline dots for the break-even strip: months 0 … 84, every 12. */
export const TIMELINE_MONTHS = [0, 12, 24, 36, 48, 60, 72, 84];
