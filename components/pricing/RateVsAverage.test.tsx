import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RateVsAverage, { RateVsAverageView, resolveRateVsAverage } from "./RateVsAverage";
import { compareToBenchmark, type BenchmarkInput } from "@/lib/pricing/benchmark";
import { buildPricingRun } from "@/lib/pricing/build";
import { exampleInputs } from "@/lib/pricing/providers/mock";

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
const view = (b: Partial<BenchmarkInput> = {}) => {
  const c = compareToBenchmark(buildPricingRun(exampleInputs("wa-first-purchase")!).run, "lowestRateWithoutRiskyFeatures", { ...base, ...b }, "2026-10-01")!;
  return renderToStaticMarkup(<RateVsAverageView cmp={c} />);
};

describe("RateVsAverage (v19, Item 3b)", () => {
  it("renders nothing by default (flag off, benchmark placeholders)", async () => {
    expect(await resolveRateVsAverage()).toBeNull();
    expect(await RateVsAverage()).toBeNull();
  });

  it("shows both rates, both cost figures, both dates and the footnote", () => {
    const html = view();
    expect(html).toContain("6.250%");
    expect(html).toContain("7.50%");
    expect(html).toContain("1.125%");
    expect(html).toContain("1.20%");
    expect(html).toContain("October 1, 2026");
    expect(html).toContain("week of October 1, 2026");
    expect(html).toContain("What this comparison assumes");
    expect(html).toContain("Test basis.");
    expect(html).toContain("not a quote");
    expect(html).toContain('href="https://example.test/survey"');
  });

  it("uses the below heading only when computed, otherwise a neutral one", () => {
    expect(view()).toContain("priced below the national average");
    const side = view({ feesAndPoints: "0.9" });
    expect(side).not.toContain("below the national average");
    expect(side).toContain("next to the national average");
  });
});
