/**
 * lib/content/sample-brief.ts — content for /sample-brief.
 *
 * A sample Rate Strategy Brief for a fictional borrower. Every figure is
 * fictional and labeled as such; no lender is named (Lender 1/2/3). The
 * three options follow the anti-steering pattern a broker presents:
 *   A — lowest rate the borrower is suitable for
 *   B — lowest rate without risky features
 *   C — lowest total points and fees
 * Nothing here is a quote, a rate, or an offer.
 */

export type BriefOption = {
  key: "A" | "B" | "C";
  label: string;
  lender: string;
  product: string;
  rate: string;
  apr: string;
  pointsOrCredit: string;
  pointsNote: string;
  pi: string;
  cashToClose: string;
  features: string[];
  flag?: string;
};

export const briefSample = {
  borrower: "Sample Borrower",
  date: "Sample date",
  situation: [
    ["Goal", "Purchase, primary residence"],
    ["Area", "Western Washington"],
    ["Sale price", "$500,000"],
    ["Down payment", "$100,000 (20%)"],
    ["Loan amount", "$400,000"],
    ["Term", "30-year fixed"],
    ["Plan to stay", "About 7 years"],
    ["Priority", "Predictable payment, keep cash reserves"],
  ],
  options: [
    {
      key: "A",
      label: "Lowest rate suitable",
      lender: "Lender 1",
      product: "30-year fixed",
      rate: "5.875%",
      apr: "6.03%",
      pointsOrCredit: "1.000 point ($4,000)",
      pointsNote: "Lender fees $1,200; total points and fees $5,200",
      pi: "$2,366.15",
      cashToClose: "$101,800",
      features: ["3-year prepayment penalty", "No balloon", "Fixed rate"],
      flag: "Has a prepayment penalty. Selling or refinancing in the first three years costs extra.",
    },
    {
      key: "B",
      label: "Lowest rate without risky features",
      lender: "Lender 2",
      product: "30-year fixed",
      rate: "6.000%",
      apr: "6.10%",
      pointsOrCredit: "0.500 point ($2,000)",
      pointsNote: "Lender fees $1,200; total points and fees $3,200",
      pi: "$2,398.20",
      cashToClose: "$99,800",
      features: ["No prepayment penalty", "No balloon", "Fixed rate"],
    },
    {
      key: "C",
      label: "Lowest total points and fees",
      lender: "Lender 3",
      product: "30-year fixed",
      rate: "6.250%",
      apr: "6.28%",
      pointsOrCredit: "0 points, $1,000 lender credit",
      pointsNote: "Lender fees $1,200 less credit; total points and fees $200",
      pi: "$2,462.87",
      cashToClose: "$96,800",
      features: ["No prepayment penalty", "No balloon", "Fixed rate"],
    },
  ] as BriefOption[],
  tradeoffs: [
    "Option A has the lowest rate and the lowest monthly payment, and it costs the most at closing. Its prepayment penalty is the reason it is not Option B: if plans change inside three years, it stops being the cheapest loan.",
    "Option B costs a little more per month than A and about two thousand dollars less at closing. It has none of the features that can bite later. For a borrower planning to stay about seven years, the extra half point on A would take years of the lower payment to earn back.",
    "Option C keeps the most cash in the bank at closing and has the highest payment. The lender credit is paid for by the higher rate over time. It fits a borrower who is short on reserves or who expects to refinance or sell soon.",
    "None of these is the right answer for everyone. The written record is what matters: you can see all three, you know why each is on the list, and you know which one you chose and why.",
  ],
  questions: [
    "What would the rate be on each option with zero points and zero credits?",
    "Is the prepayment penalty on Option A a fixed amount or a percentage, and when does it expire?",
    "Which of these fees are the lender's own and which are third parties I can shop?",
    "How long is the rate lock, and what does it cost to extend it?",
    "If I sell in year four, which option leaves me with the least total paid?",
    "What has to be true about my income, assets, and credit for each option to hold up in underwriting?",
  ],
  nextSteps: [
    "Talk it through with your licensed loan officer. The brief is a starting point for a conversation, not the end of one.",
    "Choose an option, or ask for a fourth. Every version of the brief is kept so you can see what changed.",
    "Nothing moves until you say so. A hard credit pull, an application, and a rate lock each happen only with your consent.",
  ],
} as const;

export const briefContent = {
  metaTitle: "Sample Rate Strategy Brief — LoanM8",
  metaDescription:
    "What the written Rate Strategy Brief looks like: a fictional borrower's situation, three options compared the anti-steering way, plain-English tradeoffs, questions to ask, and next steps. Sample figures only.",
  banner: "SAMPLE — fictional borrower, fictional figures. Not an offer.",
  eyebrow: "// rate strategy brief",
  heading: "The document you leave with.",
  accent: "leave with",
  sub: "Every LoanM8 borrower gets a written Rate Strategy Brief: the options that were shopped, the tradeoffs in plain English, and why the chosen loan was chosen. This is what one looks like, with a fictional borrower and fictional numbers.",
  sceneLabel: "// the brief",
  docTitle: "Rate Strategy Brief",
  preparedFor: "Prepared for",
  sections: {
    situation: "Your situation",
    options: "Three options compared",
    optionsSub: "Presented the anti-steering way: the lowest rate you qualify for, the lowest rate without risky features, and the lowest total points and fees. Lenders are numbered, not named, in this sample.",
    tradeoffs: "Plain-English tradeoffs",
    questions: "Questions to ask",
    next: "Next steps",
  },
  optionLabels: {
    rate: "Rate",
    apr: "APR",
    points: "Points / credit",
    pi: "Monthly P&I",
    cash: "Cash to close",
    features: "Features",
    flag: "Watch for",
  },
  swipeHint: "Swipe to compare",
  textEquivalent:
    "A paper document titled Rate Strategy Brief unfolds and its sections appear in order: the borrower's situation (a fictional purchase in Western Washington), three loan options labeled A, B, and C with fictional rates, APRs, points or credits, monthly payments, and cash to close from lenders numbered 1, 2, and 3, then plain-English tradeoffs, questions to ask, and next steps. Every page is marked SAMPLE.",
  ctaEyebrow: "// next step",
  ctaHeading: "Want one with your numbers in it?",
  ctaSub: "A short call with a licensed loan officer starts it. Nothing is pulled and nothing is locked until you say so.",
  ctaLabel: "Talk to a licensed loan officer",
} as const;
