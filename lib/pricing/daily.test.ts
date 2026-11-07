import { afterEach, describe, expect, it } from "vitest";
import { buildPricingRun } from "./build";
import { DAILY_SCENARIOS, FHA_MIP, matchDaily, pricingScenarios, zipInState, type BorrowerScenario } from "./daily";
import { computeApr } from "./apr";
import { miSchedule, noteAmount, upfrontMi } from "./mi";
import { MemoryStore, NeonStore, setStoreForTests, type SqlQuery } from "./store";
import { publishSnapshot, saveSettings } from "./publish";
import { tenantForState } from "./tenants";
import { NO_RISKY_FEATURES, type QuoteInput, type RunInputs } from "./types";
import { runTool, exampleFromRun } from "@/lib/m8/tools";

const scenario = (id: string) => DAILY_SCENARIOS.find((s) => s.id === id)!;

const quote = (lenderKey: string, noteRate: number, pointsPct: number, extra: Partial<QuoteInput> = {}): QuoteInput => ({
  lenderKey, productLabel: "30-year fixed", eligible: true, noteRate, pointsPct, originationFee: 0, lenderFees: 1195, lockDays: 30,
  interestOnlyMonths: 0, features: NO_RISKY_FEATURES, ...extra,
});

const inputs = (id: string, quotes: QuoteInput[]): RunInputs => ({
  runId: `t-${id}`, tenantId: "t", provider: "manual", mode: "snapshot", scenario: scenario(id), pricedAt: "2026-11-05T16:00:00.000Z", quotes,
});

const borrower = (o: Partial<BorrowerScenario> = {}): BorrowerScenario => ({
  purpose: "purchase", loanAmount: 540000, propertyValue: 675000, creditBand: "740-759", zip: "98072",
  propertyType: "single_family", occupancy: "primary", loanType: "conventional", ...o,
});

afterEach(() => setStoreForTests(null));

describe("daily scenarios (C7)", () => {
  it("are the owner's six, all Washington, all publishable", () => {
    expect(DAILY_SCENARIOS.map((s) => s.id)).toEqual(["wa-daily-purchase-80", "wa-daily-purchase-95", "wa-daily-fha-965", "wa-daily-refi-70", "wa-daily-cashout-80", "wa-daily-nonqm-purchase-80"]);
    for (const s of DAILY_SCENARIOS) {
      expect(s.state).toBe("WA");
      expect(zipInState(s.zip!, "WA")).toBe(true);
      const ltv = (s.loanAmount / s.propertyValue) * 100;
      expect(ltv).toBeGreaterThanOrEqual(s.match.ltvMin);
      expect(ltv).toBeLessThanOrEqual(s.match.ltvMax + 1e-9);
    }
    expect(pricingScenarios().slice(0, DAILY_SCENARIOS.length)).toEqual(DAILY_SCENARIOS);
    // Owner 2026-11-07: every daily scenario assumes DTI under 35%.
    for (const s of DAILY_SCENARIOS) expect(s.assumptions).toContain("Debt-to-income ratio under 35%.");
  });

  it("match a borrower only to a scenario like theirs", () => {
    expect(matchDaily(borrower())?.id).toBe("wa-daily-purchase-80");
    expect(matchDaily(borrower({ loanAmount: 475000, propertyValue: 500000 }))?.id).toBe("wa-daily-purchase-95");
    expect(matchDaily(borrower({ loanType: "fha", creditBand: "680-699", loanAmount: 434250, propertyValue: 450000 }))?.id).toBe("wa-daily-fha-965");
    expect(matchDaily(borrower({ purpose: "rate_term_refinance", creditBand: "760+", loanAmount: 560000, propertyValue: 800000 }))?.id).toBe("wa-daily-refi-70");
    // Weaker credit than the example: no example (it would look better than their pricing).
    expect(matchDaily(borrower({ creditBand: "720-739" }))).toBeNull();
    // Better credit than the example is fine (the example is conservative for them).
    expect(matchDaily(borrower({ creditBand: "760+" }))?.id).toBe("wa-daily-purchase-80");
    // Outside the state, the LTV band, the loan band, or not a primary single-family home.
    expect(matchDaily(borrower({ zip: "97201" }))).toBeNull();
    expect(matchDaily(borrower({ loanAmount: 450000, propertyValue: 500000 }))).toBeNull();
    expect(matchDaily(borrower({ loanAmount: 900000, propertyValue: 1125000 }))).toBeNull();
    expect(matchDaily(borrower({ occupancy: "investment" }))).toBeNull();
    expect(matchDaily(borrower({ propertyType: "condo" }))).toBeNull();
    expect(matchDaily(borrower({ purpose: "cash_out_refinance" }))).toBeNull();
    expect(matchDaily(borrower({ loanType: "va" }))).toBeNull();
  });

  it("C10: Bellevue cash-out at 780 credit, and the non-QM bank-statement purchase", () => {
    const cashOut = { purpose: "cash_out_refinance" as const, loanAmount: 640000, propertyValue: 800000, zip: "98004" };
    expect(matchDaily(borrower({ ...cashOut, creditBand: "780+" }))?.id).toBe("wa-daily-cashout-80");
    // 760–779 (or the old "760+") is weaker than the 780 example: no example.
    expect(matchDaily(borrower({ ...cashOut, creditBand: "760-779" }))).toBeNull();
    expect(matchDaily(borrower({ ...cashOut, creditBand: "760+" }))).toBeNull();
    const nonQm = { loanType: "non_qm_bank_statement", loanAmount: 560000, propertyValue: 700000 };
    expect(matchDaily(borrower({ ...nonQm, creditBand: "720-739" }))?.id).toBe("wa-daily-nonqm-purchase-80");
    expect(matchDaily(borrower({ ...nonQm, creditBand: "700-719" }))).toBeNull();
    // A conventional borrower never sees the non-QM example, and the reverse.
    expect(matchDaily(borrower({ loanAmount: 560000, propertyValue: 700000, creditBand: "740-759" }))?.id).toBe("wa-daily-purchase-80");
    expect(matchDaily(borrower({ ...nonQm, occupancy: "investment" }))).toBeNull();
  });
});

describe("mortgage insurance in the APR (C7)", () => {
  it("PMI raises the APR and stops by schedule at 78% of the original value", () => {
    const s = scenario("wa-daily-purchase-95");
    const mi = miSchedule(s, 6.5, 180);
    expect(mi[0]).toBe(180);
    const last = mi.lastIndexOf(180);
    expect(last).toBeGreaterThan(60);
    expect(last).toBeLessThan(180); // ends well before the midpoint at 6.5%
    expect(mi.slice(last + 1).every((x) => x === 0)).toBe(true);
    const run = buildPricingRun(inputs(s.id, [quote("uwm", 6.5, 0, { monthlyPmi: 180 })])).run;
    const q = run.quotes[0];
    expect(q.monthlyMi).toBe(180);
    expect(q.apr!).toBeGreaterThan(computeApr(475000, 6.5, 360, 1195) + 0.2);
  });

  it("a PMI scenario refuses a snapshot without the monthly PMI", () => {
    expect(() => buildPricingRun(inputs("wa-daily-purchase-95", [quote("uwm", 6.5, 0)]))).toThrow(/monthly PMI/);
  });

  it("FHA finances the upfront premium and counts both premiums", () => {
    const s = scenario("wa-daily-fha-965");
    expect(upfrontMi(s)).toBe(Math.round(434250 * FHA_MIP.upfrontPct) / 100);
    expect(noteAmount(s)).toBe(Math.round((434250 + upfrontMi(s)) * 100) / 100);
    const mi = miSchedule(s, 6.0);
    expect(mi.every((x) => x > 0)).toBe(true); // life of loan above 90% LTV
    expect(mi[0]).toBeGreaterThan(mi[359]); // recalculated on the falling balance
    const q = buildPricingRun(inputs(s.id, [quote("uwm", 6.0, 0)])).run.quotes[0];
    expect(q.apr!).toBeGreaterThan(6.0 + 0.6);
    expect(q.monthlyMi).toBe(mi[0]);
  });

  it("scenarios without MI are unchanged", () => {
    const q = buildPricingRun(inputs("wa-daily-purchase-80", [quote("uwm", 6.25, 0.5)])).run.quotes[0];
    expect(q.monthlyMi).toBeNull();
    expect(q.apr).toBe(computeApr(520000, 6.25, 360, 2600 + 1195));
  });
});

describe("M8's get_pricing returns today's snapshot as a dated example (C7)", () => {
  const wa = tenantForState("WA")!;
  const borrowerInput = { purpose: "purchase", loanAmount: 540000, propertyValue: 675000, creditBand: "740-759", zip: "98072", propertyType: "single_family", occupancy: "primary", loanType: "conventional" };
  const ctx = { sessionId: "00000000-0000-4000-8000-000000000000", mloId: null, mloName: null, state: "Washington", examplesOn: true };

  async function publishToday() {
    setStoreForTests(new MemoryStore());
    await saveSettings({ tenantId: wa.id, activeLenderKeys: ["uwm", "pennymac", "kind", "the-loan-store"], playbook: [], actor: "test" });
    const res = await publishSnapshot({
      tenantId: wa.id, scenarioId: "wa-daily-purchase-80", actor: "test",
      quotes: [quote("uwm", 6.125, 0.75), quote("pennymac", 6.25, 0), quote("kind", 6.375, -0.25), quote("the-loan-store", 6.25, 0.25)],
      source: { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" },
    });
    expect(res.ok).toBe(true);
  }

  it("matches, and returns the three options with lenders by letter and a card", async () => {
    await publishToday();
    const run = await runTool("get_pricing", borrowerInput, ctx);
    const out = JSON.parse(run.content);
    expect(out.status).toBe("ok");
    expect(out.kind).toBe("dated_example");
    expect(out.quotes.map((q: { option: string }) => q.option)).toEqual(["lowest_rate", "lowest_rate_no_risky_features", "lowest_points_and_fees"]);
    for (const q of out.quotes) expect(q.lender).toMatch(/^Lender [A-Z]$/);
    expect(run.content).not.toMatch(/\buwm\b|pennymac|kind lending|loan store|"kind":"(?!dated_example)/i);
    expect(run.card?.options).toHaveLength(3);
    expect(run.card?.assumptions[0]).toBe("Purchase of a home in Washington."); // C11.2: no town or ZIP
  });

  it("says no example when the borrower's scenario isn't close, or the flag is off", async () => {
    await publishToday();
    const far = JSON.parse((await runTool("get_pricing", { ...borrowerInput, creditBand: "700-719" }, ctx)).content);
    expect(far.status).toBe("unavailable");
    const off = JSON.parse((await runTool("get_pricing", borrowerInput, { ...ctx, examplesOn: false })).content);
    expect(off.status).toBe("unavailable");
  });

  it("shows no option set below three eligible lenders", () => {
    const run = buildPricingRun(inputs("wa-daily-purchase-80", [quote("uwm", 6.125, 0), quote("pennymac", 6.25, 0)])).run;
    expect(exampleFromRun(run)).toBeNull();
  });
});

describe("Neon pricing store (C7)", () => {
  it("creates its tables once and writes snapshots insert-only", async () => {
    const calls: string[] = [];
    const q: SqlQuery = async (text) => {
      calls.push(text.split("(")[0].trim());
      return text.startsWith("INSERT INTO pricing_sources") ? [{ sha256: "x" }] : [];
    };
    const store = new NeonStore(q);
    await store.putSource(new Uint8Array([1]), "image/png", "test", "t");
    await store.hasSource("x");
    expect(calls.filter((c) => c.startsWith("CREATE TABLE")).length).toBe(4);
    expect(calls.some((c) => c.startsWith("UPDATE"))).toBe(false);
    expect(calls).toContain("INSERT INTO pricing_audit");
  });
});

describe("the chat turn with a dated example (C7)", () => {
  it("lets the example's rates through with APR and the disclosure, and sends the card after the reply passes", async () => {
    const { fakeClient, chunk } = await import("@/tests/m8-harness");
    const { prepareTurn, runM8Turn } = await import("@/lib/m8/pipeline");
    const wa = tenantForState("WA")!;
    setStoreForTests(new MemoryStore());
    await saveSettings({ tenantId: wa.id, activeLenderKeys: ["uwm", "pennymac", "kind"], playbook: [], actor: "test" });
    await publishSnapshot({
      tenantId: wa.id, scenarioId: "wa-daily-purchase-80", actor: "test",
      quotes: [quote("uwm", 6.125, 0.75), quote("pennymac", 6.25, 0), quote("kind", 6.375, -0.25)],
      source: { bytes: new Uint8Array([9]), mime: "image/png" },
    });
    const input = { purpose: "purchase", loanAmount: 540000, propertyValue: 675000, creditBand: "740-759", zip: "98072", propertyType: "single_family", occupancy: "primary", loanType: "conventional" };
    const ctx = { sessionId: "00000000-0000-4000-8000-000000000000", mloId: null, mloName: null, state: "Washington", examplesOn: true };
    const apr = JSON.parse((await runTool("get_pricing", input, ctx)).content).quotes[0].apr.toFixed(3);
    const good = `Here's today's priced example for a scenario like yours, not your quote: 6.125% rate, ${apr}% APR. It isn't a commitment to lend.`;
    const events: string[] = [];
    const { client } = fakeClient([{ chunks: ["Checking today's example."], tool: { name: "get_pricing", input } }, { chunks: chunk(good) }]);
    const res = await runM8Turn({ client, model: "fake", maxTokens: 800, system: "sys", turn: prepareTurn([{ role: "user", content: "Quote me" }]), tools: ctx, mloName: "a licensed loan officer", emit: (e) => events.push(JSON.stringify(e)), pricingAvailable: true });
    expect(res.guard).toBeNull();
    expect(res.pricing?.options).toHaveLength(3);
    expect(events.at(-1)).toContain('"pricing"');

    // A reply that drops the APR is replaced, and no card is sent.
    const bad: string[] = [];
    const { client: c2 } = fakeClient([{ chunks: ["Checking."], tool: { name: "get_pricing", input } }, { chunks: chunk("Today's example is 6.125%.") }]);
    const res2 = await runM8Turn({ client: c2, model: "fake", maxTokens: 800, system: "sys", turn: prepareTurn([{ role: "user", content: "Quote me" }]), tools: ctx, mloName: "a licensed loan officer", emit: (e) => bad.push(JSON.stringify(e)), pricingAvailable: true });
    expect(res2.guard).toBe("rate-without-apr");
    expect(bad.some((e) => e.includes('"pricing"'))).toBe(false);
  });

  it("drops a browser-sent card before the model or the transcript", async () => {
    const { prepareTurn } = await import("@/lib/m8/pipeline");
    const turn = prepareTurn([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello.", pricing: { title: "x", location: "y", pricedAt: "z", assumptions: [], eligibleCount: 3, options: [] } },
      { role: "user", content: "and?" },
    ]);
    expect(turn.messages.every((m) => Object.keys(m).sort().join() === "content,role")).toBe(true);
  });
});

describe("C11.2: ZIP only matters through loan limits", () => {
  it("examples name no town or ZIP and sit under the all-county limit", async () => {
    const { countyProofLimit } = await import("./loanLimits");
    for (const s of DAILY_SCENARIOS) {
      expect(s.location).toBe("Washington");
      expect(s.assumptions.join(" ")).not.toMatch(/Woodinville|Bellevue|ZIP|\b98\d{3}\b/);
      expect(s.loanAmount).toBeLessThanOrEqual(countyProofLimit(s.match.loanType));
      expect(s.match.loanMax <= countyProofLimit(s.match.loanType) || s.match.loanType === "fha").toBe(true);
    }
  });

  it("any Washington ZIP matches; a loan above the all-county limit doesn't", () => {
    expect(matchDaily(borrower({ zip: "99201" }))?.id).toBe("wa-daily-purchase-80"); // Spokane
    expect(matchDaily(borrower({ zip: "98501" }))?.id).toBe("wa-daily-purchase-80"); // Olympia
    // FHA band runs to $600,000, but above the $541,287 floor the county decides: no example.
    const fha = { loanType: "fha", creditBand: "680-699" };
    expect(matchDaily(borrower({ ...fha, loanAmount: 434250, propertyValue: 450000 }))?.id).toBe("wa-daily-fha-965");
    expect(matchDaily(borrower({ ...fha, loanAmount: 545000, propertyValue: 564767 }))).toBeNull();
  });
});
