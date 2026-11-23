import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, pipelineStore, setPipelineStoreForTests, type Loan } from "@/lib/pipeline/store";
import { MemoryExpenseStore, expenseStore, setExpenseStoreForTests, type Entry } from "@/lib/expenses/store";
import { MemoryCampaignStore, setCampaignStoreForTests } from "@/lib/campaigns/store";
import { MemoryPrefsStore, prefsFor, setLeadTarget, setPrefsStoreForTests } from "@/lib/profile/prefs";
import { MemoryTeamStore, setTeamStoreForTests, teamStore } from "@/lib/agents/store";
import { leadMoveProposal, snapshot } from "@/lib/agents/business";
import { runTeam } from "@/lib/agents/runner";
import { closeMove, saveTeamSettings } from "@/lib/agents/service";
import { reviewLeadMove, reviewMove } from "@/lib/agents/compliance";
import { findRateMentions } from "@/lib/m8/guard";
import { MemoryLeadEventStore, setLeadEventStoreForTests, leadEventStore, type LeadEvent } from "./events";
import { MemoryMonthlyStore, setMonthlyStoreForTests } from "./spend";
import { SPHERE_KEY, WEB_FORM_KEY } from "./source-key";
import { scorecardFor } from "./score-service";
import {
  BADGE_PRECEDENCE,
  BADGE_RULES,
  badgeRules,
  cleanTarget,
  creditFor,
  firstSources,
  leadScorecard,
  leadSourceMove,
  leadSpendCents,
  loanStart,
  periodWindow,
  scoreUsd,
  type ScoreEvent,
  type ScoreInput,
  type ScoreLoan,
  type ScoreRow,
  type ScoreSpend,
} from "./scorecard";

/** D84: the lead-source scorecard (Option B) and the Business Manager's lead-source move. */

const NOW = new Date("2026-11-22T18:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const dayAgo = (days: number) => ago(days).slice(0, 10);

let n = 0;
const ev = (sourceKey: string, days: number, o: Partial<ScoreEvent> = {}): ScoreEvent => ({ contactId: `c${++n}`, sourceKey, sourceLabel: sourceKey === "zillow" ? "Zillow" : sourceKey, at: ago(days), duplicate: false, namesYou: true, datedBy: "delivery", ...o });
const evs = (count: number, sourceKey: string, days: number, o: Partial<ScoreEvent> | ((i: number) => Partial<ScoreEvent>) = {}) => Array.from({ length: count }, (_, i) => ev(sourceKey, days, typeof o === "function" ? o(i) : o));
const line = (leadSource: string | null, dollars: number, days: number, o: Partial<ScoreSpend> = {}): ScoreSpend => ({ date: dayAgo(days), amountCents: dollars * 100, businessPct: 100, leadSource, status: "confirmed", kind: "expense", ...o });
const loan = (id: string, contactId: string | null, o: Partial<ScoreLoan> = {}): ScoreLoan => ({ id, contactId, closed: false, dead: false, milestoneAt: ago(1), keyDates: { application: null }, history: [], ...o });
const closedLoan = (id: string, contactId: string, closedDaysAgo: number, appliedDaysAgo = closedDaysAgo + 30) => loan(id, contactId, { closed: true, milestoneAt: ago(closedDaysAgo), keyDates: { application: dayAgo(appliedDaysAgo) } });
const card = (i: Partial<ScoreInput>) => leadScorecard({ period: "90d", now: NOW, events: [], spend: [], loans: [], contacts: [], ...i });
const rowOf = (c: { rows: ScoreRow[] }, key: string) => c.rows.find((r) => r.key === key)!;
const finite = (v: unknown): boolean => (typeof v === "number" ? Number.isFinite(v) : v && typeof v === "object" ? Object.values(v).every(finite) : true);

describe("scorecard math (D84)", () => {
  it("reports every figure per source, joined on the source key", () => {
    const zillow = [...evs(8, "zillow", 10), ...evs(2, "zillow", 20, { namesYou: false, duplicate: true })];
    const won = zillow[0].contactId;
    const open = zillow[1].contactId;
    const c = card({
      events: zillow,
      spend: [line("zillow", 1200, 5), line("zillow", 1200, 35, { businessPct: 50 }), line(null, 500, 5), line("zillow", 999, 5, { status: "draft" })],
      loans: [closedLoan("l1", won, 3, 20), loan("l2", open, { keyDates: { application: dayAgo(4) } })],
    });
    expect(rowOf(c, "zillow")).toEqual({
      key: "zillow", label: "Zillow", sphere: false,
      spendCents: 180_000, leads: 10, canCall: 8, sharePct: 80,
      perLeadCents: 18_000, perCallableCents: 22_500,
      inPipeline: 1, closed: 1, perLoanCents: 180_000, repeats: 2,
      historyDays: 35, badge: "best",
    });
  });

  it("zero spend, zero leads and nothing to divide give null (shown as —), never NaN or Infinity", () => {
    const c = card({ events: evs(3, "web-form", 2), spend: [line("bankrate", 400, 2)], loans: [] });
    const web = rowOf(c, WEB_FORM_KEY);
    expect(web).toMatchObject({ spendCents: 0, leads: 3, perLeadCents: null, perCallableCents: null, perLoanCents: null, sharePct: 100 });
    const bank = rowOf(c, "bankrate");
    expect(bank).toMatchObject({ spendCents: 40_000, leads: 0, canCall: 0, sharePct: null, perLeadCents: null, perCallableCents: null, perLoanCents: null });
    const sphere = rowOf(c, SPHERE_KEY);
    expect(sphere).toMatchObject({ spendCents: 0, leads: 0, sharePct: null, perLeadCents: null, perLoanCents: null });
    expect(finite(c)).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity/);
    // Spend with leads none of whom named you: per lead you can call can't be worked out.
    const none = rowOf(card({ events: evs(4, "meta", 2, { namesYou: false }), spend: [line("meta", 200, 2)] }), "meta");
    expect(none).toMatchObject({ canCall: 0, sharePct: 0, perLeadCents: 5_000, perCallableCents: null });
    expect(scoreUsd(null)).toBe("—");
    expect(scoreUsd(123_456)).toBe("$1,235");
  });

  it("counts spend at its business-use share, without the year-end report's tax-only rules", () => {
    expect(leadSpendCents({ amountCents: 10_000, businessPct: 50 })).toBe(5_000);
    expect(leadSpendCents({ amountCents: 10_000, businessPct: 100 })).toBe(10_000);
    expect(leadSpendCents({ amountCents: 10_000, businessPct: 250 })).toBe(10_000);
    expect(leadSpendCents({ amountCents: Number.NaN, businessPct: 50 })).toBe(0);
    // A $200 closing gift tagged to sphere counts in full (the $25 gift limit is a tax rule, not what it cost).
    const c = card({ spend: [line(SPHERE_KEY, 200, 3), line(SPHERE_KEY, 80, 3, { businessPct: 50 }), line(SPHERE_KEY, 90, 3, { kind: "mileage" }), line(SPHERE_KEY, 70, 3, { status: "draft" })] });
    expect(rowOf(c, SPHERE_KEY).spendCents).toBe(24_000);
  });

  it("each period is its own window; a lead with no date of its own is counted in none", () => {
    const events = [ev("zillow", 5), ev("zillow", 45), ev("zillow", 200), ev("zillow", 400), ev("zillow", 1, { datedBy: "none" }), ev("lendingtree", 2, { datedBy: "none" })];
    const spend = [line("zillow", 100, 5), line("zillow", 100, 45), line("zillow", 100, 200)];
    const leads = (period: ScoreInput["period"]) => card({ period, events, spend }).rows.find((r) => r.key === "zillow")?.leads ?? 0;
    expect(leads("30d")).toBe(1);
    expect(leads("90d")).toBe(2);
    expect(leads("year")).toBe(3);
    expect(card({ period: "30d", events, spend }).undated).toBe(2);
    expect(rowOf(card({ period: "90d", events, spend }), "zillow").spendCents).toBe(20_000);
    expect(card({ events, spend }).rows.some((r) => r.key === "lendingtree")).toBe(false);
    expect(periodWindow("30d", NOW).from.toISOString()).toBe(ago(30));
    expect(periodWindow("90d", NOW).from.toISOString()).toBe(ago(90));
    expect(periodWindow("year", NOW).from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(periodWindow("year", NOW).to).toBe(NOW);
  });

  it("credits each loan to one row: the contact's first lead source, repeat business to Past clients & sphere", () => {
    const first = ev("zillow", 80, { contactId: "ann" });
    const later = ev("lendingtree", 10, { contactId: "ann", duplicate: true });
    const ctx = { loans: [] as ScoreLoan[], contacts: new Map(), first: firstSources([later, first]) };
    expect(firstSources([later, first]).get("ann")).toBe("zillow");
    // Ann's first loan is Zillow's even after the loan sync made her a past client.
    const annFirst = closedLoan("l1", "ann", 5, 60);
    ctx.contacts.set("ann", { id: "ann", relationship: "past_client", loan: { closedOn: dayAgo(5) } });
    expect(creditFor(annFirst, ctx)).toBe("zillow");
    // Her next loan, started after that closing, is repeat business.
    const annNext = loan("l2", "ann", { keyDates: { application: dayAgo(2) } });
    expect(creditFor(annNext, { ...ctx, loans: [annFirst, annNext] })).toBe(SPHERE_KEY);
    // A past client with no lead event, and a sphere contact, start loans: sphere. Someone else: no row.
    ctx.contacts.set("bo", { id: "bo", relationship: "sphere" });
    ctx.contacts.set("cy", { id: "cy", relationship: "lead" });
    expect(creditFor(loan("l3", "bo", { keyDates: { application: dayAgo(3) } }), ctx)).toBe(SPHERE_KEY);
    expect(creditFor(loan("l4", "cy"), ctx)).toBeNull();
    expect(creditFor(loan("l5", null), ctx)).toBeNull();
    expect(loanStart({ keyDates: { application: "2026-11-01" }, history: [{ at: "2026-10-01T00:00:00Z" }] })).toBe("2026-11-01");
    expect(loanStart({ keyDates: { application: null }, history: [{ at: "2026-10-09T00:00:00Z" }, { at: "2026-10-01T00:00:00Z" }] })).toBe("2026-10-01");
    expect(loanStart({ keyDates: { application: null }, history: [] })).toBeNull();
  });

  it("Past clients & sphere is its own row: tagged spend, and past clients or sphere who started a new loan are its leads", () => {
    const contacts = [{ id: "pc1", relationship: "past_client", loan: { closedOn: "2022-05-01" } }, { id: "sp1", relationship: "sphere" }, { id: "sp2", relationship: "sphere" }, { id: "ld1", relationship: "lead" }];
    const c = card({
      contacts,
      spend: [line(SPHERE_KEY, 150, 10)],
      events: [ev(SPHERE_KEY, 15, { contactId: "ref1", namesYou: false })],
      loans: [
        loan("a", "pc1", { keyDates: { application: dayAgo(20) } }),
        closedLoan("b", "sp1", 4, 40),
        loan("c", "sp2", { dead: true, keyDates: { application: dayAgo(12) } }),
        loan("d", "sp2", { keyDates: { application: dayAgo(200) } }),
        loan("e", "ld1", { keyDates: { application: dayAgo(5) } }),
      ],
    });
    const s = rowOf(c, SPHERE_KEY);
    expect(c.rows[0].key).toBe(SPHERE_KEY);
    expect(s).toMatchObject({ label: "Past clients & sphere", sphere: true, spendCents: 15_000, leads: 4, canCall: 3, inPipeline: 1, closed: 1, perLoanCents: 15_000 });
    // With nothing at all, the row is still there (zeros and dashes).
    expect(card({}).rows.map((r) => r.key)).toEqual([SPHERE_KEY]);
    expect(card({}).unattributed).toBe(0);
    expect(card({ contacts, loans: [closedLoan("z", "ld1", 3)] }).unattributed).toBe(1);
  });
});

describe("badges (D84)", () => {
  it("the thresholds are the brief's, in one object", () => {
    expect(BADGE_RULES).toMatchObject({ defaultTargetCents: 100_000, enoughLeads: 10, fixShareBelowPct: 50, pauseSpendCents: 100_000, pauseHistoryDays: 60, pauseLoans: 0, bestMinLoans: 1, scaleMinLoans: 2, watchUnderLoans: 2 });
    expect(BADGE_PRECEDENCE).toEqual(["pause", "thin", "fix", "best", "scale", "watch"]);
  });

  const base = { sphere: false, spendCents: 0, leads: 20, sharePct: 100, closed: 0, inPipeline: 0, perLoanCents: null, historyDays: 120 };
  it("each rule on its own", () => {
    const T = 100_000;
    expect(badgeRules({ ...base, spendCents: 100_000 }, T).pause).toBe(true);
    expect(badgeRules({ ...base, spendCents: 99_999 }, T).pause).toBe(false);
    expect(badgeRules({ ...base, spendCents: 100_000, historyDays: 59 }, T).pause).toBe(false);
    expect(badgeRules({ ...base, spendCents: 100_000, historyDays: null }, T).pause).toBe(false);
    expect(badgeRules({ ...base, spendCents: 100_000, inPipeline: 1 }, T).pause).toBe(false);
    expect(badgeRules({ ...base, leads: 9 }, T).thin).toBe(true);
    expect(badgeRules({ ...base, leads: 10 }, T).thin).toBe(false);
    expect(badgeRules({ ...base, leads: 10, sharePct: 49 }, T).fix).toBe(true);
    expect(badgeRules({ ...base, leads: 10, sharePct: 50 }, T).fix).toBe(false);
    expect(badgeRules({ ...base, leads: 9, sharePct: 0 }, T).fix).toBe(false);
    expect(badgeRules({ ...base, sphere: true, sharePct: 0 }, T).fix).toBe(false);
    expect(badgeRules({ ...base, spendCents: 200_000, closed: 2, perLoanCents: 100_000 }, T).scale).toBe(true);
    expect(badgeRules({ ...base, spendCents: 200_002, closed: 2, perLoanCents: 100_001 }, T).scale).toBe(false);
    expect(badgeRules({ ...base, spendCents: 50_000, closed: 1, perLoanCents: 50_000 }, T).scale).toBe(false);
    expect(badgeRules({ ...base, spendCents: 300_000, closed: 2, perLoanCents: 150_000 }, T).watch).toBe(true);
    expect(badgeRules({ ...base, spendCents: 50_000, closed: 1, perLoanCents: 50_000 }, T).watch).toBe(true);
    expect(badgeRules({ ...base, spendCents: 100_000, closed: 2, perLoanCents: 50_000 }, T).watch).toBe(false);
    expect(badgeRules({ ...base, spendCents: 0, closed: 0 }, T).watch).toBe(false);
  });

  it("precedence: Pause? beats Not enough data, which beats every other; Best value is the lowest cost per loan left", () => {
    const events = [
      ...evs(5, "bankrate", 30), // few leads, $1,200, 70 days of history, no loans → Pause? (not Not enough data)
      ...evs(6, "meta", 10, (i) => ({ namesYou: i < 1 })), // few leads and few you can call → Not enough data
      ...evs(30, "lendingtree", 10, (i) => ({ namesYou: i < 6 })), // 20% you can call → Fix permission (even with the cheapest loan)
      ...evs(20, "web-form", 10), // 2 loans at $500 → Best value
      ...evs(20, "google-ads", 10), // 2 loans at $900 → Scale up
      ...evs(20, "zillow", 10), // 2 loans at $1,800 → Watch
    ];
    const loansFor = (key: string, count: number) => events.filter((e) => e.sourceKey === key).slice(0, count).map((e, i) => closedLoan(`${key}${i}`, e.contactId, 5));
    const c = card({
      events: [...events, ev("bankrate", 70, { contactId: "old" })],
      spend: [line("bankrate", 1200, 20), line("meta", 300, 5), line("lendingtree", 200, 5), line("web-form", 1000, 5), line("google-ads", 1800, 5), line("zillow", 3600, 5)],
      loans: [...loansFor("lendingtree", 1), ...loansFor("web-form", 2), ...loansFor("google-ads", 2), ...loansFor("zillow", 2), ...loansFor("meta", 1)],
    });
    const badges = Object.fromEntries(c.rows.map((r) => [r.key, r.badge]));
    expect(badges).toEqual({ [SPHERE_KEY]: "thin", bankrate: "pause", meta: "thin", lendingtree: "fix", "web-form": "best", "google-ads": "scale", zillow: "watch" });
    expect(rowOf(c, "bankrate").leads).toBe(6);
    // Sphere first, then by cost per loan.
    expect(c.rows.map((r) => r.key)).toEqual([SPHERE_KEY, "lendingtree", "meta", "web-form", "google-ads", "zillow", "bankrate"]);
    // Only one Best value, and only with a cost per loan (spend and a closed loan).
    expect(c.rows.filter((r) => r.badge === "best")).toHaveLength(1);
    expect(card({ events: evs(12, "web-form", 3), loans: [] }).rows.some((r) => r.badge === "best")).toBe(false);
  });

  it("the target moves Scale up and Watch, and is kept in range", () => {
    const events = evs(20, "zillow", 10);
    const i = { events, spend: [line("zillow", 3000, 5)], loans: events.slice(0, 2).map((e, k) => closedLoan(`z${k}`, e.contactId, 5)) };
    expect(rowOf(card(i), "zillow").badge).toBe("best");
    // With a second, cheaper source taking Best value, Zillow at $1,500 a loan is Watch under $1,000 and Scale up under $2,000.
    const web = evs(20, "web-form", 10);
    const j = { events: [...events, ...web], spend: [...i.spend, line("web-form", 200, 5)], loans: [...i.loans, ...web.slice(0, 2).map((e, k) => closedLoan(`w${k}`, e.contactId, 5))] };
    expect(rowOf(card(j), "zillow").badge).toBe("watch");
    expect(rowOf(card({ ...j, targetCents: 200_000 }), "zillow").badge).toBe("scale");
    expect(card({ targetCents: 5 }).targetCents).toBe(100_000);
    expect(cleanTarget(250_000)).toBe(250_000);
    expect(cleanTarget(Number.NaN)).toBe(100_000);
    expect(cleanTarget(10_000_001)).toBe(100_000);
    expect(cleanTarget("abc")).toBe(100_000);
  });
});

describe("the Business Manager's lead-source move (D84)", () => {
  const task = (agent: "business", key: string, title: string, why: string, score: number, extra = {}) => ({ key, agent, kind: "task" as const, title, why, contactId: null, loanId: null, playbookId: null, channel: null, subject: "", body: "", amountCents: null, href: null, score, until: null, to: "client" as const, cooldownDays: 7, ...extra });
  const scenario = () => {
    const web = evs(20, "web-form", 10);
    const bank = evs(25, "bankrate", 20, (i) => ({ namesYou: i < 10 }));
    const lt = evs(90, "lendingtree", 20, (i) => ({ namesYou: i < 18, sourceLabel: "LendingTree" }));
    return {
      events: [...web, ...bank, ...lt, ev("bankrate", 85)],
      spend: [line("web-form", 1200, 5), line("bankrate", 1500, 30), line("lendingtree", 2700, 30)],
      loans: [...web.slice(0, 2).map((e, k) => closedLoan(`w${k}`, e.contactId, 5)), closedLoan("lt", lt[0].contactId, 5)],
    };
  };

  it("Pause? gives its budget to the Best value source for 60 days; else Fix permission; else nothing", () => {
    const c = card(scenario());
    const m = leadSourceMove(c);
    expect(m).toMatchObject({ kind: "pause", from: { key: "bankrate" }, to: { key: WEB_FORM_KEY } });
    const p = leadMoveProposal(c, NOW, task)!;
    expect(p).toMatchObject({ key: "lead-source:pause:bankrate:2026-11", agent: "business", kind: "plan", href: "/mlo/leads", title: "Move Bankrate’s budget to your web form for 60 days" });
    expect(p.why).toContain("$1,500 spent in the last 90 days, 26 leads, and no loans closed or in progress.");
    expect(p.why).toContain("Your web form: $600 per closed loan.");
    expect(p.why).toContain("never spends money, contacts a vendor or messages anyone");
    // Without Bankrate's spend, LendingTree (20% you can call) is asked for wording that names you.
    const s = scenario();
    const fix = leadMoveProposal(card({ ...s, spend: s.spend.filter((x) => x.leadSource !== "bankrate") }), NOW, task)!;
    expect(fix).toMatchObject({ key: "lead-source:fix:lendingtree:2026-11", title: "Ask LendingTree for consent wording that names you" });
    expect(fix.why).toContain("90 leads in the last 90 days, and 18 of them (20%)");
    // Nothing to do: no move.
    expect(leadSourceMove(card({ events: evs(20, "web-form", 5) }))).toBeNull();
    // Your own past clients and sphere are never the source a move takes budget from.
    const sphereOnly = card({ events: evs(3, SPHERE_KEY, 70), spend: [line(SPHERE_KEY, 1500, 5)] });
    expect(rowOf(sphereOnly, SPHERE_KEY).badge).toBe("pause");
    expect(leadSourceMove(sphereOnly)).toBeNull();
    // A Pause? with nowhere better to go is a plain pause.
    const lone = leadMoveProposal(card({ events: [ev("bankrate", 80)], spend: [line("bankrate", 1500, 5)] }), NOW, task)!;
    expect(lone.title).toBe("Pause Bankrate for 60 days");
  });

  it("every move's wording passes Compliance; bad wording never does", () => {
    const s = scenario();
    for (const c of [card(s), card({ ...s, spend: s.spend.filter((x) => x.leadSource !== "bankrate") })]) {
      const p = leadMoveProposal(c, NOW, task)!;
      expect(reviewMove(p, "client"), p.title).toEqual({ ok: true });
      expect(findRateMentions(`${p.title}\n${p.why}`)).toEqual([]);
    }
    const ref = "refer" + "rals";
    const bad = [
      `Send a closing gift to agents who send you ${ref}`,
      `Gifts are the cost of a refer${"ral"}`,
      `Pay agents for ${ref} instead of Zillow`,
      `Offer an exclusive deal to one agent`,
      `Buy trigger leads from the credit bureaus`,
      `Buy credit inquiry data for your area`,
      `Text these leads without their permission`,
      `Ignore the opt-outs and call them`,
      `Mention your interest rate of 6.5% in the ad`,
      `Tell them you can get 6.25% today`,
    ];
    for (const b of bad) expect(reviewLeadMove(b).ok, b).toBe(false);
    expect(reviewMove({ key: "lead-source:x", kind: "plan", title: bad[0], why: "", body: "", subject: "", channel: null }, "client").ok).toBe(false);
    expect(reviewLeadMove("").ok).toBe(false);
  });
});

describe("the scorecard with the stores (D84)", () => {
  const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
  const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
  const assistant: User = { ...me, id: "as1", email: "as1@x.com", role: "assistant", assistsUserId: "lo1" };
  const setters = [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setExpenseStoreForTests, setTeamStoreForTests, setCampaignStoreForTests, setPrefsStoreForTests, setLeadEventStoreForTests, setMonthlyStoreForTests] as const;
  beforeEach(() => {
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setExpenseStoreForTests(new MemoryExpenseStore());
    setTeamStoreForTests(new MemoryTeamStore());
    setCampaignStoreForTests(new MemoryCampaignStore());
    setPrefsStoreForTests(new MemoryPrefsStore());
    setLeadEventStoreForTests(new MemoryLeadEventStore());
    setMonthlyStoreForTests(new MemoryMonthlyStore());
  });
  afterEach(() => {
    for (const f of setters) f(null);
  });

  const entry = (owner: string, id: string, leadSource: string | null, dollars: number, date: string, o: Partial<Entry> = {}): Entry => ({ id, ownerUserId: owner, kind: "expense", date, amountCents: dollars * 100, miles: null, vendor: "Vendor", category: "advertising", businessPct: 100, purpose: "", recipient: null, receiptId: null, source: "typed", leadSource, status: "confirmed", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...o });
  const event = (owner: string, key: string, contactId: string, days: number, namesYou = true): LeadEvent => ({ id: `le_${owner}_${contactId}_${days}`, ownerUserId: owner, sourceKey: key, sourceLabel: key === "lendingtree" ? "LendingTree" : key, contactId, at: ago(days), duplicate: false, namesYou, externalId: null, origin: "delivery", datedBy: "delivery" });
  const pLoan = (owner: string, id: string, contactId: string, closedDaysAgo: number): Loan => ({ id, ownerUserId: owner, externalId: id, source: "test", contactId, borrowerName: "B", purpose: null, loanType: null, amount: null, noteRate: null, milestone: "Funded", milestoneAt: ago(closedDaysAgo), history: [], keyDates: { application: dayAgo(closedDaysAgo + 30), lockExpires: null, appraisal: null, clearToClose: null, closing: null }, agentName: null, closed: true, dead: false, updatedAt: NOW.toISOString() });

  async function seed(owner: string) {
    for (let i = 0; i < 25; i++) await leadEventStore().add(event(owner, "bankrate", `b${i}`, 20, i < 10));
    await leadEventStore().add(event(owner, "bankrate", "b-old", 85));
    for (let i = 0; i < 30; i++) await leadEventStore().add(event(owner, "lendingtree", `t${i}`, 20, i < 6));
    for (let i = 0; i < 20; i++) await leadEventStore().add(event(owner, "web-form", `w${i}`, 10));
    await expenseStore().put(entry(owner, `${owner}-e1`, "bankrate", 1500, dayAgo(30)));
    await expenseStore().put(entry(owner, `${owner}-e2`, "web-form", 1200, dayAgo(5)));
    await expenseStore().put(entry(owner, `${owner}-e3`, "web-form", 900, dayAgo(5), { status: "draft" }));
    await pipelineStore().put(pLoan(owner, `${owner}-l1`, "w0", 3));
    await pipelineStore().put(pLoan(owner, `${owner}-l2`, "w1", 4));
  }

  it("reads only the loan officer's own events, confirmed spend, loans and target", async () => {
    await seed("lo1");
    await leadEventStore().add(event("lo2", "zillow", "z1", 3));
    await expenseStore().put(entry("lo2", "x", "zillow", 5000, dayAgo(3)));
    const c = await scorecardFor(me, "90d", NOW);
    expect(c.rows.map((r) => r.key).sort()).toEqual(["bankrate", "lendingtree", SPHERE_KEY, "web-form"].sort());
    expect(rowOf(c, "web-form")).toMatchObject({ spendCents: 120_000, leads: 20, closed: 2, perLoanCents: 60_000, badge: "best" });
    expect(rowOf(c, "lendingtree")).toMatchObject({ label: "LendingTree", badge: "fix", sharePct: 20 });
    expect(c.targetCents).toBe(100_000);
    expect(await setLeadTarget(me, 1500, NOW)).toEqual({ ok: true, cents: 150_000 });
    expect((await prefsFor(me)).leadTargetCents).toBe(150_000);
    expect((await scorecardFor(me, "90d", NOW)).targetCents).toBe(150_000);
    expect(await setLeadTarget(me, 50, NOW)).toEqual({ ok: false, error: "range" });
    expect(await setLeadTarget(me, 100_001, NOW)).toEqual({ ok: false, error: "range" });
    expect(await setLeadTarget(assistant, 1500, NOW)).toEqual({ ok: false, error: "assistant" });
    expect((await prefsFor(other)).leadTargetCents).toBe(100_000);
  });

  it("the snapshot carries the scorecard's numbers, and the team proposes at most one lead-source move per period", async () => {
    await seed("lo1");
    const s = await snapshot(me, NOW);
    expect(s.sources.find((x) => x.key === "web-form")).toMatchObject({ source: "Your web form", spendCents: 120_000, leads: 20, canCall: 20, loans: 2, perLoanCents: 60_000, badge: "best" });
    expect(s.sources.some((x) => x.key === SPHERE_KEY)).toBe(false);
    await saveTeamSettings(me, { enabled: true, sources: ["book", "partners", "leads"], area: "", dailySends: 20, gifts: false, giftCapDollars: 0, goals: {} }, NOW);
    const leadMoves = async () => (await teamStore().moves("lo1", { status: "any" })).filter((m) => m.key.startsWith("lead-source:"));
    await runTeam(me, NOW);
    const [first] = await leadMoves();
    expect(await leadMoves()).toHaveLength(1);
    expect(first).toMatchObject({ key: "lead-source:pause:bankrate:2026-11", agent: "business", kind: "plan", href: "/mlo/leads", contactId: null, amountCents: null, body: "" });
    // The next days, and after a "Not now", nothing new until the period is over.
    await runTeam(me, new Date(NOW.getTime() + DAY));
    expect(await closeMove(me, first.id, "dismissed", new Date(NOW.getTime() + 2 * DAY))).toBe(true);
    await runTeam(me, new Date(NOW.getTime() + 10 * DAY));
    expect(await leadMoves()).toHaveLength(1);
    // A new period: one more at most.
    await runTeam(me, new Date(NOW.getTime() + 31 * DAY));
    await runTeam(me, new Date(NOW.getTime() + 32 * DAY));
    expect((await leadMoves()).length).toBeLessThanOrEqual(2);
    for (const m of await leadMoves()) expect(reviewMove(m, "client")).toEqual({ ok: true });
  });
});
