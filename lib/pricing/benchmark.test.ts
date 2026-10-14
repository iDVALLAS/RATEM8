import { describe, expect, it } from "vitest";
import { compareToBenchmark, parseBenchmark, type BenchmarkInput } from "./benchmark";
import { buildPricingRun } from "./build";
import { exampleInputs } from "./providers/mock";
import { CONFIG } from "@/lib/config";

// Test-only benchmark figures. Fictional; not survey data.
const base: BenchmarkInput = {
  source: "Test survey",
  sourceUrl: "https://example.test/survey",
  product: "30yr_fixed",
  productLabel: "30-year fixed",
  weekOf: "2026-10-01",
  rate: "7.5",
  feesAndPoints: "1.2",
  basis: "Test basis.",
};
const run = () => buildPricingRun(exampleInputs("wa-first-purchase")!).run;
const cmp = (b: Partial<BenchmarkInput> = {}, asOf = "2026-10-01") => compareToBenchmark(run(), "lowestRateWithoutRiskyFeatures", { ...base, ...b }, asOf);

describe("RateVsAverage benchmark comparison (v19, Item 3b)", () => {
  it("is off by default and the shipped benchmark is still placeholders", () => {
    expect(CONFIG.pricing.benchmarkComparison.enabled).toBe(false);
    expect(parseBenchmark(CONFIG.pricing.benchmarkComparison.benchmark)).toBeNull();
  });

  it("rejects placeholders, bad dates, bad numbers and non-https sources", () => {
    expect(parseBenchmark({ ...base, rate: "[RATE]" })).toBeNull();
    expect(parseBenchmark({ ...base, weekOf: "Oct 1" })).toBeNull();
    expect(parseBenchmark({ ...base, feesAndPoints: "about 1" })).toBeNull();
    expect(parseBenchmark({ ...base, sourceUrl: "http://example.test" })).toBeNull();
    expect(parseBenchmark({ ...base, basis: "" })).toBeNull();
    expect(parseBenchmark(base)).toMatchObject({ rate: 7.5, feesAndPointsPct: 1.2 });
  });

  it("says below only when the rate is lower and points + origination are no higher", () => {
    const c = cmp()!;
    expect(c.quote.noteRate).toBe(6.25);
    expect(c.examplePointsAndOriginationPct).toBe(1.125);
    expect(c.rateDiff).toBe(-1.25);
    expect(c.below).toBe(true);
  });

  it("a lower rate bought with more points is side by side, not below", () => {
    expect(cmp({ feesAndPoints: "0.9" })!.below).toBe(false);
  });

  it("a higher or equal rate is never below", () => {
    expect(cmp({ rate: "6.25" })!.below).toBe(false);
    expect(cmp({ rate: "6" })!.below).toBe(false);
  });

  it("needs the same week and the same product", () => {
    expect(cmp({ weekOf: "2026-09-24" })).toBeNull();
    expect(cmp({ weekOf: "2026-09-25" })).not.toBeNull();
    expect(cmp({ product: "15yr_fixed" })).toBeNull();
  });

  it("only compares a dated example, never a snapshot", () => {
    const snap = buildPricingRun({ ...exampleInputs("wa-first-purchase")!, mode: "snapshot" }).run;
    expect(compareToBenchmark(snap, "lowestRateWithoutRiskyFeatures", base, "2026-10-01")).toBeNull();
  });
});
