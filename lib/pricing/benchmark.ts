/**
 * lib/pricing/benchmark.ts — the dated example-vs-benchmark comparison
 * behind RateVsAverage (v19, Round 3 Item 3b). OFF by default
 * (SHOW_NATIONAL_AVG_COMPARISON) and pending counsel review.
 *
 * Rules, enforced here and tested:
 *  - Both sides are numbers from code: the LoanM8 side is one option from
 *    a dated example run (buildPricingRun), the benchmark side is entered
 *    by hand in CONFIG from the published source. Nothing is fetched,
 *    estimated, rounded, or filled in. A bracketed placeholder, a missing
 *    figure, or a bad date means no comparison at all.
 *  - Same product, same week: the benchmark product must match the
 *    scenario's product, and the benchmark week must cover the example's
 *    date (no more than 6 days apart).
 *  - "Below" is only ever computed, never asserted: the example's note
 *    rate must be lower than the benchmark rate AND its points plus
 *    origination (as a % of the loan) must be no higher than the
 *    benchmark's fees and points. A lower rate bought with more points is
 *    shown side by side with a neutral heading, never as "below".
 */
import type { BandedScenario, LenderQuote, PricingRun } from "./types";

export type BenchmarkOption = "lowestRate" | "lowestRateWithoutRiskyFeatures" | "lowestPointsAndOrigination";

/** As entered in CONFIG: strings, so placeholders can sit there until real figures are published. */
export type BenchmarkInput = {
  source: string;
  sourceUrl: string;
  product: BandedScenario["product"];
  productLabel: string;
  /** The survey week's release date, YYYY-MM-DD. */
  weekOf: string;
  /** Average note rate, percent, e.g. "6.30". */
  rate: string;
  /** Average fees and points, percent of the loan amount, e.g. "0.6". */
  feesAndPoints: string;
  /** The source's own stated basis for its average, quoted from the release. */
  basis: string;
};

export type Benchmark = {
  source: string;
  sourceUrl: string;
  product: BandedScenario["product"];
  productLabel: string;
  weekOf: string;
  rate: number;
  feesAndPointsPct: number;
  basis: string;
};

export type BenchmarkComparison = {
  scenario: BandedScenario;
  option: BenchmarkOption;
  quote: LenderQuote;
  exampleAsOf: string;
  /** Discount points paid (never credits) + origination, as % of the loan. */
  examplePointsAndOriginationPct: number;
  benchmark: Benchmark;
  /** Example rate minus benchmark rate, in percentage points (negative = lower). */
  rateDiff: number;
  /** True only when the rate is lower AND points + origination are not higher. */
  below: boolean;
};

const PLACEHOLDER = /[[\]]/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d{1,2}(\.\d{1,3})?$/;
const MAX_DAYS_APART = 6;

const filled = (v: string) => !!v && !PLACEHOLDER.test(v) && v.trim() === v;

/** Parse the hand-entered benchmark. Null when anything is a placeholder or malformed. */
export function parseBenchmark(b: BenchmarkInput): Benchmark | null {
  const fields = [b.source, b.sourceUrl, b.productLabel, b.weekOf, b.rate, b.feesAndPoints, b.basis];
  if (!fields.every(filled)) return null;
  if (!/^https:\/\/\S+$/.test(b.sourceUrl)) return null;
  if (!ISO_DATE.test(b.weekOf) || Number.isNaN(Date.parse(`${b.weekOf}T00:00:00Z`))) return null;
  if (!DECIMAL.test(b.rate) || !DECIMAL.test(b.feesAndPoints)) return null;
  const rate = Number(b.rate);
  const feesAndPointsPct = Number(b.feesAndPoints);
  if (!(rate > 0 && rate < 20) || !(feesAndPointsPct >= 0 && feesAndPointsPct < 10)) return null;
  return { source: b.source, sourceUrl: b.sourceUrl, product: b.product, productLabel: b.productLabel, weekOf: b.weekOf, rate, feesAndPointsPct, basis: b.basis };
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Round to 3 decimals for comparisons, so float noise never flips "below". */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function compareToBenchmark(run: PricingRun, option: BenchmarkOption, input: BenchmarkInput, exampleAsOf: string): BenchmarkComparison | null {
  if (run.mode !== "example") return null;
  const benchmark = parseBenchmark(input);
  if (!benchmark) return null;
  if (benchmark.product !== run.scenario.product) return null;
  if (!ISO_DATE.test(exampleAsOf) || daysApart(exampleAsOf, benchmark.weekOf) > MAX_DAYS_APART) return null;

  const pick = run.selection[option];
  const quote = pick ? run.quotes.find((q) => q.lender === pick.lender && q.eligible) : undefined;
  if (!quote || quote.noteRate === null || quote.hasRiskyFeature) return null;

  const examplePointsAndOriginationPct = r3((quote.pointsAndOriginationDollars / run.scenario.loanAmount) * 100);
  const rateDiff = r3(quote.noteRate - benchmark.rate);
  const below = rateDiff < 0 && examplePointsAndOriginationPct <= r3(benchmark.feesAndPointsPct);

  return { scenario: run.scenario, option, quote, exampleAsOf, examplePointsAndOriginationPct, benchmark, rateDiff, below };
}
