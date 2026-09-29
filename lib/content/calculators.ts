/**
 * lib/content/calculators.ts — long-form content for /calculators.
 *
 * Per-calculator ledes, "show your work" formulas, FAQ items (rendered
 * on the page and emitted as FAQPage JSON-LD), and the methodology text
 * served at /calculators/methodology.md. UI strings that already exist
 * in lib/copy.ts (copy.calculators) are not duplicated here.
 *
 * Formulas must stay accurate to lib/calc.ts. If the math changes, this
 * file changes with it. No rates appear anywhere in this file.
 */

import { CALC_DISCLAIMER } from "@/lib/config";

export const CALC_LAST_UPDATED = "2026-09-29";

export type CalcSlug = "points-breakeven" | "refinance-breakeven" | "rent-vs-buy" | "affordability";

export type FaqItem = { q: string; a: string };

export type CalcContent = {
  slug: CalcSlug;
  title: string;
  /** Short H1-adjacent lede. */
  lede: string;
  /** <title> / meta description. */
  metaTitle: string;
  metaDescription: string;
  /** Plain-text formulas, one per line, shown in "Show your work". */
  formulas: string[];
  /** A sentence or two on what the formulas leave out. */
  formulaNotes: string[];
  faq: FaqItem[];
};

const SHARED_PI = "payment = P × i ÷ (1 − (1 + i)^−n), where i = rate ÷ 12 ÷ 100 and n = term in months. If rate = 0, payment = P ÷ n.";

export const CALC_CONTENT: Record<CalcSlug, CalcContent> = {
  "points-breakeven": {
    slug: "points-breakeven",
    title: "Points break-even",
    lede: "Discount points cost cash today to lower the rate for the life of the loan. This tells you the month the lower payment has paid the points back. Keep the loan past that month and points helped; sell or refinance before it and they did not.",
    metaTitle: "Points break-even calculator",
    metaDescription: "Enter your own rates with and without points. See the monthly savings, the break-even month, and a chart of cumulative savings against the points cost.",
    formulas: [
      SHARED_PI,
      "monthlySavings = payment(rateWithoutPoints) − payment(rateWithPoints)",
      "breakevenMonth = ceil(pointsCost ÷ monthlySavings)",
      "cumulativeSavings(m) = monthlySavings × m",
    ],
    formulaNotes: [
      "If monthlySavings is zero or negative, there is no break-even. If the points cost is zero, break-even is month 0.",
      "Both payments use the same loan amount and a 360-month term. Taxes, insurance, and mortgage insurance are the same either way, so they are left out.",
    ],
    faq: [
      {
        q: "What is a discount point?",
        a: "One point is one percent of the loan amount, paid at closing, in exchange for a lower interest rate. How much the rate drops per point is set by the lender and changes daily, so enter the two rates you were actually offered.",
      },
      {
        q: "How do I read the break-even month?",
        a: "It is the first month in which the lower payments, added up, equal or exceed what you paid for the points. If you expect to keep the loan longer than that, the points pay off. If you expect to sell or refinance sooner, they do not.",
      },
      {
        q: "Why does the calculator ignore the time value of money?",
        a: "It runs a simple payback: dollars saved against dollars spent. A discounted version would push the break-even later, because a dollar today is worth more than a dollar in year five. Treat the simple number as the optimistic case.",
      },
      {
        q: "Are points tax-deductible?",
        a: "Sometimes, on a purchase, in the year paid, if you itemize. The rules have conditions and change. This calculator does not model taxes. Ask a tax professional.",
      },
      {
        q: "Does LoanM8 show me what rate I would get?",
        a: "No. This page displays no rates. You type the rates from your own quote or Loan Estimate and the math runs on those.",
      },
    ],
  },

  "refinance-breakeven": {
    slug: "refinance-breakeven",
    title: "Refinance break-even",
    lede: "A refinance trades closing costs today for a different payment tomorrow. This shows the month the payment savings have covered those costs, and whether you pay more or less interest overall once the new term is counted.",
    metaTitle: "Refinance break-even calculator",
    metaDescription: "Enter your current balance, rate, and remaining term against a new rate, term, and closing costs. See the monthly change, break-even month, and total interest delta.",
    formulas: [
      SHARED_PI,
      "currentPayment = payment(balance, currentRate, remainingMonths)",
      "newPayment = payment(balance, newRate, newTermMonths)",
      "monthlyChange = newPayment − currentPayment (negative means the payment went down)",
      "breakevenMonth = ceil(closingCosts ÷ (currentPayment − newPayment))",
      "totalInterest = payment × months − balance",
      "totalInterestDelta = newTotalInterest + closingCosts − currentTotalInterest",
    ],
    formulaNotes: [
      "If the new payment is not lower, there is no payment break-even.",
      "The new loan amount equals the current balance. Closing costs are treated as paid in cash, not financed.",
      "A negative interest delta means the refinance costs less in total over its full term. A positive one means you pay more overall, which happens when you restart a 30-year clock even at a lower rate.",
    ],
    faq: [
      {
        q: "Where do I find my remaining term?",
        a: "On your mortgage statement, or count the months between now and the maturity date on your note. If you have made extra payments, use the months left at your current payment, which your servicer can tell you.",
      },
      {
        q: "Why can the payment drop but total interest go up?",
        a: "Because the term restarts. Spreading the same balance over 30 new years instead of, say, 22 remaining years adds months of interest. The monthly figure and the lifetime figure answer different questions. Look at both.",
      },
      {
        q: "What counts as closing costs?",
        a: "Lender fees, third-party fees, title, recording, and any prepaid interest or escrow deposits that are not refunded from the old loan. Your Loan Estimate lists them. Enter the total you would actually pay.",
      },
      {
        q: "What if I roll the closing costs into the loan?",
        a: "The calculator does not model that. Financing the costs raises the balance and the payment slightly, which pushes break-even later. Enter the costs as if paid in cash and treat the result as the best case.",
      },
      {
        q: "Does this tell me whether I should refinance?",
        a: "No. It tells you the arithmetic on the numbers you entered. Whether to do it depends on how long you will keep the loan, what else you could do with the cash, and program details that a licensed loan officer can check.",
      },
    ],
  },

  "rent-vs-buy": {
    slug: "rent-vs-buy",
    title: "Rent vs. buy",
    lede: "Renting and owning both cost money. This adds up what each path costs over your horizon, gives the renter credit for investing the down payment, gives the owner credit for the equity left after selling, and shows which path nets cheaper and when.",
    metaTitle: "Rent vs. buy calculator",
    metaDescription: "Compare the net cost of renting against owning over your horizon. Every assumption is on the table and adjustable: rent growth, appreciation, taxes, maintenance, selling costs, and the return on invested cash.",
    formulas: [
      "downPayment = homePrice × downPaymentPct; loan = homePrice − downPayment",
      SHARED_PI,
      "Each year: totalRent += rent × 12; then rent grows by rentIncreasePct",
      "Each year: invested = (downPayment + buyingCosts) compounded at investmentReturnPct",
      "Each year: ownershipOutlay += payment × 12 + homeValue × propertyTaxPct + insurance + homeValue × maintenancePct + HOA × 12",
      "Each year: homeValue grows by appreciationPct",
      "equity = homeValue − loanBalance − homeValue × sellingCostPct",
      "rentNet = totalRent − investment growth (growth = invested − starting cash)",
      "buyNet = ownershipOutlay − equity (ownershipOutlay starts at downPayment + buyingCosts)",
      "breakevenYear = first year where buyNet ≤ rentNet",
    ],
    formulaNotes: [
      "Appreciation and investment return are your assumptions, not forecasts. Small changes move the answer a lot. Try a few.",
      "Income-tax effects (mortgage-interest deduction, capital-gains exclusion) are excluded on purpose. Mortgage insurance is excluded.",
    ],
    faq: [
      {
        q: "Why does the renter get an investment return?",
        a: "Because the down payment and buying costs are cash the renter keeps. If they invest it, it grows. Leaving that out would make buying look better than it is. If you would not invest it, set the return to zero.",
      },
      {
        q: "What does \"net cost\" mean here?",
        a: "Everything paid out on that path, minus what you get back at the end. For the renter, the give-back is investment growth. For the owner, it is equity after selling costs. Lower net cost is the cheaper path over that horizon.",
      },
      {
        q: "What is a reasonable appreciation number?",
        a: "There is no safe number. Local markets have gone up, flat, and down over ten-year stretches. The default is a placeholder, not advice. Run it at zero, then at something modest, and see if the answer changes.",
      },
      {
        q: "Does the horizon matter that much?",
        a: "Usually it is the whole answer. Buying costs and selling costs are paid once, so a short horizon rarely recovers them. A longer horizon spreads them out and lets equity build. Look at where the break-even year lands.",
      },
    ],
  },

  affordability: {
    slug: "affordability",
    title: "Affordability",
    lede: "How much house is a question about monthly cash flow first. This turns income, existing debts, and a down payment into an indicative all-in payment range and the home price it supports at the rate you enter. It is a starting point, not a pre-approval.",
    metaTitle: "Affordability calculator",
    metaDescription: "An indicative all-in payment range and price range from your income, monthly debts, down payment, and your entered rate, with the debt-to-income ratios stated. Not a pre-approval.",
    formulas: [
      "monthlyIncome = annualIncome ÷ 12",
      "conservativePayment = min(monthlyIncome × 28%, monthlyIncome × 36% − monthlyDebts), floored at 0",
      "upperPayment = max(conservativePayment, min(monthlyIncome × 31%, monthlyIncome × 43% − monthlyDebts))",
      "allInPayment = P&I + propertyTax ÷ 12 + insurance ÷ 12 + HOA",
      "price solves: budget − insurance ÷ 12 − HOA = PI(1, rate, n) × (price − downPayment) + price × taxPct ÷ 12",
      SHARED_PI,
    ],
    formulaNotes: [
      "28/36 are the conservative housing and total debt-to-income ceilings. 31/43 are a common upper guideline. Programs differ and lenders apply their own overlays.",
      "Mortgage insurance, credit history, reserves, and loan-limit rules are not modeled. Any of them can lower the real number.",
    ],
    faq: [
      {
        q: "Is this a pre-approval?",
        a: "No. A pre-approval comes from a lender after reviewing documents and, with your consent, credit. This page runs ratio math on numbers you typed and stores none of them.",
      },
      {
        q: "What are the 28/36 and 31/43 ratios?",
        a: "Debt-to-income limits. The first number caps the housing payment as a share of gross monthly income. The second caps all monthly debt payments, housing included. 28/36 is conservative. 31/43 is a common upper qualifying guideline. Programs vary.",
      },
      {
        q: "Which debts should I include?",
        a: "Minimum monthly payments that appear on a credit report: cards, auto loans, student loans, other mortgages, court-ordered support. Not utilities, groceries, or subscriptions.",
      },
      {
        q: "Why is the range so wide?",
        a: "Because the two ratio sets differ, and because property tax, insurance, and HOA eat into the same monthly budget. Tighten the range by entering the real tax rate and insurance for the area you are shopping.",
      },
      {
        q: "Why does the price change so much with the rate?",
        a: "At a fixed monthly budget, a higher rate means more of each payment goes to interest and less supports principal, so the loan the budget carries shrinks. Enter your own rate; this page does not display one.",
      },
    ],
  },
};

export const CALC_SLUGS: CalcSlug[] = ["points-breakeven", "refinance-breakeven", "rent-vs-buy", "affordability"];

/** Static assumption lines for the methodology document (mirrors lib/calc.ts). */
const METHOD_ASSUMPTIONS: Record<CalcSlug, string[]> = {
  "points-breakeven": [
    "Loan term: 360 months unless the caller overrides it.",
    "Amortization: standard fixed-rate, level payment.",
    "Savings basis: principal and interest only. Taxes, insurance, and mortgage insurance are unchanged by points and excluded.",
    "Time value of money: ignored. Break-even is a simple payback.",
    "Rates: user-entered.",
  ],
  "refinance-breakeven": [
    "New loan amount equals the current balance. Closing costs are paid in cash, not rolled in.",
    "Terms: the remaining months on the current loan versus the new term in months.",
    "Basis: principal and interest only.",
    "Time value of money: ignored.",
    "Rates: user-entered.",
  ],
  "rent-vs-buy": [
    "Rent increases once per year at the entered percentage.",
    "Home appreciation is the entered percentage per year. It is an input, not a forecast.",
    "Property tax and maintenance are percentages of the current home value, charged yearly.",
    "Selling costs are a percentage of the sale price, deducted from equity.",
    "The renter's alternative return compounds yearly on the down payment plus buying costs.",
    "Income-tax effects are ignored. Mortgage insurance is ignored.",
    "Loan term: 360 months unless overridden.",
    "Rates: user-entered.",
  ],
  affordability: [
    "Conservative ceilings: 28% housing ratio, 36% total debt ratio.",
    "Upper range: 31% housing ratio, 43% total debt ratio.",
    "Defaults when not entered: property tax 1.0% of price per year, insurance $1,500 per year, HOA $0.",
    "Loan term: 360 months unless overridden.",
    "Mortgage insurance, credit, reserves, and program limits are not modeled.",
    "Rates: user-entered.",
  ],
};

/** The full methodology document as Markdown. Served at /calculators/methodology.md. */
export function methodologyMarkdown(siteUrl: string): string {
  const lines: string[] = [];
  lines.push("# LoanM8 calculators — methodology");
  lines.push("");
  lines.push(`Last updated: ${CALC_LAST_UPDATED}`);
  lines.push("");
  lines.push("All inputs are user-entered. LoanM8 displays no rates on the calculator pages, in this document, or in the agent API. Every figure below is computed from numbers the user typed.");
  lines.push("");
  lines.push(`> ${CALC_DISCLAIMER}`);
  lines.push("");
  lines.push("Source of truth: `lib/calc.ts` in the site repository. The functions are pure, deterministic, and unit-tested. Nothing is collected or stored when a calculator runs.");
  lines.push("");
  lines.push("## Shared payment formula");
  lines.push("");
  lines.push("```");
  lines.push("i = annualRate / 12 / 100");
  lines.push("payment = P * i * (1 + i)^n / ((1 + i)^n - 1)");
  lines.push("if i = 0: payment = P / n");
  lines.push("totalInterest = payment * n - P");
  lines.push("```");
  lines.push("");
  for (const slug of CALC_SLUGS) {
    const c = CALC_CONTENT[slug];
    lines.push(`## ${c.title}`);
    lines.push("");
    lines.push(`Page: ${siteUrl}/calculators/${slug}`);
    lines.push("");
    lines.push(c.lede);
    lines.push("");
    lines.push("### Formulas");
    lines.push("");
    lines.push("```");
    for (const f of c.formulas) lines.push(f);
    lines.push("```");
    lines.push("");
    for (const n of c.formulaNotes) lines.push(`- ${n}`);
    lines.push("");
    lines.push("### Assumptions");
    lines.push("");
    for (const a of METHOD_ASSUMPTIONS[slug]) lines.push(`- ${a}`);
    lines.push("");
  }
  lines.push("## Disclaimer");
  lines.push("");
  lines.push(CALC_DISCLAIMER);
  lines.push("");
  return lines.join("\n");
}
