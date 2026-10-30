import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { selectAntiSteering } from "./pricing/antiSteering";
import { buildPricingRun } from "./pricing/build";
import { exampleInputs } from "./pricing/providers/mock";
import { LENDERS, lendersFor, offers, publishable } from "./pricing/lenders";

describe("lender counts (v22)", () => {
  it("comes from config: up to 14, never fewer than 3", () => {
    expect(CONFIG.lenderCountMax).toBe(14);
    expect(CONFIG.lenderCountMin).toBe(3);
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
      expect(l.heloc?.creditPull).toMatch(/soft pull until the borrower applies/i);
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
