import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDate, parseLine, parseText } from "./parse";
import { estimatedTaxDates, homeOfficeCents, mileageRate, nextEstimatedDate } from "./tax";
import { guessCategory } from "./categories";
import { addReceipt, saveEntry, saveProfile, tellM8, yearCsv, yearSummary, type ExpenseCall } from "./service";
import { MemoryExpenseStore, setExpenseStoreForTests } from "./store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryMembershipStore, setMembershipStoreForTests } from "@/lib/membership/store";
import { recordPayment, setMember } from "@/lib/membership/service";

const NOW = new Date("2026-11-19T18:00:00Z"); // a Thursday
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lo", role: "lo", mloId: null, status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const owner: User = { ...me, id: "own", email: "own@x.com", role: "owner" };

describe("Expense parsing and tax figures (D37)", () => {
  it("reads dates the way people say them", () => {
    const t = "2026-11-19";
    expect(parseDate("yesterday", t)).toBe("2026-11-18");
    expect(parseDate("last Tuesday", t)).toBe("2026-11-17");
    expect(parseDate("on thursday", t)).toBe("2026-11-12");
    expect(parseDate("11/12", t)).toBe("2026-11-12");
    expect(parseDate("12/30", t)).toBe("2025-12-30");
    expect(parseDate("Nov 3", t)).toBe("2026-11-03");
    expect(parseDate("2026-02-01", t)).toBe("2026-02-01");
    expect(parseDate("no date", t)).toBe(t);
  });

  it("finds amounts, miles, vendors and categories without AI", () => {
    expect(parseLine("$84 lunch with an agent at Daniel's yesterday", "2026-11-19")).toMatchObject({ kind: "expense", amountCents: 8400, category: "meals", vendor: "Daniel's", date: "2026-11-18" });
    expect(parseLine("Drove 32 miles to a closing in Bellevue", "2026-11-19")).toMatchObject({ kind: "mileage", miles: 32, category: "car", amountCents: null });
    expect(parseLine("E&O insurance $1,100.50", "2026-11-19")).toMatchObject({ amountCents: 110050, category: "insurance" });
    expect(parseLine("Home Trust paid me $6,200 for October", "2026-11-19")).toMatchObject({ kind: "income", amountCents: 620000, vendor: "Home Trust" });
    expect(parseLine("cell phone bill 95.20", "2026-11-19")).toMatchObject({ category: "utilities", businessPct: 50, amountCents: 9520 });
    expect(parseLine("just a note", "2026-11-19")).toBeNull();
    expect(parseText("NMLS renewal $30; postcards $220\nDrove 12 mi to an appraisal", "2026-11-19").map((d) => d.category)).toEqual(["taxes_licenses", "advertising", "car"]);
    expect(guessCategory("Bonzo subscription")).toBe("software");
  });

  it("uses the IRS figures for the date", () => {
    expect(mileageRate("2025-12-31")?.cents).toBe(70);
    expect(mileageRate("2026-03-01")?.cents).toBe(72.5);
    expect(mileageRate("2026-07-01")?.cents).toBe(76);
    expect(homeOfficeCents(120)).toBe(60000);
    expect(homeOfficeCents(450)).toBe(150000);
    expect(estimatedTaxDates(2026)).toEqual(["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
    expect(estimatedTaxDates(2028)[0]).toBe("2028-04-17"); // April 15, 2028 is a Saturday
    expect(nextEstimatedDate("2026-11-19")).toBe("2027-01-15");
    expect(nextEstimatedDate("2026-01-10")).toBe("2026-01-15");
  });
});

describe("Expense tracker (D37)", () => {
  let store: MemoryExpenseStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    store = new MemoryExpenseStore();
    setExpenseStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    setMembershipStoreForTests(new MemoryMembershipStore());
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CC_ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
    setExpenseStoreForTests(null);
    setAccountStoreForTests(null);
    setMembershipStoreForTests(null);
  });

  const add = (kind: string, date: string, dollars: number, category: string, extra: Partial<Parameters<typeof saveEntry>[2]> = {}) => saveEntry(me, null, { kind, date, dollars, miles: 0, vendor: "V", category, businessPct: 100, purpose: "Business", recipient: "", ...extra }, NOW);

  it("turns what you say into drafts that count only once confirmed", async () => {
    expect(await tellM8(me, "$84 lunch with an agent at Daniel's yesterday. Drove 32 miles to a closing", { now: NOW, call: null })).toEqual({ ok: true, drafts: 2, by: "parser" });
    const drafts = await store.list("lo1", 2026);
    expect(drafts.every((d) => d.status === "draft")).toBe(true);
    expect((await yearSummary(me, 2026)).expenseCents).toBe(0);
    expect(drafts.find((d) => d.kind === "mileage")).toMatchObject({ miles: 32, amountCents: 2432 }); // 32 × 76¢
    expect(await tellM8(me, "hello", { now: NOW, call: null })).toMatchObject({ ok: false });
  });

  it("uses the AI when there is one, with sensitive numbers removed first", async () => {
    let seen = "";
    const call: ExpenseCall = async (input) => {
      seen = input.text ?? "";
      return { stop: "end_turn", json: JSON.stringify({ items: [{ kind: "expense", date: "2026-11-10", amount: 42.5, miles: 0, vendor: "Staples", category: "office", businessPct: 100, purpose: "Printer ink", recipient: "" }] }) };
    };
    expect(await tellM8(me, "ink at staples on my card 4111 1111 1111 1111 for $42.50", { now: NOW, call })).toEqual({ ok: true, drafts: 1, by: "m8" });
    expect(seen).not.toContain("4111 1111");
    const [d] = await store.list("lo1", 2026);
    expect(d).toMatchObject({ vendor: "Staples", category: "office", amountCents: 4250, date: "2026-11-10", status: "draft" });
    // A broken answer falls back to the parser.
    expect(await tellM8(me, "$12 parking", { now: NOW, call: async () => ({ stop: "end_turn", json: "{nope" }) })).toMatchObject({ ok: true, by: "parser" });
  });

  it("keeps receipts, reads them when it can, and refuses the wrong files", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    expect(await addReceipt(me, { name: "r.svg", type: "image/svg+xml", bytes: png }, { now: NOW, call: null })).toMatchObject({ ok: false });
    expect(await addReceipt(me, { name: "big.png", type: "image/png", bytes: new Uint8Array(6 * 1024 * 1024) }, { now: NOW, call: null })).toMatchObject({ ok: false });
    expect(await addReceipt(me, { name: "lunch.png", type: "image/png", bytes: png }, { now: NOW, call: async () => ({ stop: "end_turn", json: JSON.stringify({ items: [{ kind: "expense", date: "2026-11-18", amount: 61.2, miles: 0, vendor: "Daniel's", category: "meals", businessPct: 100, purpose: "Lunch with an agent", recipient: "" }] }) }) })).toMatchObject({ ok: true, by: "m8" });
    const [d] = await store.list("lo1", 2026);
    expect(d).toMatchObject({ source: "receipt", category: "meals", amountCents: 6120 });
    expect(await store.receipt("lo1", d.receiptId!)).toMatchObject({ type: "image/png", size: 7 });
    // Private: another loan officer can't open it or see the entry.
    expect(await store.receipt("lo2", d.receiptId!)).toBeNull();
    expect(await store.get("lo2", d.id)).toBeNull();
    expect(await saveEntry(other, d.id, { kind: "expense", date: "2026-11-18", dollars: 1, miles: 0, vendor: "", category: "meals", businessPct: 100, purpose: "x", recipient: "" }, NOW)).toMatchObject({ ok: false });
  });

  it("totals the year by Schedule C line, with meals at 50%, gifts at $25 a person, miles and the home office", async () => {
    await add("income", "2026-03-31", 6200, "other", { vendor: "Home Trust Financial" });
    await add("income", "2026-04-30", 5800, "other", { vendor: "Home Trust Financial" });
    await add("expense", "2026-02-01", 100, "meals");
    await add("expense", "2026-02-02", 40, "gifts", { recipient: "Ann" });
    await add("expense", "2026-06-02", 20, "gifts", { recipient: "ann" });
    await add("expense", "2026-02-03", 120, "utilities", { businessPct: 50 });
    await add("expense", "2026-05-01", 30, "taxes_licenses");
    await saveEntry(me, null, { kind: "mileage", date: "2026-03-01", dollars: 0, miles: 100, vendor: "", category: "car", businessPct: 100, purpose: "Closing in Bellevue", recipient: "" }, NOW);
    expect(await saveEntry(me, null, { kind: "mileage", date: "2026-03-01", dollars: 0, miles: 10, vendor: "", category: "car", businessPct: 100, purpose: "", recipient: "" }, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/business purpose/) });
    expect(await add("expense", "2026-12-01", 10, "office")).toMatchObject({ ok: false }); // future
    await saveProfile(me, 2026, 150, "Home office is the spare bedroom", NOW);
    const s = await yearSummary(me, 2026);
    expect(s.incomeCents).toBe(1_200_000);
    expect(s.income).toEqual([{ payer: "Home Trust Financial", cents: 1_200_000, n: 2 }]);
    const line = (l: string) => s.lines.find((x) => x.line === l)?.cents;
    expect(line("24b")).toBe(5000);
    expect(line("27a")).toBe(2500); // $40 + $20 to Ann, capped at $25
    expect(line("25")).toBe(6000);
    expect(line("23")).toBe(3000);
    expect(line("9")).toBe(7250); // 100 mi × 72.5¢ (March)
    expect(line("30")).toBe(75000);
    expect(s.lines.map((l) => l.line)).toEqual(["9", "23", "24b", "25", "27a", "30"]);
    expect(s.expenseCents).toBe(5000 + 2500 + 6000 + 3000 + 7250 + 75000);
    const csv = await yearCsv(me, 2026);
    expect(csv.split("\n")[0]).toMatch(/^Date,Type,Schedule C line/);
    expect(csv).toContain("2026-02-01,expense,24b,Business meals,V,Business,100.00,100,50.00");
  });

  it("adds the LoanM8 membership the owner recorded, and keeps spreadsheet formulas out of the CSV", async () => {
    const accounts = new MemoryAccountStore();
    setAccountStoreForTests(accounts);
    await accounts.putUser(owner);
    await accounts.putUser(me);
    await setMember(owner, me.id, { area: "Eastside, WA", feeDollars: 300, recruitedBy: null, joinedOn: "2026-01-01" }, NOW);
    await recordPayment(owner, me.id, "2026-02", NOW);
    await add("expense", "2026-02-05", 10, "office", { vendor: "=HYPERLINK(\"http://x\")" });
    const s = await yearSummary(me, 2026);
    expect(s.membership).toEqual({ months: 1, cents: 30000 });
    expect(s.lines.find((l) => l.line === "27a")?.cents).toBe(30000);
    expect(await yearCsv(me, 2026)).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});
