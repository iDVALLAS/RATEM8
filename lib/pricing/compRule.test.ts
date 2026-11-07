import { describe, expect, it } from "vitest";
import { DEFAULT_COMP_RULE, checkRule, linesFor, lowestRateLine, noPointsLine, normalizeRule, quotesFromGrids, type LenderProduct } from "./compRule";
import { buildPricingRun } from "./build";
import { quoteForPick } from "./antiSteering";
import { DAILY_SCENARIOS } from "./daily";

const grid = (rows: number[][]) => rows.map(([rate, price]) => ({ rate, price }));

/** The owner's LoanSifter grids, $520,000 purchase, 20% down, 11/4/2026 (borrower-paid pricing). */
const kind: LenderProduct = {
  lenderKey: "kind", productLabel: "FNMA Conforming 30 Yr Fixed", lenderFees: 0, lockDays: 30,
  grid: grid([[6.25, 97.715], [6.375, 98.297], [6.5, 98.823], [6.625, 99.467], [6.75, 99.859], [6.875, 100.316], [6.99, 100.652], [7.0, 100.745], [7.125, 101.159], [7.25, 101.466], [7.375, 101.825], [7.5, 102.236]]),
};
const rocket: LenderProduct = {
  lenderKey: "rocket-pro", productLabel: "Conventional 30 Yr Fixed LP", lenderFees: 0, lockDays: 30,
  grid: grid([[5.75, 95.09], [6.25, 97.642], [6.5, 98.772], [6.625, 99.263], [6.75, 99.749], [6.875, 100.204], [6.99, 100.614], [7.125, 101.067], [7.25, 101.375], [7.375, 101.748], [7.5, 102.084]]),
};
const LOAN = 520000;

describe("the loan officer's rate rule (C8)", () => {
  it("keeps the compensation at 1.7% on every line: points = $8,840 − rebate", () => {
    const k = linesFor(kind, LOAN, DEFAULT_COMP_RULE);
    expect(k.find((l) => l.rate === 6.875)!.pointsDollars).toBeCloseTo(7196.8, 1); // owner: "around $7,500"
    expect(k.find((l) => l.rate === 7.125)!.pointsDollars).toBeCloseTo(2813.2, 1);
    expect(linesFor(rocket, LOAN, DEFAULT_COMP_RULE).find((l) => l.rate === 7.375)!.pointsDollars).toBeCloseTo(-249.6, 1); // a $250 credit
  });

  it("lowest rate within the 1.5% points cap, and lowest rate with no points", () => {
    expect(lowestRateLine(kind, LOAN, DEFAULT_COMP_RULE)!.rate).toBe(6.875); // 6.75% would be $9,573 (1.84%)
    expect(noPointsLine(rocket, LOAN, DEFAULT_COMP_RULE)!.rate).toBe(7.375); // owner's "Rocket at no points"
    expect(lowestRateLine(kind, LOAN, { ...DEFAULT_COMP_RULE, maxPointsPct: 2 })!.rate).toBe(6.75);
  });

  it("builds a run whose options match the owner's screenshots", () => {
    const s = DAILY_SCENARIOS.find((x) => x.id === "wa-daily-purchase-80")!;
    const quotes = quotesFromGrids([kind, rocket], LOAN);
    expect(quotes).toHaveLength(4); // two lines per lender
    const { run, mapping } = buildPricingRun({ runId: "t", tenantId: "t", provider: "manual", mode: "snapshot", scenario: s, pricedAt: "2026-11-05T16:00:00.000Z", quotes });
    const lowest = quoteForPick(run.quotes, run.selection.lowestRate)!;
    expect(lowest.noteRate).toBe(6.875);
    expect(mapping[lowest.lender]).toBe("kind"); // Kind's $7,197 beats Rocket's $7,779 at 6.875%
    expect(lowest.pointsDollars).toBeCloseTo(7196.8, 0);
    const cheapest = quoteForPick(run.quotes, run.selection.lowestPointsAndOrigination)!;
    expect(cheapest.noteRate).toBe(7.375);
    expect(cheapest.pointsAndOriginationDollars).toBe(0);
    expect(lowest.apr!).toBeGreaterThan(6.875); // the points are in the APR
  });

  it("skips a lender with no line inside the cap and none without points", () => {
    const short: LenderProduct = { ...kind, lenderKey: "pennymac", grid: grid([[6.5, 97.0]]) };
    expect(quotesFromGrids([short], LOAN)).toEqual([]);
  });

  it("validates the rule and reads older saves", () => {
    expect(checkRule(DEFAULT_COMP_RULE)).toEqual([]);
    expect(checkRule({ targetPct: 9, maxPointsPct: 4 })).toHaveLength(2);
    expect(normalizeRule({ targetPct: 1.8 })).toEqual({ targetPct: 1.8, maxPointsPct: 1.5 });
    expect(normalizeRule(undefined)).toEqual(DEFAULT_COMP_RULE);
  });
});

describe("the rate rule is saved with the lender settings (C8)", () => {
  it("defaults to 1.7% and a 1.5% cap, keeps the last one, and refuses nonsense", async () => {
    const { MemoryStore, setStoreForTests } = await import("./store");
    const { saveSettings } = await import("./publish");
    const { tenantForState } = await import("./tenants");
    setStoreForTests(new MemoryStore());
    const wa = tenantForState("WA")!.id;
    const lenders = ["uwm", "kind", "pennymac"];
    const a = await saveSettings({ tenantId: wa, activeLenderKeys: lenders, playbook: [], actor: "t" });
    expect(a.ok && a.settings.comp).toEqual(DEFAULT_COMP_RULE);
    const b = await saveSettings({ tenantId: wa, activeLenderKeys: lenders, playbook: [], actor: "t", comp: { targetPct: 1.8, maxPointsPct: 1.25 } });
    expect(b.ok && b.settings.comp).toEqual({ targetPct: 1.8, maxPointsPct: 1.25 });
    const c = await saveSettings({ tenantId: wa, activeLenderKeys: lenders, playbook: [], actor: "t" });
    expect(c.ok && c.settings.comp).toEqual({ targetPct: 1.8, maxPointsPct: 1.25 });
    const d = await saveSettings({ tenantId: wa, activeLenderKeys: lenders, playbook: [], actor: "t", comp: { targetPct: 12, maxPointsPct: 0 } });
    expect(d.ok).toBe(false);
    setStoreForTests(null);
  });
});
