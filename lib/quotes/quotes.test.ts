import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PERSONAL_QUOTES = "true";
  process.env.PRICING_WEEKLY = "true";
  process.env.POSTED_RATES = "true";
});

import { CONFIG, mloById } from "@/lib/config";
import { MemoryRecords, setRecordsForTests } from "@/lib/records";
import { gridScenarios } from "@/lib/pricing/grid";
import { buildPostedWeek, currentPostedWeek, pacific, postedRateFor, savePostedWeek, weekWindow, withdrawPostedWeek, isThursday } from "@/lib/pricing/posted-rate";
import { publishSnapshot, saveSettings } from "@/lib/pricing/publish";
import { resolveGrid } from "@/lib/pricing/display";
import { MemoryStore, RecordSnapshotStore, setStoreForTests } from "@/lib/pricing/store";
import { tenantForState } from "@/lib/pricing/tenants";
import { NO_RISKY_FEATURES, type QuoteInput } from "@/lib/pricing/types";
import { answerStep, currentStep, parseAmount, reopen, toScenario, type Answers } from "./flow";
import { nearestScenario } from "./nearest";
import { stateForZip, type QuoteScenario } from "./scenario";
import { approvalBlocker, approveQuote, createQuote, disclaimerFor, estimateKey, keyValid, priceQuote, rejectQuote } from "./service";
import { listQuotes, loadQuote, maskEmail } from "./store";
import { optionsOf } from "./public";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const q = (lenderKey: string, rate: number, points: number): QuoteInput => ({
  lenderKey, productLabel: "30-year fixed", eligible: true, noteRate: rate, pointsPct: points, originationFee: 0, lenderFees: 1700, lockDays: 30, interestOnlyMonths: 0, features: NO_RISKY_FEATURES,
});
const base: QuoteScenario = { purpose: "purchase", loanType: "conventional", term: "30", price: 520000, down: 52000, creditBand: "740-759", zip: "98052", propertyType: "single_family", occupancy: "primary" };

let records: MemoryRecords;
beforeEach(async () => {
  records = new MemoryRecords();
  setRecordsForTests(records);
  setStoreForTests(new MemoryStore());
  for (const st of ["WA", "OR"] as const) {
    await saveSettings({ tenantId: tenantForState(st)!.id, activeLenderKeys: ["uwm", "pennymac", "kind", "prmg"], playbook: [], actor: "test" });
  }
});
afterEach(() => {
  setRecordsForTests(null);
  setStoreForTests(null);
});

describe("posted rates", () => {
  it("subtracts the margin and rounds down to the eighth", () => {
    expect(postedRateFor(6.17)).toBe(5.875);
    expect(postedRateFor(6.25)).toBe(6);
    expect(postedRateFor(6.0)).toBe(5.75);
    expect(postedRateFor(5.37)).toBe(5.0);
    expect(() => postedRateFor(0.5)).toThrow();
  });

  it("runs from Thursday 9 AM PT to the next Wednesday 11:59 PM PT, across the DST change", () => {
    expect(isThursday("2026-10-29")).toBe(true);
    expect(isThursday("2026-10-30")).toBe(false);
    const w = weekWindow("2026-10-29");
    expect(w.releasedAt).toBe("2026-10-29T16:00:00.000Z"); // PDT
    expect(w.honorUntil).toBe("2026-11-05T07:59:59.000Z"); // PST
    expect(pacific("2026-01-15", 9, 0).toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("needs the honor confirmation and a Thursday", () => {
    const now = new Date("2026-10-29T22:00:00Z");
    expect(buildPostedWeek({ weekOf: "2026-10-29", pmms30: 6.17, pmms15: 5.41, confirmed: false, actor: "t", now }).ok).toBe(false);
    expect(buildPostedWeek({ weekOf: "2026-10-30", pmms30: 6.17, pmms15: 5.41, confirmed: true, actor: "t", now }).ok).toBe(false);
    const ok = buildPostedWeek({ weekOf: "2026-10-29", pmms30: 6.17, pmms15: 5.41, confirmed: true, actor: "t", now });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.week.lines.map((l) => l.rate)).toEqual([5.875, 5.125]);
      for (const l of ok.week.lines) expect(l.apr).toBeGreaterThan(l.rate);
      expect(ok.week.financeCharges).toBe(CONFIG.pricing.fees.underwriting + CONFIG.pricing.fees.processing);
    }
  });

  it("shows only inside the window and disappears when withdrawn", async () => {
    const now = new Date("2026-10-29T22:00:00Z");
    const b = buildPostedWeek({ weekOf: "2026-10-29", pmms30: 6.17, pmms15: 5.41, confirmed: true, actor: "t", now });
    if (!b.ok) throw new Error("build failed");
    await savePostedWeek(b.week, records);
    expect((await currentPostedWeek(now, records))?.weekOf).toBe("2026-10-29");
    expect(await currentPostedWeek(new Date("2026-11-05T08:00:01Z"), records)).toBeNull();
    expect(await withdrawPostedWeek("2026-10-29", "t", records, new Date("2026-10-30T00:00:00Z"))).toBe(true);
    expect(await currentPostedWeek(new Date("2026-10-30T01:00:00Z"), records)).toBeNull();
  });
});

describe("weekly grid", () => {
  it("has the six owner-approved rows at $400,000 and ZIP 98033", () => {
    const g = gridScenarios();
    expect(g.map((s) => [s.program, s.downPct, s.creditScore])).toEqual([
      ["conventional", 20, 740], ["conventional", 10, 700], ["conventional", 5, 680], ["fha", 3.5, 680], ["va", 0, 720], ["conventional", 30, 760],
    ]);
    for (const s of g) {
      expect(s.propertyValue).toBe(400000);
      expect(s.zip).toBe("98033");
    }
  });

  it("publishes through the record store and hides after a week", async () => {
    setStoreForTests(new RecordSnapshotStore(records));
    const wa = tenantForState("WA")!;
    await saveSettings({ tenantId: wa.id, activeLenderKeys: ["uwm", "pennymac", "kind"], playbook: [], actor: "test" });
    const id = gridScenarios()[0].id;
    const now = new Date("2026-10-29T22:00:00Z");
    const res = await publishSnapshot({ tenantId: wa.id, scenarioId: id, quotes: [q("uwm", 6.25, 0), q("pennymac", 6.125, 0.5), q("kind", 6.375, -0.25)], source: { bytes: png, mime: "image/png" }, actor: "test", now });
    expect(res.ok).toBe(true);
    const shown = await resolveGrid(id, new Date("2026-10-30T12:00:00Z"));
    expect(shown?.run.quotes.map((x) => x.lender).sort()).toEqual(["Lender 1", "Lender 2", "Lender 3"]);
    expect(optionsOf(shown!.run)).toHaveLength(3);
    expect(await resolveGrid(id, new Date("2026-11-06T00:00:00Z"))).toBeNull();
  });
});

describe("scenario and nearest", () => {
  it("maps ZIPs to the five licensed states only", () => {
    expect(["98033", "97201", "85001", "90210", "78704", "10001"].map(stateForZip)).toEqual(["WA", "OR", "AZ", "CA", "TX", null]);
  });

  it("points to the closest published scenario", () => {
    expect(nearestScenario(base)).toEqual({ kind: "grid", scenarioId: "grid-conv30-10" });
    expect(nearestScenario({ ...base, creditBand: "780+", down: 140000 })).toEqual({ kind: "posted", product: "30yr_fixed" });
    expect(nearestScenario({ ...base, loanType: "fha" })).toEqual({ kind: "grid", scenarioId: "grid-fha30-3.5" });
    expect(nearestScenario({ ...base, purpose: "refinance", down: undefined, balance: 300000 })).toEqual({ kind: "grid", scenarioId: "grid-refi30-70" });
  });
});

describe("M8 quote mode", () => {
  const walk = (vals: string[]) => vals.reduce<Answers>((a, v) => {
    const r = answerStep(a, v);
    if (r.error) throw new Error(`${currentStep(a)}: ${r.error}`);
    return r.answers;
  }, {});

  it("parses amounts the way people type them", () => {
    expect(parseAmount("$520,000")).toBe(520000);
    expect(parseAmount("520k")).toBe(520000);
    expect(parseAmount("1.2m")).toBe(1200000);
    expect(parseAmount("10%", 520000)).toBe(52000);
    expect(parseAmount("ten")).toBeNull();
  });

  it("asks one question at a time and builds the scenario", () => {
    const a = walk(["purchase", "conventional", "30", "520k", "10%", "740-759", "98052", "single_family", "primary"]);
    expect(currentStep(a)).toBeNull();
    const s = toScenario(a);
    expect(s.ok && s.scenario).toEqual(base);
  });

  it("refuses a ZIP outside the licensed states and asks refinance questions for a refinance", () => {
    const a = walk(["purchase", "conventional", "30", "520k", "52000", "740-759"]);
    expect(answerStep(a, "10001").error).toBe("outside");
    const r = walk(["cashout", "conventional", "30", "600k"]);
    expect(currentStep(r)).toBe("balance");
    expect(currentStep(walk(["cashout", "conventional", "30", "600k", "300k"]))).toBe("cashOut");
  });

  it("changing the purpose re-asks the money questions", () => {
    const a = walk(["purchase", "conventional", "30", "520k", "10%", "740-759", "98052", "single_family", "primary"]);
    const back = answerStep(reopen(a, "purpose"), "refinance").answers;
    expect(back.down).toBeUndefined();
    expect(currentStep(back)).toBe("balance");
  });
});

describe("personal estimate lifecycle", () => {
  it("saves a request, prices it, approves it, and keys the link", async () => {
    const created = await createQuote({ scenario: base, email: "pat@example.com", emailConsent: true, source: "m8" }, records);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.state).toBe("WA");
    expect(created.url).toContain(`/estimate/${created.id}?k=`);
    expect(keyValid(created.id, estimateKey(created.id)!)).toBe(true);
    expect(keyValid(created.id, "wrong")).toBe(false);

    const noSource = await priceQuote({ id: created.id, quotes: [q("uwm", 6.25, 0)], source: null, actor: "test" }, records);
    expect(noSource.ok).toBe(false);
    const restricted = await priceQuote({ id: created.id, quotes: [q("prmg", 6.25, 0)], source: { bytes: png, mime: "image/png" }, actor: "test" }, records);
    expect(restricted.ok).toBe(false);
    const priced = await priceQuote({ id: created.id, quotes: [q("uwm", 6.25, 0), q("pennymac", 6.125, 0.5), q("kind", 6.375, -0.25)], source: { bytes: png, mime: "image/png" }, actor: "test" }, records);
    expect(priced.ok).toBe(true);
    expect((await loadQuote(created.id, records))?.status).toBe("priced");

    const approved = await approveQuote(created.id, "test", "Happy to run FHA too.", records);
    expect(approved).toEqual({ ok: true, emailed: false });
    const done = (await loadQuote(created.id, records))!;
    expect(done.status).toBe("approved");
    const me = mloById(CONFIG.routing.operatorMloId)!;
    expect(disclaimerFor(done)).toContain(`priced and approved by ${me.name}, NMLS #${me.nmls}`);
    expect(disclaimerFor(done)).toMatch(/^This is not an offer or commitment to lend\./);
    expect(done.events.map((e) => e.type)).toEqual(["requested", "priced", "approved", "sent"]);
    expect((await rejectQuote(created.id, "test", "late", records)).ok).toBe(false);
  });

  it("refuses bad email, no consent, and ZIPs outside the licensed states", async () => {
    expect((await createQuote({ scenario: base, email: "nope", emailConsent: true, source: "m8" }, records)).ok).toBe(false);
    expect((await createQuote({ scenario: base, email: "pat@example.com", emailConsent: false, source: "m8" }, records)).ok).toBe(false);
    const out = await createQuote({ scenario: { ...base, zip: "10001" }, email: "pat@example.com", emailConsent: true, source: "agent" }, records);
    expect(out.ok === false && out.status).toBe(422);
    expect((await createQuote({ scenario: { ...base, ssn: "123-45-6789" }, email: "pat@example.com", emailConsent: true, source: "agent" }, records)).ok).toBe(false);
    expect(await listQuotes(records)).toHaveLength(0);
  });

  it("only a loan officer licensed in the property's state can approve", async () => {
    const created = await createQuote({ scenario: { ...base, zip: "97201" }, email: "pat@example.com", emailConsent: true, source: "m8" }, records);
    if (!created.ok) throw new Error("create failed");
    await priceQuote({ id: created.id, quotes: [q("uwm", 6.25, 0), q("pennymac", 6.125, 0.5), q("kind", 6.375, -0.25)], source: { bytes: png, mime: "image/png" }, actor: "test" }, records);
    const quote = (await loadQuote(created.id, records))!;
    const operator = mloById(CONFIG.routing.operatorMloId)!;
    const licensedInOregon = operator.licenses.some((l) => l.state === "OR");
    expect(approvalBlocker(quote, operator) === null).toBe(licensedInOregon);
  });

  it("keeps the borrower's email out of everything but the request", async () => {
    const created = await createQuote({ scenario: base, email: "pat@example.com", emailConsent: true, source: "m8" }, records);
    if (!created.ok) throw new Error("create failed");
    expect(maskEmail("pat@example.com")).toBe("p••@example.com");
    const keys = await records.list(`quotes/${created.id}/`);
    expect(keys).toHaveLength(1);
  });
});
