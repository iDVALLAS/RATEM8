/**
 * lib/pricing/grid.ts — the six weekly scenarios on /rates (v37, L4).
 *
 * Owner 2026-10-31 (round 2): rows 1 and 5 of the original eight (780+,
 * 25% down, 30- and 15-year) became the posted rates (posted-rate.ts);
 * these six are priced each Thursday in the sponsoring brokerage's
 * pricing engine and entered (or, with L4b, sent for approval) in /mlo.
 * All at a $400,000 price, ZIP 98033, primary residence, single-family,
 * 30-day lock. Shown exactly as priced; nothing is adjusted to a
 * borrower's numbers.
 */
import { CONFIG } from "@/lib/config";
import { exampleScenarios } from "./providers/mock";
import type { BandedScenario } from "./types";

const PRICE = 400000;
const ZIP = "98033";
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

type Row = { id: string; purpose: "purchase" | "rate_term_refi"; program: "conventional" | "fha" | "va"; downPct: number; credit: number };

const ROWS: Row[] = [
  { id: "grid-conv30-20", purpose: "purchase", program: "conventional", downPct: 20, credit: 740 },
  { id: "grid-conv30-10", purpose: "purchase", program: "conventional", downPct: 10, credit: 700 },
  { id: "grid-conv30-5", purpose: "purchase", program: "conventional", downPct: 5, credit: 680 },
  { id: "grid-fha30-3.5", purpose: "purchase", program: "fha", downPct: 3.5, credit: 680 },
  { id: "grid-va30-0", purpose: "purchase", program: "va", downPct: 0, credit: 720 },
  { id: "grid-refi30-70", purpose: "rate_term_refi", program: "conventional", downPct: 30, credit: 760 },
];

export const PROGRAM_LABEL = { conventional: "Conventional", fha: "FHA", va: "VA" } as const;

function scenario(r: Row): BandedScenario {
  const loan = Math.round(PRICE * (1 - r.downPct / 100));
  const ltv = Math.round((loan / PRICE) * 1000) / 10;
  const isRefi = r.purpose === "rate_term_refi";
  const fees = CONFIG.pricing.fees;
  return {
    id: r.id,
    title: `${PROGRAM_LABEL[r.program]} 30-yr ${isRefi ? "rate-and-term refinance" : "purchase"}`,
    state: "WA",
    location: `ZIP ${ZIP}`,
    purpose: r.purpose,
    occupancy: "primary",
    propertyType: "single_family",
    propertyValue: PRICE,
    loanAmount: loan,
    ficoBand: String(r.credit),
    product: "30yr_fixed",
    termMonths: 360,
    program: r.program,
    downPct: r.downPct,
    creditScore: r.credit,
    zip: ZIP,
    lockDays: 30,
    assumptions: [
      isRefi
        ? `Rate-and-term refinance on a ${usd(PRICE)} home, ${usd(loan)} loan (${ltv}% loan-to-value).`
        : `${usd(PRICE)} purchase, ${usd(PRICE - loan)} down (${r.downPct}%), ${usd(loan)} loan (${ltv}% loan-to-value).`,
      `Credit score ${r.credit}.`,
      `${PROGRAM_LABEL[r.program]} 30-year fixed.`,
      "Primary residence, single-family home, 30-day rate lock.",
      `Priced for ZIP ${ZIP} (Kirkland, WA). Pricing in other areas and states may differ.`,
      `APR includes discount points and LoanM8's lender fees (underwriting ${usd(fees.underwriting)}, processing ${usd(fees.processing)}). It excludes prepaid interest, escrow, mortgage insurance${r.program === "fha" ? ", the FHA upfront mortgage insurance premium" : ""}${r.program === "va" ? ", the VA funding fee" : ""} and third-party fees.`,
      `Estimated total closing costs: about ${CONFIG.pricing.closingCostPct}% of the loan amount (${usd(Math.round((loan * CONFIG.pricing.closingCostPct) / 100))}), including third-party fees.`,
      "Priced by a licensed loan officer in the sponsoring company's pricing engine.",
    ],
  };
}

export function gridScenarios(): BandedScenario[] {
  return ROWS.map(scenario);
}

export function isGridScenario(id: string): boolean {
  return ROWS.some((r) => r.id === id);
}

/** "20% down · 740 credit" / "70% LTV · 760 credit". */
export function gridShortLabel(s: BandedScenario): string {
  const lead = s.purpose === "rate_term_refi" ? `${100 - (s.downPct ?? 0)}% LTV` : `${s.downPct}% down`;
  return `${lead} · ${s.creditScore} credit`;
}

export function gridKicker(s: BandedScenario): string {
  return `${s.purpose === "rate_term_refi" ? "Refinance" : "Purchase"} · ${PROGRAM_LABEL[s.program ?? "conventional"]} 30-yr`;
}

/** Every scenario the admin can price: the weekly grid, then the v13 examples. */
export function allScenarios(): BandedScenario[] {
  return [...gridScenarios(), ...exampleScenarios()];
}
