import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { demoChat } from "./demoChat";
import { selectAntiSteering } from "./pricing/antiSteering";
import { buildPricingRun } from "./pricing/build";
import { exampleInputs } from "./pricing/providers/mock";
import { LENDERS, lendersFor, offers, publishable } from "./pricing/lenders";

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
    // v27: 11 first-mortgage lenders on the 14-lender panel → "8 more shopped".
    expect(demoChat.lendersShopped).toBe(11);
    expect(demoChat.lendersShopped - demoChat.rateOptions.length).toBe(8);
  });

  it("an option set with fewer than the minimum eligible lenders does not meet the count", () => {
    const inputs = exampleInputs("wa-first-purchase")!;
    const run = buildPricingRun({ ...inputs, quotes: inputs.quotes.filter((q) => q.eligible).slice(0, 2) }).run;
    expect(run.selection.eligibleCreditors).toBe(2);
    expect(run.selection.meetsCreditorCount).toBe(false);
    expect(selectAntiSteering(run.quotes).meetsCreditorCount).toBe(false);
  });
});

describe("the panel (v27)", () => {
  it("is the owner's 14 lenders, which is the 'up to' count", () => {
    expect(LENDERS.map((l) => l.key).sort()).toEqual(
      ["aven", "freedom", "helix", "kind", "nations-direct", "newrez", "nftydoor", "pennymac", "prmg", "remn", "rise", "rocket-pro", "the-loan-store", "uwm"],
    );
    expect(LENDERS.length).toBe(CONFIG.lenderCountMax);
  });

  it("records Aven, HELIX and NFTYDoor as automated HELOC-only programs (one bureau, Plaid income)", () => {
    for (const k of ["aven", "helix", "nftydoor"]) {
      const l = LENDERS.find((x) => x.key === k)!;
      expect(l.products).toEqual(["heloc"]);
      expect(l.heloc?.automated).toBe(true);
      expect(l.heloc?.creditPull).toMatch(/one credit bureau/i);
      expect(l.heloc?.income).toMatch(/plaid/i);
      expect(offers(k, "first_mortgage")).toBe(false);
    }
    expect(lendersFor("first_mortgage")).toHaveLength(11);
  });

  it("keeps unreviewed lenders unpublishable until reviewed or consented", () => {
    for (const k of ["rocket-pro", "nations-direct", "aven", "helix", "nftydoor"]) expect(publishable(k)).toBe(false);
    expect(publishable("prmg")).toBe(false);
    expect(publishable("uwm")).toBe(true);
  });
});
