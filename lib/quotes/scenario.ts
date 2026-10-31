/**
 * lib/quotes/scenario.ts — the personal estimate scenario (v37, L4).
 *
 * One shape for every way a request arrives: M8 quote mode builds it from
 * the borrower's answers (no form is shown), and AI assistants send it as
 * JSON (/api/agent/quote). Only non-sensitive facts: no name, no SSN, no
 * date of birth, no address beyond a ZIP, no account numbers. The email
 * is used only to send the approved estimate, with the person's consent.
 */
import { z } from "zod";
import { STATES, type StateCode } from "@/lib/config";

export const PURPOSES = ["purchase", "refinance", "cashout"] as const;
export const LOAN_TYPES = ["not_sure", "conventional", "fha", "va"] as const;
export const TERMS = ["30", "15"] as const;
export const CREDIT_BANDS = ["780+", "760-779", "740-759", "700-739", "660-699", "below-660"] as const;
export const PROPERTY_TYPES = ["single_family", "condo", "multi_2_4"] as const;
export const OCCUPANCIES = ["primary", "second_home", "investment"] as const;

const money = (min: number, max: number) => z.number().finite().int().min(min).max(max);

export const QuoteScenarioSchema = z
  .object({
    purpose: z.enum(PURPOSES),
    loanType: z.enum(LOAN_TYPES),
    term: z.enum(TERMS).default("30"),
    /** Purchase price, or the home's estimated value for a refinance. */
    price: money(50_000, 5_000_000),
    /** Purchase only: down payment in dollars. */
    down: money(0, 5_000_000).optional(),
    /** Refinance / cash-out: current loan balance. */
    balance: money(0, 5_000_000).optional(),
    /** Cash-out only: cash wanted at closing. */
    cashOut: money(0, 2_000_000).optional(),
    creditBand: z.enum(CREDIT_BANDS),
    zip: z.string().regex(/^\d{5}$/, "ZIP must be 5 digits"),
    propertyType: z.enum(PROPERTY_TYPES),
    occupancy: z.enum(OCCUPANCIES),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.purpose === "purchase") {
      if (s.down === undefined) ctx.addIssue({ code: "custom", path: ["down"], message: "down payment required for a purchase" });
      else if (s.down >= s.price) ctx.addIssue({ code: "custom", path: ["down"], message: "down payment must be less than the price" });
    } else {
      if (s.balance === undefined) ctx.addIssue({ code: "custom", path: ["balance"], message: "current loan balance required for a refinance" });
      if (s.purpose === "cashout" && !s.cashOut) ctx.addIssue({ code: "custom", path: ["cashOut"], message: "cash-out amount required" });
      if (s.balance !== undefined && s.balance + (s.cashOut ?? 0) >= s.price) ctx.addIssue({ code: "custom", path: ["balance"], message: "the new loan must be less than the home's value" });
    }
    if (s.loanType === "va" && s.occupancy !== "primary") ctx.addIssue({ code: "custom", path: ["loanType"], message: "VA loans are for a primary residence" });
    if (s.loanType === "fha" && s.occupancy !== "primary") ctx.addIssue({ code: "custom", path: ["loanType"], message: "FHA loans are for a primary residence" });
  });

export type QuoteScenario = z.infer<typeof QuoteScenarioSchema>;

/** New loan amount for the scenario. */
export function loanAmount(s: QuoteScenario): number {
  return s.purpose === "purchase" ? s.price - (s.down ?? 0) : (s.balance ?? 0) + (s.cashOut ?? 0);
}

export function ltvPct(s: QuoteScenario): number {
  return Math.round((loanAmount(s) / s.price) * 1000) / 10;
}

/**
 * ZIP → state for the states LoanM8 serves (USPS three-digit prefixes).
 * Anything else returns null: LoanM8 can't price it.
 */
const ZIP3: Record<StateCode, ReadonlyArray<[number, number]>> = {
  WA: [[980, 994]],
  OR: [[970, 979]],
  AZ: [[850, 865]],
  CA: [[900, 961]],
  TX: [[750, 799], [885, 885]],
};

export function stateForZip(zip: string): StateCode | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const p = Number(zip.slice(0, 3));
  for (const st of STATES) {
    if ((ZIP3[st.code] ?? []).some(([a, b]) => p >= a && p <= b)) return st.code;
  }
  return null;
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export const LABELS = {
  purpose: { purchase: "Purchase", refinance: "Refinance", cashout: "Cash-out refinance" },
  loanType: { not_sure: "Not sure", conventional: "Conventional", fha: "FHA", va: "VA" },
  term: { "30": "30-year fixed", "15": "15-year fixed" },
  creditBand: { "780+": "780+", "760-779": "760–779", "740-759": "740–759", "700-739": "700–739", "660-699": "660–699", "below-660": "Below 660" },
  propertyType: { single_family: "Single-family", condo: "Condo", multi_2_4: "2–4 units" },
  occupancy: { primary: "Primary home", second_home: "Second home", investment: "Investment" },
} as const;

/** One line for confirmations, alerts and the queue. */
export function scenarioLine(s: QuoteScenario): string {
  const money =
    s.purpose === "purchase"
      ? `${usd(s.price)} · ${usd(s.down ?? 0)} down (${Math.round(((s.down ?? 0) / s.price) * 1000) / 10}%)`
      : `${usd(s.price)} value · ${usd(s.balance ?? 0)} balance${s.cashOut ? ` · ${usd(s.cashOut)} cash out` : ""}`;
  return [LABELS.purpose[s.purpose], money, LABELS.loanType[s.loanType], LABELS.term[s.term], `${LABELS.creditBand[s.creditBand]} credit`, `ZIP ${s.zip}`, LABELS.propertyType[s.propertyType], LABELS.occupancy[s.occupancy]].join(" · ");
}

/** Lowest score in a band (used to pick the nearest weekly scenario). */
export function bandFloor(b: (typeof CREDIT_BANDS)[number]): number {
  return b === "below-660" ? 620 : Number(b.slice(0, 3));
}
