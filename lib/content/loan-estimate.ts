/**
 * lib/content/loan-estimate.ts — content for /loan-estimate.
 *
 * The Loan Estimate is a three-page federal form (12 CFR 1026.37). The
 * section list below follows its structure: page 1 (Loan Terms,
 * Projected Payments, Costs at Closing), page 2 (Loan Costs A/B/C with
 * D total, Other Costs E/F/G/H with I total, J total closing costs and
 * lender credits, Calculating Cash to Close), page 3 (Comparisons,
 * Other Considerations, Confirm Receipt).
 *
 * Every number in `sample` is fictional, chosen so the arithmetic on
 * the mock form adds up. Nothing here is a quote or an offer.
 */

export type LeSectionId =
  | "loan-terms"
  | "projected-payments"
  | "costs-at-closing"
  | "loan-costs"
  | "other-costs"
  | "total-closing-costs"
  | "cash-to-close"
  | "comparisons"
  | "other-considerations";

export type LeSection = {
  id: LeSectionId;
  n: number;
  page: 1 | 2 | 3;
  /** The heading as it appears on the form. */
  formTitle: string;
  title: string;
  explain: string[];
  check: string[];
};

export const leSections: LeSection[] = [
  {
    id: "loan-terms",
    n: 1,
    page: 1,
    formTitle: "Loan Terms",
    title: "Loan Terms",
    explain: [
      "The top of page 1 states the loan amount, interest rate, and monthly principal-and-interest payment. Next to each is a yes-or-no answer to one question: can this amount increase after closing?",
      "Two more rows ask whether the loan has a prepayment penalty or a balloon payment. On a plain fixed-rate loan every one of those answers is NO.",
    ],
    check: [
      "\"Can this amount increase after closing?\" should say NO on the loan amount and the rate for a fixed-rate loan. A YES means an adjustable rate or a feature you need explained.",
      "Prepayment penalty and balloon payment should both say NO unless you knowingly chose a product that has one.",
      "The loan amount should match what you asked for, not the sale price.",
    ],
  },
  {
    id: "projected-payments",
    n: 2,
    page: 1,
    formTitle: "Projected Payments",
    title: "Projected Payments",
    explain: [
      "This table shows your total monthly payment, split into principal and interest, mortgage insurance, and estimated escrow for taxes and insurance. If the payment changes over the life of the loan, the table gets extra columns showing when and to what.",
      "Under the table, the form lists which of your taxes, insurance, and assessments are paid through escrow and which you will pay on your own.",
    ],
    check: [
      "One column means the payment is projected to stay the same. More than one column means it changes; find out why.",
      "Mortgage insurance appears here if your down payment is under twenty percent on a conventional loan, or on most government loans.",
      "If an item says NOT in escrow, you pay it directly and should budget for it separately.",
    ],
  },
  {
    id: "costs-at-closing",
    n: 3,
    page: 1,
    formTitle: "Costs at Closing",
    title: "Costs at Closing",
    explain: [
      "Two numbers close out page 1. Estimated Closing Costs is the total from page 2 (loan costs plus other costs, minus any lender credits). Estimated Cash to Close is the money you need to bring, which includes closing costs and your down payment after subtracting anything already paid.",
      "These two numbers are the fastest way to compare estimates from different lenders, as long as the loan amount, rate, and closing date are the same.",
    ],
    check: [
      "Estimated Closing Costs should equal J on page 2.",
      "Estimated Cash to Close should match the Calculating Cash to Close table on page 2.",
      "A low cash-to-close figure can hide a high rate. Read page 1 and page 2 together.",
    ],
  },
  {
    id: "loan-costs",
    n: 4,
    page: 2,
    formTitle: "Loan Costs (A, B, C, D)",
    title: "Loan Costs: A, B, C, and D",
    explain: [
      "Section A is Origination Charges: what the lender itself charges, including any discount points, which are always shown as a percentage of the loan amount and a dollar figure. Section B is Services You Cannot Shop For, such as the appraisal and credit report, where the lender picks the provider. Section C is Services You Can Shop For, such as title services and a survey, where you may choose the provider.",
      "D is the total of A, B, and C. This is the number most people mean when they ask what the loan costs.",
    ],
    check: [
      "Section A is the lender's own price. Compare it line by line across lenders; the other sections are mostly third parties.",
      "Points in A are a choice, not a requirement. Ask what the rate would be with zero points.",
      "Section C providers can be shopped. The lender must give you a written list of providers if you want to shop.",
    ],
  },
  {
    id: "other-costs",
    n: 5,
    page: 2,
    formTitle: "Other Costs (E, F, G, H, I)",
    title: "Other Costs: E, F, G, H, and I",
    explain: [
      "Section E is Taxes and Other Government Fees: recording fees and, in some places, transfer taxes. Section F is Prepaids: the homeowner's insurance premium, prepaid interest from closing day to the end of the month, and any property taxes due before your first payment. Section G is the Initial Escrow Payment at Closing: the first few months of taxes and insurance deposited into your escrow account. Section H is Other: items like an optional owner's title policy.",
      "I is the total of E through H. These costs are mostly set by governments, insurers, and the calendar, not by the lender, so they look similar on every estimate for the same house.",
    ],
    check: [
      "Prepaid interest in F depends on your closing date. Closing later in the month lowers it.",
      "Section G is your money going into your own escrow account, not a fee.",
      "Anything marked optional in H is optional. Ask what happens if you decline it.",
    ],
  },
  {
    id: "total-closing-costs",
    n: 6,
    page: 2,
    formTitle: "Total Closing Costs (J) and Lender Credits",
    title: "Total Closing Costs (J) and Lender Credits",
    explain: [
      "J adds D and I together, then subtracts lender credits. A lender credit is money the lender contributes toward your closing costs, usually in exchange for a higher interest rate. It appears as a negative number.",
      "Points and lender credits are the same lever pulled in opposite directions: pay more now for a lower rate, or take a higher rate for less due at closing.",
    ],
    check: [
      "J should equal D plus I minus lender credits. Do the arithmetic.",
      "If there is a lender credit, ask what rate you would get without it, and if there are points, ask what rate you would get without them.",
      "A lender credit that only exists because of a higher rate is not free money. The Comparisons section on page 3 shows the cost over time.",
    ],
  },
  {
    id: "cash-to-close",
    n: 7,
    page: 2,
    formTitle: "Calculating Cash to Close",
    title: "Calculating Cash to Close",
    explain: [
      "This table starts with total closing costs and walks through everything that changes what you bring to the table: costs financed into the loan, your down payment, the earnest-money deposit you already paid, funds for the borrower, seller credits, and adjustments. The last line is Estimated Cash to Close.",
      "On the Closing Disclosure you get before signing, this same table shows the Loan Estimate figure beside the final figure, with a note on anything that changed.",
    ],
    check: [
      "Your deposit should appear as a negative number; it reduces what you owe at closing.",
      "Seller credits agreed in the contract should be here. If they are missing, the lender may not know about them.",
      "Keep this page. It is the baseline the Closing Disclosure will be compared to.",
    ],
  },
  {
    id: "comparisons",
    n: 8,
    page: 3,
    formTitle: "Comparisons",
    title: "Comparisons: In 5 Years, APR, and TIP",
    explain: [
      "In 5 Years shows two figures: the total you will have paid in principal, interest, mortgage insurance, and loan costs by the end of year five, and how much of the principal you will have paid off. APR is the annual percentage rate, which folds most loan costs into the interest rate so estimates with different fee structures can be compared. TIP is the Total Interest Percentage: all the interest you would pay over the full term as a percentage of the loan amount.",
      "These three figures exist so you can compare loans that trade fees for rate. They are standardized across every lender.",
    ],
    check: [
      "A bigger gap between the rate and the APR means more loan costs are baked in.",
      "Compare In 5 Years totals between estimates if you expect to sell or refinance within a few years.",
      "TIP is high on every thirty-year loan. Use it to compare, not to panic.",
    ],
  },
  {
    id: "other-considerations",
    n: 9,
    page: 3,
    formTitle: "Other Considerations and Confirm Receipt",
    title: "Other Considerations and Confirm Receipt",
    explain: [
      "The bottom of page 3 lists things that are true about the loan but do not fit in a number: whether the appraisal will be shared with you, whether the loan can be assumed by a future buyer, that homeowner's insurance is required, what the late-payment charge is, that no one can promise you will be able to refinance later, and whether the lender intends to service the loan or transfer it.",
      "Confirm Receipt is a signature line. Signing it means only that you received the form. It does not mean you accept the loan.",
    ],
    check: [
      "Signing Confirm Receipt is not applying, not accepting, and not committing. You can still walk away.",
      "Servicing transfers are common and change where you send payments, not the terms of the loan.",
      "Read the late-payment line once now so it is never a surprise.",
    ],
  },
];

/**
 * Fictional figures for the mock form. They are internally consistent:
 * A + B + C = D, E + F + G + H = I, D + I − credits = J, and the
 * Cash to Close table reconciles to page 1.
 */
export const leSample = {
  applicant: "Sample Borrower",
  property: "123 Sample St, Anytown, WA",
  salePrice: "$500,000",
  loanTerm: "30 years",
  purpose: "Purchase",
  product: "Fixed Rate",
  loanType: "Conventional",
  loanId: "SAMPLE-000000",
  rateLock: "NO",

  loanAmount: "$400,000",
  interestRate: "6.000%",
  pi: "$2,398.20",
  mi: "0",
  escrow: "$650",
  totalPayment: "$3,048.20",
  escrowMonthly: "$650",

  closingCosts: "$9,800",
  cashToClose: "$99,800",

  a: {
    total: "$3,200",
    rows: [
      ["0.5% of Loan Amount (Points)", "$2,000"],
      ["Application Fee", "$300"],
      ["Underwriting Fee", "$900"],
    ],
  },
  b: {
    total: "$670",
    rows: [
      ["Appraisal Fee", "$600"],
      ["Credit Report Fee", "$50"],
      ["Flood Determination Fee", "$20"],
    ],
  },
  c: {
    total: "$1,430",
    rows: [
      ["Pest Inspection Fee", "$100"],
      ["Survey Fee", "$150"],
      ["Title – Lender's Title Policy", "$700"],
      ["Title – Settlement Agent Fee", "$400"],
      ["Title – Title Search", "$80"],
    ],
  },
  d: "$5,300",
  e: { total: "$200", rows: [["Recording Fees", "$200"]] },
  f: {
    total: "$2,186.25",
    rows: [
      ["Homeowner's Insurance Premium (12 mo.)", "$1,200"],
      ["Prepaid Interest ($65.75 per day for 15 days)", "$986.25"],
      ["Property Taxes (0 mo.)", "$0"],
    ],
  },
  g: {
    total: "$1,300",
    rows: [
      ["Homeowner's Insurance $100 per month for 2 mo.", "$200"],
      ["Property Taxes $550 per month for 2 mo.", "$1,100"],
    ],
  },
  h: { total: "$813.75", rows: [["Title – Owner's Title Policy (optional)", "$813.75"]] },
  i: "$4,500",
  dPlusI: "$9,800",
  lenderCredits: "$0",
  j: "$9,800",

  cash: [
    ["Total Closing Costs (J)", "$9,800"],
    ["Closing Costs Financed", "$0"],
    ["Down Payment / Funds from Borrower", "$100,000"],
    ["Deposit", "– $10,000"],
    ["Funds for Borrower", "$0"],
    ["Seller Credits", "$0"],
    ["Adjustments and Other Credits", "$0"],
    ["Estimated Cash to Close", "$99,800"],
  ],

  in5Total: "$149,192",
  in5Principal: "$27,782",
  apr: "6.24%",
  tip: "115.84%",

  other: [
    ["Appraisal", "We may order an appraisal and promptly give you a copy."],
    ["Assumption", "If you sell or transfer this property, we will not allow assumption of this loan."],
    ["Homeowner's Insurance", "This loan requires homeowner's insurance, which you may obtain from a company of your choice."],
    ["Late Payment", "If your payment is more than 15 days late, we will charge a late fee of 5% of the monthly principal and interest payment."],
    ["Refinance", "Refinancing this loan will depend on your future financial situation, the property value, and market conditions."],
    ["Servicing", "We intend to transfer servicing of your loan."],
  ],
} as const;

export const leContent = {
  metaTitle: "Loan Estimate guide — LoanM8",
  metaDescription:
    "An annotated, plain-English guide to every section of the standard three-page Loan Estimate: loan terms, projected payments, loan costs, other costs, cash to close, and the comparisons on page 3. Fictional numbers.",
  eyebrow: "// guide",
  heading: "How to read a Loan Estimate.",
  accent: "read",
  sub: "The Loan Estimate is a three-page federal form every lender has to use. Same boxes, same order, every time. Tap a number on the form to see what that section means and what to check.",
  sampleNote: "Every figure on this mock form is fictional and chosen so the arithmetic adds up. It is not a quote, a rate, or an offer.",
  diagramLabel: "// the form",
  notesLabel: "// plain English",
  whatToCheck: "What to check",
  showOnForm: "Show on the form",
  pageLabel: (n: number) => `Page ${n} of 3`,
  textEquivalent:
    "A three-page mock Loan Estimate with fictional figures. Nine numbered callouts mark the form's sections: Loan Terms, Projected Payments, and Costs at Closing on page 1; Loan Costs (A, B, C, D), Other Costs (E, F, G, H, I), Total Closing Costs (J) with lender credits, and Calculating Cash to Close on page 2; Comparisons (In 5 Years, APR, TIP) and Other Considerations with Confirm Receipt on page 3. Selecting a callout highlights that region of the form and opens its plain-English explanation.",
  faqHeading: "Questions",
  faq: [
    {
      q: "When do I get a Loan Estimate?",
      a: "A lender must send a Loan Estimate within three business days after receiving your application, which under federal rules means your name, income, Social Security number, the property address, an estimate of its value, and the loan amount you want. You are not obligated to proceed just because you received one.",
    },
    {
      q: "Is a Loan Estimate an approval?",
      a: "No. It is an estimate of terms and costs based on what you told the lender. Approval comes later, after income, assets, and credit are verified. Signing the Confirm Receipt line only acknowledges that you got the form.",
    },
    {
      q: "Which numbers can change before closing?",
      a: "Some fees have no tolerance for increase, such as the lender's own charges in Section A and transfer taxes. Others, like third-party services you did not shop for, have a limited tolerance in total. Prepaids, escrow deposits, and services you chose from outside the lender's list can change. The Closing Disclosure shows every change beside the Loan Estimate figure.",
    },
    {
      q: "How do I compare Loan Estimates from different lenders?",
      a: "Line up the loan amount, rate, and closing date first so you are comparing like with like. Then compare Section A (the lender's own charges), the lender credits, and the three Comparisons figures on page 3: In 5 Years, APR, and TIP. Sections B through I are mostly third parties and taxes and should look similar.",
    },
    {
      q: "Can M8 read my real Loan Estimate?",
      a: "Second Look is built for exactly that: you drop the document you already have and M8 explains it line by line in plain English. It never compares it to LoanM8 pricing and never implies a better deal. It only makes sure you understand what you were handed.",
    },
  ],
  cta: {
    eyebrow: "// second look",
    title: "Got one of these? Drop it. M8 reads it.",
    accent: "Drop it.",
    body: "Second Look explains the Loan Estimate you already have, line by line. No comparison to our pricing, no pressure, no credit pull.",
    label: "See how Second Look works",
    href: "/second-look",
  },
} as const;
