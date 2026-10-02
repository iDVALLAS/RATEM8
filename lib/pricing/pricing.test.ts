import { afterEach, describe, expect, it, vi } from "vitest";
import { computeApr, paymentSchedule, _presentValue } from "./apr";
import { buildPricingRun, serializeRun } from "./build";
import { selectAntiSteering } from "./antiSteering";
import { canonicalJson } from "./canonical";
import { exampleInputs, exampleScenarios, mockProvider } from "./providers/mock";
import { isFresh } from "./providers/manual";
import { screenNote, emptyEntry } from "./playbook";
import { MemoryStore, setStoreForTests } from "./store";
import { listTenants, tenantForState } from "./tenants";
import { LENDERS, publishable } from "./lenders";
import { publishSnapshot, saveSettings } from "./publish";
import { NO_RISKY_FEATURES, type QuoteInput } from "./types";

afterEach(() => {
  setStoreForTests(null);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("APR (actuarial method)", () => {
  it("equals the note rate when there are no prepaid finance charges", () => {
    expect(computeApr(400000, 6.5, 360, 0)).toBe(6.5);
  });
  it("matches an independent reference: $200,000 at 6% for 30 years with $4,000 of finance charges", () => {
    expect(computeApr(200000, 6, 360, 4000)).toBe(6.189);
  });
  it("satisfies the present-value identity", () => {
    const pays = paymentSchedule(300000, 6.25, 360);
    const apr = computeApr(300000, 6.25, 360, 5000);
    expect(Math.abs(_presentValue(pays, apr / 1200) - 295000)).toBeLessThan(25);
  });
  it("rises with fees and handles interest-only schedules", () => {
    expect(computeApr(300000, 6, 360, 6000)).toBeGreaterThan(computeApr(300000, 6, 360, 3000));
    const io = paymentSchedule(300000, 6, 360, 120);
    expect(io[0]).toBeCloseTo(1500, 6);
    expect(io[359]).toBeGreaterThan(io[0]);
  });
});

describe("example pricing (mock provider)", () => {
  it("covers the three required scenarios with 6–10 lenders and 1–2 ineligible each", () => {
    const ids = exampleScenarios().map((s) => s.id);
    expect(ids).toEqual(["bellevue-refi", "wa-first-purchase", "az-purchase"]);
    for (const id of ids) {
      const quotes = exampleInputs(id)!.quotes;
      expect(quotes.length).toBeGreaterThanOrEqual(6);
      expect(quotes.length).toBeLessThanOrEqual(10);
      const bad = quotes.filter((q) => !q.eligible).length;
      expect(bad).toBeGreaterThanOrEqual(1);
      expect(bad).toBeLessThanOrEqual(2);
    }
  });

  it("regenerates byte-identically from stored inputs", async () => {
    for (const s of exampleScenarios()) {
      const a = serializeRun((await mockProvider.priceScenario("example", s))!);
      const stored = JSON.parse(JSON.stringify(exampleInputs(s.id)));
      const b = serializeRun(buildPricingRun(stored).run);
      expect(b).toBe(a);
    }
  });

  it("shows an APR for every eligible rate and none for ineligible results", async () => {
    for (const s of exampleScenarios()) {
      const run = (await mockProvider.priceScenario("example", s))!;
      for (const q of run.quotes) {
        if (q.eligible) {
          expect(q.apr).not.toBeNull();
          expect(q.apr!).toBeGreaterThanOrEqual(q.noteRate!);
        } else {
          expect(q.apr).toBeNull();
          expect(q.ineligibleReason).toBeTruthy();
        }
      }
    }
  });

  it("picks the three safe-harbor options correctly for the Bellevue refinance", () => {
    const { run, mapping } = buildPricingRun(exampleInputs("bellevue-refi")!);
    const keyOf = (label: string | undefined) => (label ? mapping[label] : undefined);
    expect(keyOf(run.selection.lowestRate?.lender)).toBe("ex-06"); // 5.875% interest-only
    expect(keyOf(run.selection.lowestRateWithoutRiskyFeatures?.lender)).toBe("ex-05"); // 6.000%
    expect(keyOf(run.selection.lowestPointsAndOrigination?.lender)).toBe("ex-03"); // credit, lowest rate among $0
    expect(run.selection.meetsCreditorCount).toBe(true);
    expect(run.selection.eligibleCreditors).toBe(7);
  });

  it("never exposes internal lender keys in the public run", () => {
    for (const s of exampleScenarios()) {
      const json = serializeRun(buildPricingRun(exampleInputs(s.id)!).run);
      for (const q of exampleInputs(s.id)!.quotes) expect(json).not.toContain(`"${q.lenderKey}"`);
      expect(json).not.toMatch(/"lenderKey"|"mapping"/);
    }
  });

  it("re-letters lenders per run", () => {
    const a = buildPricingRun(exampleInputs("bellevue-refi")!).mapping;
    const b = buildPricingRun({ ...exampleInputs("bellevue-refi")!, runId: "another-run" }).mapping;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });
});

describe("validation", () => {
  const base = exampleInputs("az-purchase")!;
  it("rejects an eligible quote without a rate and an ineligible one without a reason", () => {
    const bad: QuoteInput[] = [
      { ...base.quotes[0], noteRate: null },
      { ...base.quotes[5], ineligibleReason: "" },
    ];
    expect(() => buildPricingRun({ ...base, quotes: bad })).toThrow(/note rate|need a reason/);
  });
});

describe("playbook notes", () => {
  it("allows notes about a lender's program strengths", () => {
    expect(screenNote("Fast closer, strong on self-employed and bank statement files").ok).toBe(true);
  });
  it("allows notes about the lender itself", () => {
    expect(screenNote("Underwriting turns files in 48 hours; condition lists are short.").ok).toBe(true);
  });
  it("flags each sensitive category", () => {
    for (const t of ["avoid this lender for elderly buyers", "great for young families with kids", "slow in that neighborhood", "they like married couples", "good with Hispanic buyers", "struggles with disability income"]) {
      expect(screenNote(t).ok).toBe(false);
    }
  });
});

describe("tenants and lenders", () => {
  it("derives one tenant per sponsoring brokerage from config", () => {
    const tenants = listTenants();
    expect(tenants.length).toBeGreaterThanOrEqual(1);
    expect(tenantForState("WA")).toBeTruthy();
    expect(tenantForState("AZ")).toBeTruthy();
    for (const t of tenants) expect(t.id.startsWith("brokerage-")).toBe(true);
  });
  it("lists the operator's twelve lenders and blocks the restricted ones until consent", () => {
    expect(LENDERS.length).toBe(12);
    expect(publishable("prmg")).toBe(false);
    expect(publishable("plaza")).toBe(false);
    expect(publishable("homexpress")).toBe(false);
    expect(publishable("uwm")).toBe(true);
  });
});

describe("manual snapshots", () => {
  const q = (lenderKey: string, noteRate: number, pointsPct: number): QuoteInput => ({
    lenderKey, productLabel: "30-year fixed", eligible: true, noteRate, pointsPct,
    originationFee: 0, lenderFees: 1195, lockDays: 30, interestOnlyMonths: 0, features: { ...NO_RISKY_FEATURES },
  });
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

  it("goes stale after the configured window", () => {
    const now = new Date("2026-10-02T15:00:00Z");
    expect(isFresh("2026-10-02T08:00:00Z", now, 24)).toBe(true);
    expect(isFresh("2026-10-01T14:00:00Z", now, 24)).toBe(false);
  });

  it("refuses to publish without a source file, an active lender, or consent", async () => {
    setStoreForTests(new MemoryStore());
    const wa = tenantForState("WA")!;
    await saveSettings({ tenantId: wa.id, activeLenderKeys: ["uwm", "pennymac", "kind", "prmg"], playbook: [], actor: "test" });
    const noSource = await publishSnapshot({ tenantId: wa.id, scenarioId: "bellevue-refi", quotes: [q("uwm", 6.25, 0)], source: null, actor: "test" });
    expect(noSource.ok).toBe(false);
    const inactive = await publishSnapshot({ tenantId: wa.id, scenarioId: "bellevue-refi", quotes: [q("plaza", 6.25, 0)], source: { bytes: png, mime: "image/png" }, actor: "test" });
    expect(inactive.ok).toBe(false);
    const restricted = await publishSnapshot({ tenantId: wa.id, scenarioId: "bellevue-refi", quotes: [q("prmg", 6.25, 0)], source: { bytes: png, mime: "image/png" }, actor: "test" });
    expect(restricted.ok).toBe(false);
  });

  it("publishes, stores the source hash, and writes the audit log", async () => {
    const store = new MemoryStore();
    setStoreForTests(store);
    const wa = tenantForState("WA")!;
    await saveSettings({ tenantId: wa.id, activeLenderKeys: ["uwm", "pennymac", "kind"], playbook: [], actor: "test" });
    const res = await publishSnapshot({ tenantId: wa.id, scenarioId: "bellevue-refi", quotes: [q("uwm", 6.25, 0.25), q("pennymac", 6.125, 0.75), q("kind", 6.375, -0.25)], source: { bytes: png, mime: "image/png" }, actor: "test" });
    expect(res.ok).toBe(true);
    const snap = (await store.latestSnapshot(wa.id, "bellevue-refi"))!;
    expect(snap.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(serializeRun(buildPricingRun(JSON.parse(JSON.stringify(snap.inputs))).run)).toBe(serializeRun(snap.run));
    const actions = (await store.audit()).map((e) => e.action);
    expect(actions).toEqual(["settings.save", "source.put", "snapshot.publish"]);
  });

  it("a second brokerage tenant works with no code changes", async () => {
    const store = new MemoryStore();
    setStoreForTests(store);
    const az = tenantForState("AZ")!;
    const wa = tenantForState("WA")!;
    await saveSettings({ tenantId: az.id, activeLenderKeys: ["uwm", "rise", "newrez"], playbook: [], actor: "test" });
    const res = await publishSnapshot({ tenantId: az.id, scenarioId: "az-purchase", quotes: [q("uwm", 6.5, 0), q("rise", 6.625, -0.25), q("newrez", 6.375, 0.875)], source: { bytes: png, mime: "image/png" }, actor: "test" });
    expect(res.ok).toBe(true);
    if (az.id !== wa.id) {
      const cross = await publishSnapshot({ tenantId: wa.id, scenarioId: "az-purchase", quotes: [q("uwm", 6.5, 0)], source: { bytes: png, mime: "image/png" }, actor: "test" });
      expect(cross.ok).toBe(false);
    }
  });

  it("changing playbook notes cannot change any ranking", async () => {
    vi.stubEnv("PRICING_MANUAL", "true");
    vi.resetModules();
    const storeMod = await import("./store");
    const pub = await import("./publish");
    const disp = await import("./display");
    const ten = await import("./tenants");
    const store = new storeMod.MemoryStore();
    storeMod.setStoreForTests(store);
    const wa = ten.tenantForState("WA")!;
    const keys = ["uwm", "pennymac", "kind", "newrez"];
    await pub.saveSettings({ tenantId: wa.id, activeLenderKeys: keys, playbook: [], actor: "test" });
    await pub.publishSnapshot({ tenantId: wa.id, scenarioId: "bellevue-refi", quotes: [q("uwm", 6.25, 0.25), q("pennymac", 6.125, 0.75), q("kind", 6.375, -0.25), q("newrez", 6.25, 0)], source: { bytes: png, mime: "image/png" }, actor: "test" });
    const before = await disp.resolveDisplay("bellevue-refi");
    expect(before?.mode).toBe("snapshot");
    await pub.saveSettings({
      tenantId: wa.id, activeLenderKeys: keys, actor: "test",
      playbook: keys.map((k, i) => ({ ...emptyEntry(k), turnTimes: i % 2 ? "fast" : "slow", commsQuality: "excellent", note: `Note ${i}: underwriting is quick and condition lists are short.` })),
    });
    const after = await disp.resolveDisplay("bellevue-refi");
    expect(serializeRun(after!.run)).toBe(serializeRun(before!.run));
    expect(after!.run.selection).toEqual(before!.run.selection);
    expect(after!.notes.length).toBe(4);
    for (const n of after!.notes) expect(n.lender).toMatch(/^Lender [A-Z]+$/);
  });

  it("selection is a function of quotes only", () => {
    const { run } = buildPricingRun(exampleInputs("wa-first-purchase")!);
    expect(selectAntiSteering(run.quotes)).toEqual(run.selection);
  });
});
