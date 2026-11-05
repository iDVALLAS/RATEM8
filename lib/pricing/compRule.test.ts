import { describe, expect, it } from "vitest";
import { DEFAULT_COMP_RULE, checkRule, pickRate, quotesFromGrids, type LenderProduct } from "./compRule";
import { buildPricingRun } from "./build";
import { DAILY_SCENARIOS } from "./daily";

/** The owner's LoanSifter grid: Kind Lending NDC, FNMA 30-year fixed, $520,000 purchase, 11/4/2026. */
const kindGrid = [
  [6.25, 97.715], [6.375, 98.297], [6.5, 98.823], [6.625, 99.467], [6.75, 99.859], [6.875, 100.316],
  [6.99, 100.652], [7.0, 100.745], [7.125, 101.159], [7.25, 101.466], [7.375, 101.825], [7.5, 102.236],
].map(([rate, price]) => ({ rate, price }));

const kind: LenderProduct = { lenderKey: "kind", productLabel: "FNMA Conforming 30 Yr Fixed", channel: "ndc", lenderFees: 0, lockDays: 30, grid: kindGrid };

describe("the loan officer's rate rule (C8)", () => {
  it("picks 7.125% with $3,000 origination on the owner's Kind example", () => {
    const q = pickRate(kind, 520000, DEFAULT_COMP_RULE)!;
    expect(q.noteRate).toBe(7.125);
    expect(q.originationFee).toBe(3000);
    expect(q.pointsPct).toBe(0);
    // 1.7% of $520,000 = $8,840; $3,000 origination + 1.159% rebate ($6,027) = $9,027.
    expect(3000 + 0.01159 * 520000).toBeGreaterThanOrEqual(8840);
  });

  it("a strict 2% target moves to 7.25%, and no origination needs the rebate alone", () => {
    expect(pickRate(kind, 520000, { targetPct: 2, originationFee: 3000 })!.noteRate).toBe(7.25);
    expect(pickRate(kind, 520000, { targetPct: 1.7, originationFee: 0 })!.noteRate).toBe(7.375);
  });

  it("counts the origination in the APR", () => {
    const s = DAILY_SCENARIOS.find((x) => x.id === "wa-daily-purchase-80")!;
    const q = pickRate(kind, s.loanAmount, DEFAULT_COMP_RULE)!;
    const run = buildPricingRun({ runId: "t", tenantId: "t", provider: "manual", mode: "snapshot", scenario: s, pricedAt: "2026-11-05T16:00:00.000Z", quotes: [q] }).run;
    expect(run.quotes[0].apr!).toBeGreaterThan(7.125);
    expect(run.quotes[0].pointsAndOriginationDollars).toBe(3000);
  });

  it("wholesale (lender-paid): lowest rate with no borrower points, no origination", () => {
    const q = pickRate({ ...kind, lenderKey: "uwm", channel: "wholesale", lenderFees: 1368, grid: [{ rate: 6.875, price: 98.6 }, { rate: 7.25, price: 99.9 }, { rate: 7.375, price: 100.2 }] }, 520000, DEFAULT_COMP_RULE)!;
    expect(q.noteRate).toBe(7.375);
    expect(q.originationFee).toBe(0);
  });

  it("keeps one line per lender, and skips a product whose grid can't reach the target", () => {
    const fhlmc: LenderProduct = { ...kind, productLabel: "FHLMC 30 Yr Fixed", grid: kindGrid.map((g) => ({ ...g, price: g.price + 0.4 })) };
    const short: LenderProduct = { ...kind, lenderKey: "pennymac", grid: [{ rate: 6.5, price: 99.0 }] };
    const out = quotesFromGrids([kind, fhlmc, short], 520000);
    expect(out).toHaveLength(1);
    expect(out[0].productLabel).toBe("FHLMC 30 Yr Fixed");
    expect(out[0].noteRate).toBe(7.0); // 100.745 + 0.4 = 101.145: a 1.145% rebate covers the 1.123% needed
  });

  it("rejects an unreasonable rule", () => {
    expect(checkRule(DEFAULT_COMP_RULE)).toEqual([]);
    expect(checkRule({ targetPct: 9, originationFee: -1 })).toHaveLength(2);
  });
});

describe("the rate rule is saved with the lender settings (C8)", () => {
  it("defaults to 1.7% and $3,000, keeps the last one, and refuses nonsense", async () => {
    const { MemoryStore, setStoreForTests } = await import("./store");
    const { saveSettings } = await import("./publish");
    const { tenantForState } = await import("./tenants");
    setStoreForTests(new MemoryStore());
    const wa = tenantForState("WA")!.id;
    const a = await saveSettings({ tenantId: wa, activeLenderKeys: ["uwm", "kind", "pennymac"], playbook: [], actor: "t" });
    expect(a.ok && a.settings.comp).toEqual(DEFAULT_COMP_RULE);
    const b = await saveSettings({ tenantId: wa, activeLenderKeys: ["uwm", "kind", "pennymac"], playbook: [], actor: "t", comp: { targetPct: 1.8, originationFee: 2500 } });
    expect(b.ok && b.settings.comp).toEqual({ targetPct: 1.8, originationFee: 2500 });
    const c = await saveSettings({ tenantId: wa, activeLenderKeys: ["uwm", "kind", "pennymac"], playbook: [], actor: "t" });
    expect(c.ok && c.settings.comp).toEqual({ targetPct: 1.8, originationFee: 2500 });
    const d = await saveSettings({ tenantId: wa, activeLenderKeys: ["uwm"], playbook: [], actor: "t", comp: { targetPct: 12, originationFee: 0 } });
    expect(d.ok).toBe(false);
    setStoreForTests(null);
  });
});
