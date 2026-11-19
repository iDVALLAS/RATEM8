import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answerIdea, areaPlan, coopBudget, creditBalance, monthsSince, rateFor, recordPayment, recordSpend, setMember, setPreference, statementFor, suggestIdea } from "./service";
import { MemoryMembershipStore, NATIONAL, setMembershipStoreForTests } from "./store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";

const NOW = new Date("2026-11-19T18:00:00Z");
const mk = (id: string, role: User["role"], name: string): User => ({ id, email: `${id}@x.com`, name, role, mloId: null, status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "system" });
const owner = mk("own", "owner", "Olive Owner");
const a = mk("a", "lo", "Avery A");
const b = mk("b", "lo", "Blake B");
const c = mk("c", "lo", "Casey C");
const asst = mk("s", "assistant", "Sam S");

describe("Membership: recruiting credit and the marketing budgets (D35/D36)", () => {
  let accounts: MemoryAccountStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    accounts = new MemoryAccountStore();
    setAccountStoreForTests(accounts);
    setMembershipStoreForTests(new MemoryMembershipStore());
    for (const u of [owner, a, b, c, asst]) await accounts.putUser(u);
    delete process.env.RECRUIT_REWARDS;
  });
  afterEach(() => {
    process.env = { ...saved };
    setAccountStoreForTests(null);
    setMembershipStoreForTests(null);
  });
  const join = (u: User, recruitedBy: string | null, joinedOn = "2026-01-01", area = "Eastside, WA", fee = 300) => setMember(owner, u.id, { area, feeDollars: fee, recruitedBy, joinedOn }, NOW);

  it("counts tenure in whole months", () => {
    expect(monthsSince("2026-01-01", "2026-12")).toBe(11);
    expect(monthsSince("2026-01-01", "2027-01")).toBe(12);
    expect(monthsSince("2026-01-15", "2027-01")).toBe(11);
    expect(rateFor("2026-01-01", "2026-12")).toBe(0.1);
    expect(rateFor("2026-01-01", "2027-01")).toBe(0.15);
  });

  it("one level only, nobody brings themselves or each other in, assistants aren't members", async () => {
    expect(await join(a, null)).toEqual({ ok: true });
    expect(await join(b, a.id)).toEqual({ ok: true });
    expect(await join(a, b.id)).toMatchObject({ ok: false, error: expect.stringMatching(/each other/) });
    expect(await join(c, c.id)).toMatchObject({ ok: false });
    expect(await join(c, asst.id)).toMatchObject({ ok: false });
    expect(await join(asst, a.id)).toMatchObject({ ok: false });
    expect(await setMember(a, b.id, { area: "X", feeDollars: 1, recruitedBy: null, joinedOn: "2026-01-01" })).toMatchObject({ ok: false }); // a loan officer can't
    // C, brought in by B, credits B, never A.
    await join(c, b.id);
    await recordPayment(owner, c.id, "2026-03", NOW);
    expect((await creditBalance(b.id)).held).toBe(3000);
    expect((await creditBalance(a.id)).held).toBe(0);
  });

  it("holds credit until the plan is approved, then credits 10% of cash paid, used first on the recruiter's own fee", async () => {
    await join(a, null);
    await join(b, a.id);
    const p1 = await recordPayment(owner, b.id, "2026-02", NOW);
    expect(p1).toMatchObject({ ok: true, payment: { paidCents: 30000, credit: { recruiterUserId: "a", rate: 0.1, cents: 3000, status: "held" } } });
    expect(await creditBalance(a.id)).toEqual({ usable: 0, held: 3000 });
    // Held credit can't be used.
    expect(await recordPayment(owner, a.id, "2026-02", NOW)).toMatchObject({ payment: { creditUsedCents: 0, paidCents: 30000 } });
    process.env.RECRUIT_REWARDS = "true";
    await recordPayment(owner, b.id, "2026-03", NOW);
    expect(await creditBalance(a.id)).toEqual({ usable: 3000, held: 3000 });
    const own = await recordPayment(owner, a.id, "2026-03", NOW);
    expect(own).toMatchObject({ payment: { creditUsedCents: 3000, paidCents: 27000 } });
    expect((await creditBalance(a.id)).usable).toBe(0);
    // Once a credit exists, who brought them in is fixed.
    expect(await join(b, null)).toMatchObject({ ok: false, error: expect.stringMatching(/can't change/) });
    // A month only once.
    expect(await recordPayment(owner, b.id, "2026-03", NOW)).toMatchObject({ ok: false });
  });

  it("the higher rate after a year; credit paid with credit makes no new credit", async () => {
    process.env.RECRUIT_REWARDS = "true";
    await join(a, null);
    await join(b, a.id, "2025-06-01");
    expect(await recordPayment(owner, b.id, "2026-07", NOW)).toMatchObject({ payment: { credit: { rate: 0.15, cents: 4500 } } });
    // B brings in C; B's own fee is then partly paid with credit, and A's credit is on the cash part only.
    await join(c, b.id);
    await recordPayment(owner, c.id, "2026-08", NOW); // B gets $30
    const pb = await recordPayment(owner, b.id, "2026-08", NOW);
    expect(pb).toMatchObject({ payment: { creditUsedCents: 3000, paidCents: 27000, credit: { cents: 4050 } } });
  });

  it("splits 20% of every fee to marketing: 60% national, 40% the member's area", async () => {
    await join(a, null, "2026-01-01", "Eastside, WA");
    await join(b, null, "2026-01-01", "  eastside,  wa ");
    await join(c, null, "2026-01-01", "Portland, OR");
    for (const u of [a, b, c]) await recordPayment(owner, u.id, "2026-04", NOW);
    const east = await coopBudget("Eastside, WA");
    expect(east).toMatchObject({ inCents: 4800, members: 2, balanceCents: 4800 });
    expect(await coopBudget(NATIONAL)).toMatchObject({ inCents: 10800, members: 3 });
  });

  it("spending needs proof, can't go past the budget, and paid ads need location-only targeting", async () => {
    await join(a, null);
    await recordPayment(owner, a.id, "2026-04", NOW); // $24 to the area
    const base = { area: "Eastside, WA", month: "2026-04", what: "Little League banner", channel: "sponsorship", proof: "INV-123", locationOnly: false };
    expect(await recordSpend(owner, { ...base, dollars: 30 })).toMatchObject({ ok: false, error: expect.stringMatching(/more than the area has/) });
    expect(await recordSpend(owner, { ...base, dollars: 10, proof: "" })).toMatchObject({ ok: false });
    expect(await recordSpend(owner, { ...base, dollars: 10, channel: "social_ads" })).toMatchObject({ ok: false, error: expect.stringMatching(/housing ad category/) });
    expect(await recordSpend(owner, { ...base, dollars: 10, channel: "social_ads", locationOnly: true })).toEqual({ ok: true });
    expect(await recordSpend(a, { ...base, dollars: 1 })).toMatchObject({ ok: false });
    expect((await coopBudget("Eastside, WA")).balanceCents).toBe(1400);
  });

  it("members have a say: their split averages into the plan, and ideas get an answer", async () => {
    await join(a, null);
    await join(b, null);
    expect(await setPreference(a, { social_ads: 50, sponsorship: 40 })).toMatchObject({ ok: false, error: expect.stringMatching(/90%/) });
    expect(await setPreference(a, { social_ads: 60, sponsorship: 40 })).toEqual({ ok: true });
    expect(await setPreference(b, { social_ads: 20, sponsorship: 30, event: 50 })).toEqual({ ok: true });
    const plan = await areaPlan("Eastside, WA");
    expect(plan.voters).toBe(2);
    expect(plan.rows.find((r) => r.channel === "social_ads")?.planPct).toBe(40);
    expect(plan.rows.find((r) => r.channel === "event")?.planPct).toBe(25);
    expect(await suggestIdea(a, "Sponsor the Kirkland 5K in June", 400)).toEqual({ ok: true });
    const st = await statementFor(b);
    expect(st.ideas).toHaveLength(1);
    expect(await answerIdea(owner, st.ideas[0].id, "declined", "")).toMatchObject({ ok: false });
    expect(await answerIdea(a, st.ideas[0].id, "approved", "")).toMatchObject({ ok: false });
    expect(await answerIdea(owner, st.ideas[0].id, "approved", "Yes, booking it")).toEqual({ ok: true });
    expect((await statementFor(a)).ideas[0]).toMatchObject({ status: "approved", reply: "Yes, booking it" });
    expect(await suggestIdea(c, "Not a member yet", null)).toMatchObject({ ok: false });
  });
});
