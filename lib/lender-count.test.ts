import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { demoChat } from "./demoChat";
import { selectAntiSteering } from "./pricing/antiSteering";
import { buildPricingRun } from "./pricing/build";
import { exampleInputs } from "./pricing/providers/mock";

describe("lender counts (v22)", () => {
  it("comes from config: up to 14, never fewer than 3", () => {
    expect(CONFIG.lenderCountMax).toBe(14);
    expect(CONFIG.lenderCountMin).toBe(3);
  });

  it("the demo says 'up to', never a fixed panel size", () => {
    const line = demoChat.m8Code.find((m) => m.n === "03")!.text;
    expect(line).toContain(`up to ${CONFIG.lenderCountMax} lenders`);
    expect(JSON.stringify(demoChat)).not.toMatch(/\b\d+-lender\b/);
  });

  it("the demo's option set has at least the minimum, and 'N more shopped' is real for the scenario", () => {
    expect(new Set(demoChat.rateOptions.map((r) => r.lender)).size).toBeGreaterThanOrEqual(CONFIG.lenderCountMin);
    expect(demoChat.lendersShopped).toBeLessThanOrEqual(CONFIG.lenderCountMax);
    expect(demoChat.lendersShopped - demoChat.rateOptions.length).toBe(11);
  });

  it("an option set with fewer than the minimum eligible lenders does not meet the count", () => {
    const inputs = exampleInputs("wa-first-purchase")!;
    const run = buildPricingRun({ ...inputs, quotes: inputs.quotes.filter((q) => q.eligible).slice(0, 2) }).run;
    expect(run.selection.eligibleCreditors).toBe(2);
    expect(run.selection.meetsCreditorCount).toBe(false);
    expect(selectAntiSteering(run.quotes).meetsCreditorCount).toBe(false);
  });
});
