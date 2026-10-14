/**
 * lib/pricing/types.ts — normalized pricing types.
 *
 * Every provider (mock, manual, and later arive / optimal_blue / ratesheet)
 * produces the same `PricingRun`. Numbers in a run come from code: rates
 * and fees are entered or fetched as data, and APR, payments, totals and
 * the anti-steering selection are computed by `buildPricingRun()`. No
 * model ever generates, rounds, or infers a number in this pipeline.
 */
import type { StateCode } from "@/lib/config";

export type ProviderId = "arive" | "optimal_blue" | "ratesheet" | "manual" | "mock";

/** Where a displayed run came from. Never "live" while PRICING_LIVE is off. */
export type RunMode = "example" | "snapshot";

export type LoanPurpose = "purchase" | "rate_term_refi";

/**
 * A scenario described in bands, not as one borrower's file. Banding keeps
 * fixtures and snapshots non-identifying.
 */
export type BandedScenario = {
  id: string;
  title: string;
  /** Fictional persona label for demos only, e.g. "Sarah (fictional)". */
  persona?: string;
  state: StateCode;
  location: string;
  purpose: LoanPurpose;
  occupancy: "primary";
  propertyType: "single_family";
  propertyValue: number;
  loanAmount: number;
  ficoBand: string;
  product: "30yr_fixed" | "15yr_fixed";
  termMonths: number;
  /** Plain-language assumptions shown next to every price. */
  assumptions: string[];
};

/**
 * Features that disqualify a loan from the "without risky features" option
 * of the Reg Z 1026.36(e)(3) safe harbor.
 */
export type RiskyFeatures = {
  negativeAmortization: boolean;
  prepaymentPenalty: boolean;
  interestOnly: boolean;
  balloonFirst7Years: boolean;
  demandFeature: boolean;
  sharedEquityOrAppreciation: boolean;
};

export const NO_RISKY_FEATURES: RiskyFeatures = {
  negativeAmortization: false,
  prepaymentPenalty: false,
  interestOnly: false,
  balloonFirst7Years: false,
  demandFeature: false,
  sharedEquityOrAppreciation: false,
};

/** One lender's result as entered or fetched, before computation. */
export type QuoteInput = {
  /** Internal lender key. Never rendered publicly. */
  lenderKey: string;
  productLabel: string;
  eligible: boolean;
  ineligibleReason?: string;
  /** Annual note rate in percent, e.g. 6.375. Null when ineligible. */
  noteRate: number | null;
  /** Discount points as % of loan. Negative = lender credit. */
  pointsPct: number;
  /** Origination fee in dollars. */
  originationFee: number;
  /** Other lender fees (underwriting, processing) in dollars. */
  lenderFees: number;
  lockDays: number;
  /** Interest-only months at the start of the term (0 = fully amortizing). */
  interestOnlyMonths: number;
  features: RiskyFeatures;
};

/** One lender's normalized, computed result. Public: anonymized. */
export type LenderQuote = {
  /** Public label, e.g. "Lender C". Re-lettered per run. */
  lender: string;
  productLabel: string;
  eligible: boolean;
  ineligibleReason: string | null;
  noteRate: number | null;
  apr: number | null;
  pointsPct: number;
  /** Positive = points paid; negative = lender credit received. */
  pointsDollars: number;
  originationFee: number;
  lenderFees: number;
  /** Discount points paid (never credits) + origination fee. Safe-harbor option C. */
  pointsAndOriginationDollars: number;
  /** Prepaid finance charges used for APR (floored at zero). */
  prepaidFinanceCharges: number;
  monthlyPayment: number | null;
  /** Payment after an interest-only period ends, when there is one. */
  monthlyPaymentAfterIO: number | null;
  lockDays: number;
  interestOnlyMonths: number;
  features: RiskyFeatures;
  hasRiskyFeature: boolean;
};

export type SelectionPick = {
  lender: string;
  rationale: string;
};

/** The three Reg Z 1026.36(e)(3) options, computed from normalized data only. */
export type AntiSteeringSelection = {
  lowestRate: SelectionPick | null;
  lowestRateWithoutRiskyFeatures: SelectionPick | null;
  lowestPointsAndOrigination: SelectionPick | null;
  eligibleCreditors: number;
  /** True when options come from at least three eligible creditors. */
  meetsCreditorCount: boolean;
};

export type PricingRun = {
  schemaVersion: 1;
  runId: string;
  tenantId: string;
  provider: ProviderId;
  mode: RunMode;
  scenario: BandedScenario;
  /** ISO timestamp of the pricing (entry time for manual, fixture date for mock). */
  pricedAt: string;
  quotes: LenderQuote[];
  selection: AntiSteeringSelection;
  /** sha256 of the canonical inputs this run was built from. */
  inputsHash: string;
};

/** Everything needed to rebuild a run byte-for-byte. */
export type RunInputs = {
  runId: string;
  tenantId: string;
  provider: ProviderId;
  mode: RunMode;
  scenario: BandedScenario;
  pricedAt: string;
  quotes: QuoteInput[];
};

export type LenderRef = { key: string; name: string; manual: boolean };

export type ProviderHealth = { ok: boolean; detail: string };

export interface PricingProvider {
  id: ProviderId;
  listApprovedLenders(tenantId: string): Promise<LenderRef[]>;
  priceScenario(tenantId: string, scenario: BandedScenario): Promise<PricingRun | null>;
  health(tenantId: string): Promise<ProviderHealth>;
}
