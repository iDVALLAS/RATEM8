/**
 * lib/pricing/daily.ts — the scenarios a licensed loan officer prices by
 * hand each day (C7, owner 2026-11-05: "the 4 scenarios you defaulted to").
 *
 * The loan officer runs each one in the brokerage's pricing engine (ARIVE)
 * with the inputs below, then enters every lender's result at
 * /mlo/pricing with the screenshot. When a borrower's scenario is close
 * to one of these, M8's get_pricing returns that day's snapshot as a
 * dated example ("today's priced example for a scenario like yours"),
 * never as the borrower's own quote. Lenders are shown by letter.
 *
 * Edit this list to change what is priced. `match` decides which borrower
 * scenarios may be shown an example: same state, purpose and program,
 * single-family primary residence, LTV inside the band, loan amount inside
 * the band, and credit at or above the scenario's band (a borrower with
 * weaker credit than the example would see pricing better than theirs).
 * C11.2: the borrower's ZIP only places them in a state; the town never
 * matters. The loan must also be at or below the limit that is the same in
 * every county (conforming baseline, FHA floor), because above it the
 * county decides high balance or jumbo pricing.
 */
import type { StateCode } from "@/lib/config";
import { exampleScenarios } from "./providers/mock";
import type { BandedScenario } from "./types";
import { countyProofLimit } from "./loanLimits";

/**
 * FHA mortgage insurance premiums: 1.75% upfront (financed) and 0.55% a
 * year for a 30-year loan with LTV above 95% and a base amount at or below
 * $726,200 (HUD Mortgagee Letter 2023-05). Check before changing scenarios.
 */
export const FHA_MIP = { upfrontPct: 1.75, annualPct: 0.55 } as const;

export type DailyMatch = {
  purpose: "purchase" | "rate_term_refinance" | "cash_out_refinance";
  loanType: "conventional" | "fha" | "non_qm_bank_statement";
  /** LTV band in percent, inclusive. */
  ltvMin: number;
  ltvMax: number;
  /** Loan amount band in dollars, inclusive. */
  loanMin: number;
  loanMax: number;
  /** Lowest credit score the example may be shown to (the scenario's band floor). */
  creditMin: number;
};

export type DailyScenario = BandedScenario & { match: DailyMatch };

/** Where the example was priced in LoanSifter (a pricing input only; never shown). */
const WA_ZIP = "98072";
/**
 * C11.2 (owner 2026-11-07): examples aren't tied to a town or ZIP. A ZIP only
 * changes pricing through loan limits, and every example is below the limit
 * that applies in all counties (loanLimits.ts).
 */
const WA_LOCATION = "Washington";
const APR_NOTE = "APR includes discount points, origination and lender fees{mi}; it excludes prepaid interest, escrow and third-party fees.";

export const DAILY_SCENARIOS: DailyScenario[] = [
  {
    id: "wa-daily-purchase-80",
    title: "Purchase, 20% down",
    state: "WA",
    location: WA_LOCATION,
    zip: WA_ZIP,
    purpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: 650000,
    loanAmount: 520000,
    ficoBand: "740–759",
    product: "30yr_fixed",
    termMonths: 360,
    program: "conventional",
    assumptions: [
      "Purchase of a home in Washington.",
      "Loan amount $520,000 on a $650,000 home (80% loan-to-value).",
      "Credit score 740–759.",
      "Conventional 30-year fixed, full documentation; the loan is under the conforming limit in every county.",
      "Primary residence, detached single-family home, one borrower.",
      "Debt-to-income ratio under 35%.",
      APR_NOTE.replace("{mi}", ""),
    ],
    match: { purpose: "purchase", loanType: "conventional", ltvMin: 75, ltvMax: 80, loanMin: 300000, loanMax: 700000, creditMin: 740 },
  },
  {
    id: "wa-daily-purchase-95",
    title: "Purchase, 5% down",
    state: "WA",
    location: WA_LOCATION,
    zip: WA_ZIP,
    purpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: 500000,
    loanAmount: 475000,
    ficoBand: "740–759",
    product: "30yr_fixed",
    termMonths: 360,
    program: "conventional",
    mi: { kind: "pmi" },
    assumptions: [
      "Purchase of a home in Washington.",
      "Loan amount $475,000 on a $500,000 home (95% loan-to-value).",
      "Credit score 740–759.",
      "Conventional 30-year fixed, full documentation, with borrower-paid monthly mortgage insurance; the loan is under the conforming limit in every county.",
      "Primary residence, detached single-family home, one borrower.",
      "Debt-to-income ratio under 35%.",
      APR_NOTE.replace("{mi}", ", and monthly mortgage insurance until it ends by schedule at 78% of the original value"),
    ],
    match: { purpose: "purchase", loanType: "conventional", ltvMin: 90.01, ltvMax: 95, loanMin: 250000, loanMax: 700000, creditMin: 740 },
  },
  {
    id: "wa-daily-fha-965",
    title: "FHA purchase, 3.5% down",
    state: "WA",
    location: WA_LOCATION,
    zip: WA_ZIP,
    purpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: 450000,
    loanAmount: 434250,
    ficoBand: "680–699",
    product: "30yr_fixed",
    termMonths: 360,
    program: "fha",
    mi: { kind: "fha", upfrontPct: FHA_MIP.upfrontPct, annualPct: FHA_MIP.annualPct },
    assumptions: [
      "Purchase of a home in Washington.",
      "Base loan $434,250 on a $450,000 home (96.5% loan-to-value), plus the 1.75% upfront FHA mortgage insurance premium financed into the loan.",
      "Credit score 680–699.",
      "FHA 30-year fixed, full documentation; the base loan is under the FHA limit in every county.",
      "Primary residence, detached single-family home, one borrower.",
      "Debt-to-income ratio under 35%.",
      APR_NOTE.replace("{mi}", ", the upfront FHA premium, and the 0.55% annual FHA premium for the life of the loan"),
    ],
    match: { purpose: "purchase", loanType: "fha", ltvMin: 95.01, ltvMax: 96.5, loanMin: 200000, loanMax: 600000, creditMin: 680 },
  },
  {
    id: "wa-daily-refi-70",
    title: "Rate-and-term refinance, 70% LTV",
    state: "WA",
    location: WA_LOCATION,
    zip: WA_ZIP,
    purpose: "rate_term_refi",
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: 800000,
    loanAmount: 560000,
    ficoBand: "760+",
    product: "30yr_fixed",
    termMonths: 360,
    program: "conventional",
    assumptions: [
      "Rate-and-term refinance of a home in Washington.",
      "Loan amount $560,000 on an $800,000 home (70% loan-to-value).",
      "Credit score 760 or higher.",
      "Conventional 30-year fixed, full documentation, no cash out; the loan is under the conforming limit in every county.",
      "Primary residence, detached single-family home, one borrower.",
      "Debt-to-income ratio under 35%.",
      APR_NOTE.replace("{mi}", ""),
    ],
    match: { purpose: "rate_term_refinance", loanType: "conventional", ltvMin: 60, ltvMax: 75, loanMin: 300000, loanMax: 700000, creditMin: 760 },
  },
  // C10 (owner 2026-11-07): replaces the "Bellevue refinance" example in the list (priced with a Bellevue ZIP; shown as Washington since C11.2).
  {
    id: "wa-daily-cashout-80",
    title: "Cash-out refinance, 80% LTV",
    state: "WA",
    location: WA_LOCATION,
    zip: "98004",
    purpose: "cash_out_refi",
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: 800000,
    loanAmount: 640000,
    ficoBand: "780+",
    product: "30yr_fixed",
    termMonths: 360,
    program: "conventional",
    assumptions: [
      "Cash-out refinance of a home in Washington.",
      "Loan amount $640,000 on an $800,000 home (80% loan-to-value), including the cash out.",
      "Credit score 780.",
      "Conventional 30-year fixed, full documentation; the loan is under the conforming limit in every county.",
      "Primary residence, detached single-family home, one borrower.",
      "Debt-to-income ratio under 35%.",
      APR_NOTE.replace("{mi}", ""),
    ],
    match: { purpose: "cash_out_refinance", loanType: "conventional", ltvMin: 75.01, ltvMax: 80, loanMin: 300000, loanMax: 700000, creditMin: 780 },
  },
  // C10 (owner 2026-11-07): non-QM purchase, 20% down, bank statements.
  {
    id: "wa-daily-nonqm-purchase-80",
    title: "Non-QM purchase, 20% down (bank statements)",
    state: "WA",
    location: WA_LOCATION,
    zip: WA_ZIP,
    purpose: "purchase",
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: 700000,
    loanAmount: 560000,
    ficoBand: "720–739",
    product: "30yr_fixed",
    termMonths: 360,
    program: "non_qm",
    assumptions: [
      "Purchase of a home in Washington.",
      "Loan amount $560,000 on a $700,000 home (80% loan-to-value).",
      "Credit score 720–739.",
      "Non-QM 30-year fixed, fully amortizing (no interest-only), self-employed borrower qualified on 12 months of bank statements.",
      "Primary residence, detached single-family home, one borrower.",
      "Debt-to-income ratio under 35%.",
      APR_NOTE.replace("{mi}", ""),
    ],
    match: { purpose: "purchase", loanType: "non_qm_bank_statement", ltvMin: 75.01, ltvMax: 80, loanMin: 300000, loanMax: 900000, creditMin: 720 },
  },
];

/**
 * C10 (owner 2026-11-07): example scenarios no longer offered on /mlo/pricing.
 * The Bellevue rate-and-term example is replaced by the Bellevue cash-out
 * daily scenario; it stays defined for the example fixtures and their tests.
 */
export const HIDDEN_FROM_ADMIN = new Set(["bellevue-refi"]);

export function dailyScenarios(): DailyScenario[] {
  return DAILY_SCENARIOS;
}

/** Every scenario a snapshot can be published for: the daily ones first, then the examples. */
export function pricingScenarios(): BandedScenario[] {
  const daily = dailyScenarios();
  return [...daily, ...exampleScenarios().filter((e) => !daily.some((d) => d.id === e.id))];
}

/** First three ZIP digits by state, for the five licensed states. */
const ZIP3: Record<string, [number, number][]> = {
  WA: [[980, 994]],
  OR: [[970, 979]],
  AZ: [[850, 865]],
  CA: [[900, 961]],
  TX: [[750, 799], [885, 885]],
};

export function zipInState(zip: string, state: StateCode): boolean {
  const z = Number(zip.slice(0, 3));
  return /^\d{5}$/.test(zip) && (ZIP3[state] ?? []).some(([a, b]) => z >= a && z <= b);
}

const CREDIT_FLOOR: Record<string, number> = {
  "780+": 780, "760-779": 760, "760+": 760, "740-759": 740, "720-739": 720, "700-719": 700, "680-699": 680,
  "660-679": 660, "640-659": 640, "620-639": 620, "below 620": 0,
};

/** The borrower's scenario as M8's get_pricing receives it. */
export type BorrowerScenario = {
  purpose: "purchase" | "rate_term_refinance" | "cash_out_refinance";
  loanAmount: number;
  propertyValue: number;
  creditBand: string;
  zip: string;
  propertyType: string;
  occupancy: string;
  loanType: string;
};

/** The daily scenario this borrower may be shown as a dated example, or null. */
export function matchDaily(b: BorrowerScenario, scenarios: DailyScenario[] = dailyScenarios()): DailyScenario | null {
  if (b.occupancy !== "primary" || b.propertyType !== "single_family") return null;
  if (!(b.propertyValue > 0)) return null;
  const ltv = (b.loanAmount / b.propertyValue) * 100;
  const credit = CREDIT_FLOOR[b.creditBand];
  if (credit === undefined) return null;
  for (const s of scenarios) {
    const m = s.match;
    if (m.purpose !== b.purpose || m.loanType !== b.loanType) continue;
    if (!zipInState(b.zip, s.state)) continue;
    if (ltv < m.ltvMin || ltv > m.ltvMax) continue;
    if (b.loanAmount < m.loanMin || b.loanAmount > m.loanMax) continue;
    // C11.2: above the all-county limit the tier (high balance, jumbo) depends on the county.
    if (b.loanAmount > countyProofLimit(m.loanType)) continue;
    if (credit < m.creditMin) continue;
    return s;
  }
  return null;
}
