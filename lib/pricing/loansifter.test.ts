import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { channelOf, investorKey, matchScenario, parseCapture, productsFromCapture, type LoanSifterCapture } from "./loansifter";
import { DEFAULT_COMP_RULE, lowestRateLine, noPointsLine } from "./compRule";
import { DAILY_SCENARIOS } from "./daily";
import { BOOKMARKLET_SOURCE, bookmarkletUrl } from "./loansifterBookmarklet";

/** The bookmarklet's output on the owner's 2026-11-06 results page (Kind, Rocket and UWM grids open). */
const TEXT = readFileSync(new URL("../../fixtures/pricing/loansifter-capture.sample.json", import.meta.url), "utf8");
const capture = (): LoanSifterCapture => {
  const r = parseCapture(TEXT);
  if (!r.ok) throw new Error(r.errors.join(" "));
  return r.capture;
};
const LOAN = 520000;
const all = () => null;

describe("LoanSifter capture (Send to LoanM8)", () => {
  it("reads the capture and finds the daily scenario it was run for", () => {
    const c = capture();
    expect(c.products).toHaveLength(53);
    expect(matchScenario(c, DAILY_SCENARIOS)?.id).toBe("wa-daily-purchase-80");
    expect(parseCapture("hello").ok).toBe(false);
    expect(parseCapture(JSON.stringify({ kind: "loansifter-capture", v: 1 })).ok).toBe(false);
  });

  it("C10: tells the new scenarios apart by purpose and amount", () => {
    const c = capture();
    const at = (summary: Partial<LoanSifterCapture["summary"]>) => matchScenario({ ...c, summary: { ...c.summary, ...summary } }, DAILY_SCENARIOS)?.id;
    expect(at({ loanPurpose: "Cash-Out Refinance", totalLoanAmount: 640000, propertyValue: 800000 })).toBe("wa-daily-cashout-80");
    expect(at({ loanPurpose: "Refinance", totalLoanAmount: 640000, propertyValue: 800000 })).toBeUndefined();
    expect(at({ loanType: "Non-QM", totalLoanAmount: 560000, propertyValue: 700000 })).toBe("wa-daily-nonqm-purchase-80");
    expect(at({ loanType: "Conventional", totalLoanAmount: 560000, propertyValue: 700000 })).toBe("wa-daily-nonqm-purchase-80");
  });

  it("C10: the non-QM scenario keeps bank-statement products and drops interest-only and DSCR", () => {
    const c = capture();
    const grid = [{ rate: 7.5, price: 99, lenderFees: 1000 }];
    const p = (product: string) => ({ ...c.products[0], investor: "United Wholesale Mortgage, LLC", product, grid });
    const nq = { ...c, products: [p("Bank Statement 12 Mo 30 Yr Fixed"), p("Bank Statement 30 Yr Fixed Interest Only"), p("DSCR 30 Yr Fixed")] };
    const { products, skipped } = productsFromCapture(nq, all, "non_qm");
    expect(products.map((x) => x.productLabel)).toEqual(["Bank Statement 12 Mo 30 Yr Fixed"]);
    expect(skipped).toHaveLength(2);
    // The same products are all off-scenario for a conforming scenario.
    expect(productsFromCapture(nq, all).products).toHaveLength(0);
  });

  it("maps investor names to panel lenders, whatever the channel", () => {
    expect(investorKey("Kind Lending, LLC Non-Delegated")).toBe("kind");
    expect(investorKey("Kind Lending, LLC Wholesale")).toBe("kind");
    expect(investorKey("United Wholesale Mortgage, LLC")).toBe("uwm");
    expect(investorKey("Rocket Pro Non-Delegated")).toBe("rocket-pro");
    expect(investorKey("Newrez LLC Mini-Correspondent")).toBe("newrez");
    expect(investorKey("REMN Wholesale")).toBe("remn");
    expect(investorKey("Averra Wholesale")).toBe("the-loan-store");
    expect(investorKey("Averra Non-Delegated")).toBe("the-loan-store");
    expect(investorKey("PRMG Wholesale")).toBe("prmg");
    expect(investorKey("NexBank Non-Delegated")).toBeNull();
    expect(channelOf("Newrez LLC Mini-Correspondent")).toBe("Mini-Correspondent");
    expect(channelOf("United Wholesale Mortgage, LLC")).toBe("");
  });

  it("adds wholesale LO comp back so every channel is borrower-paid", () => {
    const { products } = productsFromCapture(capture(), all);
    const uwm = products.find((p) => p.productLabel === "Conforming Elite 30 Yr Fixed - Plus CYP")!;
    expect(uwm.grid.find((g) => g.rate === 6.75)!.price).toBeCloseTo(99.63, 3); // 98.130 + 1.500
    expect(uwm.lenderFees).toBe(1368);
    const kind = products.find((p) => p.productLabel === "FNMA Conforming 30 Yr Fixed (Non-Delegated)" && p.lenderKey === "kind")!;
    expect(kind.grid.find((g) => g.rate === 6.875)!.price).toBe(100.543); // no comp column
    expect(kind.lenderFees).toBe(0);
  });

  it("applies the 1.7% rule to the captured grids", () => {
    const { products } = productsFromCapture(capture(), all);
    const kind = products.find((p) => p.lenderKey === "kind" && p.grid.length > 1)!;
    expect(lowestRateLine(kind, LOAN, DEFAULT_COMP_RULE)!.rate).toBe(6.875); // $8,840 − $2,824 = $6,016 (1.16%)
    expect(noPointsLine(kind, LOAN, DEFAULT_COMP_RULE)!.rate).toBe(7.375); // rebate $9,610 covers it
    const uwm = products.find((p) => p.lenderKey === "uwm" && p.grid.length > 1)!;
    expect(lowestRateLine(uwm, LOAN, DEFAULT_COMP_RULE)!.rate).toBe(6.875);
    expect(noPointsLine(uwm, LOAN, DEFAULT_COMP_RULE)!.rate).toBe(7.375);
  });

  it("skips lenders off the panel, blocked lenders and non-conforming products, with reasons", () => {
    const { products, skipped, withoutGrid } = productsFromCapture(capture(), (k) => (k === "prmg" ? "restricted" : null));
    expect(products.some((p) => /jumbo/i.test(p.productLabel))).toBe(false);
    expect(skipped.find((s) => s.investor.startsWith("NexBank"))!.reason).toBe("not on your lender panel");
    expect(skipped.find((s) => s.investor === "PRMG Wholesale")!.reason).toBe("restricted");
    expect(skipped.find((s) => /Jumbo Yellow/.test(s.product))!.reason).toMatch(/conforming/);
    expect(withoutGrid).toBeGreaterThan(0);
  });

  it("the bookmarklet is plain JavaScript that sends nothing over the network", () => {
    expect(() => new Function(BOOKMARKLET_SOURCE)).not.toThrow();
    expect(bookmarkletUrl().startsWith("javascript:")).toBe(true);
    // Regression (2026-11-06): in a plain template literal "\s" became "s", so every
    // "s" on the page turned into a space ("Purchase" → "Purcha e").
    expect(BOOKMARKLET_SOURCE).toContain(String.raw`.replace(/\s+/g, " ")`);
    expect(BOOKMARKLET_SOURCE).toContain(String.raw`/[$,%()\s]/g`);
    expect(BOOKMARKLET_SOURCE).not.toMatch(/replace\(\/s\+\//);
    expect(BOOKMARKLET_SOURCE).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|\.src\s*=|password|cookie|localStorage/i);
  });
});

describe("importLoanSifter publishes a snapshot from a capture", () => {
  /** The sample with Freedom and REMN grids opened too (their headline rows scaled into a grid). */
  const richer = (): string => {
    const c = JSON.parse(TEXT) as LoanSifterCapture;
    const kindGrid = c.products.find((p) => p.investor.startsWith("Kind") && p.grid.length)!.grid;
    for (const p of c.products) {
      if (!p.grid.length && /^(Freedom|REMN)/.test(p.investor)) p.grid = kindGrid.map((g) => ({ ...g, price: g.price - 2, lenderFees: p.lenderFees }));
    }
    return JSON.stringify(c);
  };

  it("publishes the three options at the capture time, with the capture as the source", async () => {
    const { MemoryStore, setStoreForTests, getStore } = await import("./store");
    const { importLoanSifter, saveSettings } = await import("./publish");
    const { tenantForState } = await import("./tenants");
    setStoreForTests(new MemoryStore());
    const wa = tenantForState("WA")!.id;
    await saveSettings({ tenantId: wa, activeLenderKeys: ["uwm", "kind", "freedom", "remn", "prmg", "rocket-pro"], playbook: [], actor: "t" });
    const text = richer();
    const capturedAt = (JSON.parse(text) as LoanSifterCapture).capturedAt;
    const now = new Date(Date.parse(capturedAt) + 60_000);

    const res = await importLoanSifter({ tenantId: wa, captureText: text, actor: "t", now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scenarioId).toBe("wa-daily-purchase-80");
    expect(res.lenders.sort()).toEqual(["freedom", "kind", "remn", "uwm"]);
    expect(res.skipped.find((s) => s.investor.startsWith("Rocket"))!.reason).toMatch(/reviewed/);
    expect(res.skipped.find((s) => s.investor.startsWith("PRMG"))!.reason).toMatch(/restrict/);
    const snap = (await getStore().listSnapshots(wa, "wa-daily-purchase-80"))[0];
    expect(snap.run.pricedAt).toBe(new Date(capturedAt).toISOString());
    expect(snap.sourceMime).toBe("application/json");

    const old = await importLoanSifter({ tenantId: wa, captureText: text, actor: "t", now: new Date(Date.parse(capturedAt) + 7 * 3_600_000) });
    expect(old.ok).toBe(false);
    setStoreForTests(null);
  });

  it("refuses when fewer than three lenders fit the rule, and says why", async () => {
    const { MemoryStore, setStoreForTests } = await import("./store");
    const { importLoanSifter, saveSettings } = await import("./publish");
    const { tenantForState } = await import("./tenants");
    setStoreForTests(new MemoryStore());
    const wa = tenantForState("WA")!.id;
    await saveSettings({ tenantId: wa, activeLenderKeys: ["uwm", "kind", "freedom"], playbook: [], actor: "t" });
    const capturedAt = capture().capturedAt;
    const res = await importLoanSifter({ tenantId: wa, captureText: TEXT, actor: "t", now: new Date(Date.parse(capturedAt) + 60_000) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(" ")).toMatch(/grid wasn't open/);
    setStoreForTests(null);
  });
});
