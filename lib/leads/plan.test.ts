/**
 * D86: the budget planner's pure parts — the six allocation rules and their edges, the estimates (own history only),
 * the 90 days, and the Business Finder's catalog (no prices; every line passes the lead-advice rules).
 */
import { describe, expect, it } from "vitest";
import { reviewLeadMove } from "@/lib/agents/compliance";
import { findRateMentions } from "@/lib/m8/guard";
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { allocatePlan, cleanBudget, dueCheckIn, linePct, nextCheckIn, phasesBegun, planChanges, planDay, planEstimate, PLAN_RULES, rankSources, ROADMAP, sphereDollars, testSlotDollars, type PlanLine, type PlanRow } from "./plan";
import { CATALOG, catalogWords, testCandidates } from "./catalog";
import { SPHERE_KEY } from "./source-key";
import type { ScoreBadge } from "./scorecard";

const DAY = 86_400_000;
const row = (key: string, o: Partial<PlanRow> = {}): PlanRow => ({ key, label: key, sphere: false, spendCents: 0, leads: 0, canCall: 0, closed: 0, perLoanCents: null, perCallableCents: null, badge: null, ...o });
const sphere = row(SPHERE_KEY, { label: "Past clients & sphere", sphere: true });
/** A paid source with its spend, leads, callable leads and closed loans; per-figures worked out like the scorecard. */
const paid = (key: string, spend: number, leads: number, canCall: number, closed: number, badge: ScoreBadge | null = null): PlanRow =>
  row(key, { label: key[0].toUpperCase() + key.slice(1), spendCents: spend * 100, leads, canCall, closed, perLoanCents: closed ? Math.round((spend * 100) / closed) : null, perCallableCents: canCall ? Math.round((spend * 100) / canCall) : null, badge });
const split = (budget: number, rows: PlanRow[], paused?: { key: string; until: string | null }[]) => allocatePlan({ budgetCents: budget * 100, rows, paused });
const dollars = (a: ReturnType<typeof split>) => a.lines.map((l) => [l.key, l.kind, l.cents / 100]);
const sum = (a: ReturnType<typeof split>) => a.lines.reduce((n, l) => n + l.cents, 0);

const web = paid("web", 1200, 20, 20, 2, "scale"); // $600 per loan
const zillow = paid("zillow", 3600, 40, 40, 2, "watch"); // $1,800 per loan

describe("the split (D86 rules 1–6)", () => {
  it("rule 1: past clients & sphere first, with a small amount (10%, $150–$250, rounded down to $50)", () => {
    expect([750, 1500, 2600, 3000, 100_000].map(sphereDollars)).toEqual([150, 150, 250, 250, 250]);
    expect(sphereDollars(100)).toBe(100);
    expect(sphereDollars(150)).toBe(150);
    expect(split(1500, [sphere]).lines[0]).toMatchObject({ key: SPHERE_KEY, kind: "sphere", cents: 15_000, label: "Past clients & sphere" });
  });

  it("the mockup's $1,500: sphere $150, the best source up to its share ($900), the next gets what's left", () => {
    expect(dollars(split(1500, [sphere, zillow, web]))).toEqual([[SPHERE_KEY, "sphere", 150], ["web", "fund", 900], ["zillow", "fund", 450]]);
    const a = split(1500, [sphere, zillow, web]);
    expect(a.lines.find((l) => l.key === "web")).toMatchObject({ rank: 1, rankedBy: "loan", capped: true });
    expect(a.lines.find((l) => l.key === "zillow")).toMatchObject({ rank: 2, capped: false });
  });

  it("rule 4: from $2,000 a month one test slot of at most 20% (rounded down to $50); none below", () => {
    expect(testSlotDollars(1999)).toBe(0);
    expect(testSlotDollars(2000)).toBe(400);
    expect(testSlotDollars(3000)).toBe(600);
    expect(testSlotDollars(2124)).toBe(400);
    expect(dollars(split(2000, [sphere, web]))).toEqual([[SPHERE_KEY, "sphere", 200], ["web", "fund", 1200], ["new-test", "new-test", 400], ["reserve", "reserve", 200]]);
    expect(split(1999, [sphere, web]).lines.some((l) => l.kind === "new-test")).toBe(false);
    expect(dollars(split(3000, [sphere, zillow, web]))).toEqual([[SPHERE_KEY, "sphere", 250], ["web", "fund", 1800], ["zillow", "fund", 350], ["new-test", "new-test", 600]]);
    for (const b of [2000, 2050, 3000, 10_000, 100_000]) {
      const t = split(b, [sphere]).lines.find((l) => l.kind === "new-test")!;
      expect(t.cents).toBeLessThanOrEqual(b * 100 * 0.2);
    }
  });

  it("rule 2: ranked by cost per loan; fewer than 2 loans ranked by cost per lead you can call, after them", () => {
    const cheapOne = paid("onelone", 100, 10, 10, 1); // $100 per loan but only 1 loan: ranked by $10 per lead you can call
    const lt = paid("lendingtree", 2700, 90, 18, 1); // $150 per lead you can call
    const r = rankSources([lt, cheapOne, zillow, web]).map((x) => [x.row.key, x.by]);
    expect(r).toEqual([["web", "loan"], ["zillow", "loan"], ["onelone", "callable"], ["lendingtree", "callable"]]);
    // No leads you can call: last of its group.
    const none = paid("nocall", 500, 12, 0, 0);
    expect(rankSources([none, lt]).map((x) => x.row.key)).toEqual(["lendingtree", "nocall"]);
  });

  it("rule 5: Pause? sources are left out (and paused ones, and sources with no spend can't be ranked)", () => {
    const br = paid("bankrate", 1500, 25, 10, 0, "pause");
    const a = split(1500, [sphere, br, web, row("free", { leads: 4 })], [{ key: "zillow", until: "2027-01-20T00:00:00.000Z" }]);
    expect(a.lines.map((l) => l.key)).not.toContain("bankrate");
    expect(a.leftOut).toEqual([
      { key: "bankrate", label: "Bankrate", reason: "pause", spendCents: 150_000 },
      { key: "free", label: "free", reason: "noSpend", spendCents: 0 },
    ]);
    const b = split(1500, [sphere, zillow, web], [{ key: "zillow", until: "2027-01-20T00:00:00.000Z" }]);
    expect(b.leftOut).toEqual([{ key: "zillow", label: "Zillow", reason: "paused", spendCents: 360_000, until: "2027-01-20T00:00:00.000Z" }]);
    expect(dollars(b)).toEqual([[SPHERE_KEY, "sphere", 150], ["web", "fund", 900], ["reserve", "reserve", 450]]);
  });

  it("every source Pause?: the sphere and the reserve, the sources listed as left out", () => {
    const a = split(1500, [sphere, paid("a", 2000, 30, 30, 0, "pause"), paid("b", 1100, 12, 6, 0, "pause")]);
    expect(dollars(a)).toEqual([[SPHERE_KEY, "sphere", 150], ["reserve", "reserve", 1350]]);
    expect(a.leftOut.map((o) => [o.key, o.reason])).toEqual([["a", "pause"], ["b", "pause"]]);
  });

  it("rule 6: Not enough data sources are capped as tests (at most 20% of the budget each)", () => {
    const thin = paid("meta", 300, 6, 6, 0, "thin");
    const a = split(1500, [sphere, thin]);
    expect(dollars(a)).toEqual([[SPHERE_KEY, "sphere", 150], ["meta", "test", 300], ["reserve", "reserve", 1050]]);
    expect(a.lines.find((l) => l.key === "meta")).toMatchObject({ capped: true, rankedBy: "callable" });
    // Funded lines come first, tests after them, then the new-source slot and the reserve.
    const b = split(3000, [sphere, thin, web]);
    expect(b.lines.map((l) => l.kind)).toEqual(["sphere", "fund", "test", "new-test"]);
    expect(b.lines.find((l) => l.key === "meta")!.cents).toBe(35_000);
    expect(split(3000, [sphere, thin]).lines.find((l) => l.key === "meta")!.cents).toBe(60_000);
  });

  it("no sources at all: the sphere, the test slot from $2,000, the rest in reserve", () => {
    expect(dollars(split(1500, []))).toEqual([[SPHERE_KEY, "sphere", 150], ["reserve", "reserve", 1350]]);
    expect(dollars(split(5000, [sphere]))).toEqual([[SPHERE_KEY, "sphere", 250], ["new-test", "new-test", 1000], ["reserve", "reserve", 3750]]);
  });

  it("a budget under the sphere's small amount goes all to the sphere; sources with no room are listed", () => {
    const a = split(120, [sphere, web, zillow]);
    expect(dollars(a)).toEqual([[SPHERE_KEY, "sphere", 120]]);
    expect(a.leftOut.map((o) => [o.key, o.reason])).toEqual([["web", "budget"], ["zillow", "budget"]]);
  });

  it("ties are broken the same way every time (label, then key), whatever order the rows come in", () => {
    const a1 = paid("alpha", 1000, 10, 10, 2);
    const b1 = { ...paid("beta", 1000, 10, 10, 2) };
    const c1 = { ...paid("gamma", 1000, 10, 10, 2) };
    const orders = [[a1, b1, c1], [c1, b1, a1], [b1, c1, a1]];
    const outs = orders.map((o) => JSON.stringify(split(3000, [sphere, ...o])));
    expect(new Set(outs).size).toBe(1);
    const t = split(3000, [sphere, c1, a1, b1]);
    expect(t.lines.filter((l) => l.kind === "fund").map((l) => [l.key, l.cents / 100])).toEqual([["alpha", 1800], ["beta", 350]]);
    expect(t.leftOut).toEqual([{ key: "gamma", label: "Gamma", reason: "budget", spendCents: 100_000 }]);
    // Same label, different keys.
    const x = { ...paid("k2", 500, 10, 5, 0), label: "Same" };
    const y = { ...paid("k1", 500, 10, 5, 0), label: "Same" };
    expect(split(1500, [y, x]).lines.filter((l) => l.kind === "fund").map((l) => l.key)).toEqual(["k1", "k2"]);
    expect(split(1500, [x, y])).toEqual(split(1500, [y, x]));
  });

  it("whole dollars that add up to the budget exactly, for every budget and source mix", () => {
    const mixes: PlanRow[][] = [[], [sphere], [sphere, web], [sphere, web, zillow], [sphere, paid("t", 333, 7, 3, 0, "thin"), paid("p", 1234, 31, 2, 0, "pause"), paid("f", 777, 40, 9, 0, "fix"), web, zillow]];
    for (const b of [100, 101, 149, 150, 151, 333, 750, 999, 1500, 1999, 2000, 2001, 2999, 3000, 4321, 12_345, 99_999, 100_000]) {
      for (const m of mixes) {
        const a = split(b, m);
        expect(sum(a), `${b}`).toBe(b * 100);
        for (const l of a.lines) {
          expect(l.cents % 100, `${b} ${l.key}`).toBe(0);
          expect(l.cents).toBeGreaterThan(0);
          expect(l.cents).toBeLessThanOrEqual(b * 100);
          if (l.kind === "fund") expect(l.cents).toBeLessThanOrEqual(Math.floor(b * PLAN_RULES.sharePct / 100) * 100);
          if (l.kind === "test") expect(l.cents).toBeLessThanOrEqual(Math.floor(b * PLAN_RULES.testPct / 100) * 100);
        }
        expect(JSON.stringify(split(b, m))).toBe(JSON.stringify(a));
      }
    }
  });

  it("keeps the budget's range and the presets in one config", () => {
    expect(PLAN_RULES.presetsDollars).toEqual([750, 1500, 3000]);
    expect([cleanBudget(1500), cleanBudget("750"), cleanBudget(99), cleanBudget(100_001), cleanBudget("abc"), cleanBudget(1500.4)]).toEqual([1500, 750, null, null, null, 1500]);
    expect(linePct({ cents: 90_000 }, 150_000)).toBe(60);
  });
});

describe("estimates (D86: own history only)", () => {
  const lines = split(1500, [sphere, zillow, web]).lines;
  it("no history: no estimate (never someone else's numbers)", () => {
    expect(planEstimate(lines, [])).toBeNull();
    expect(planEstimate(lines, [{ period: "90d", rows: [{ key: "web", spendCents: 0, leads: 5, closed: 1 }] }])).toBeNull();
    expect(planEstimate(split(1500, []).lines, [{ period: "90d", rows: [web, zillow] }])).toBeNull();
  });
  it("a range across the loan officer's own periods: dollars × leads (and loans) per dollar, summed", () => {
    // 90 days: web $900 × 20/$1,200 = 15 leads, 1.5 loans; Zillow $450 × 40/$3,600 = 5 leads, 0.25 loans → 20 and 1.75.
    // 30 days: web only, $1,200 → 10 leads and 1 loan: $900 → 7.5 leads, 0.75 loans.
    const e = planEstimate(lines, [
      { period: "30d", rows: [{ key: "web", spendCents: 120_000, leads: 10, closed: 1 }] },
      { period: "90d", rows: [web, zillow] },
    ]);
    expect(e).toEqual({ leads: [7, 20], loans: [0, 2], periods: ["30d", "90d"] });
  });
  it("one period gives one figure; the new-source slot and the reserve are never counted", () => {
    const e = planEstimate(lines, [{ period: "90d", rows: [web, zillow, { key: "reserve", spendCents: 100, leads: 1000, closed: 1000 }, { key: "new-test", spendCents: 100, leads: 1000, closed: 1000 }] }]);
    expect(e).toEqual({ leads: [20, 20], loans: [1, 2], periods: ["90d"] });
    expect(LEAD_PLAN.estimate.range(20, 20)).toBe("About 20");
    expect(LEAD_PLAN.estimate.range(7, 20)).toBe("7–20");
    expect(LEAD_PLAN.estimate.note(["30d", "90d", "year"])).toContain("Estimates from your own last 30 days, last 90 days and this year so far");
  });
});

describe("the 90 days (D86)", () => {
  const start = "2026-11-23T18:00:00.000Z";
  const at = (days: number) => new Date(Date.parse(start) + days * DAY);
  it("day X of 90, the next check-in, the check-in due and the phases begun", () => {
    expect([0, 0.5, 1, 29, 30, 89, 90, 120].map((d) => planDay(start, at(d)))).toEqual([1, 1, 2, 30, 31, 90, 91, 121]);
    expect(nextCheckIn(start, at(0))!.toISOString()).toBe(at(30).toISOString());
    expect(nextCheckIn(start, at(30))!.toISOString()).toBe(at(60).toISOString());
    expect(nextCheckIn(start, at(90))).toBeNull();
    expect([29, 30, 59, 60, 90, 200].map((d) => dueCheckIn(start, at(d)))).toEqual([null, 30, 30, 60, 90, 90]);
    expect([0, 29, 30, 60, 200].map((d) => phasesBegun(start, at(d)))).toEqual([[0], [0], [0, 1], [0, 1, 2], [0, 1, 2]]);
  });
  it("three phases of three steps, as in the mockup", () => {
    expect(ROADMAP.map((p) => [p.from, p.to, p.steps.length])).toEqual([[1, 30, 3], [31, 60, 3], [61, 90, 3]]);
    expect(LEAD_PLAN.roadmap.phases.map((p) => p.name)).toEqual(["Free first", "One paid test", "Scale or cut"]);
    for (const p of ROADMAP) for (const s of p.steps) expect(s.href).toMatch(/^\/mlo\//);
  });
  it("what changed between two splits, biggest change first (the test slot and reserve aren't sources)", () => {
    const before = split(1500, [sphere, zillow, web]).lines;
    const after = split(1500, [sphere, zillow, web], [{ key: "zillow", until: null }]).lines;
    expect(planChanges(before, after).map((c) => [c.key, c.fromCents / 100, c.toCents / 100])).toEqual([["zillow", 450, 0]]);
    expect(planChanges(before, before)).toEqual([]);
    const plus: PlanLine[] = [...after, { ...after[1], key: "meta", label: "Meta", cents: 30_000 }];
    expect(planChanges(after, plus).map((c) => c.key)).toEqual(["meta"]);
  });
});

describe("the Business Finder's catalog (D86)", () => {
  it("six types, each with setup steps and a permission note; only marketplaces carry the cost line", () => {
    expect(CATALOG.map((t) => t.id)).toEqual(["web-form-ads", "meta", "google-business", "open-houses", "sphere-campaigns", "marketplaces"]);
    for (const t of CATALOG) {
      const w = catalogWords(t);
      expect(w.steps.length, t.id).toBeGreaterThanOrEqual(3);
      expect(w.permission.length).toBeGreaterThan(20);
      expect(w.rules.length).toBeGreaterThan(20);
    }
    expect(CATALOG.filter((t) => t.marketplace).map((t) => t.id)).toEqual(["marketplaces"]);
    expect(LEAD_PLAN.catalog.cost).toBe("Cost comes from your own spend once you test it.");
  });
  it("shows no prices: no dollar figure, price or per-lead cost anywhere in it", () => {
    const text = JSON.stringify(LEAD_PLAN.catalog);
    expect(text).not.toMatch(/\$\s?\d|\d+\s*(dollars|a lead|per lead|a month)|\bprice[sd]?\b|\bcosts? (about|around|from \$)/i);
  });
  it("the open-house line says nothing of value is exchanged; Meta and search ads follow the housing-ad rules", () => {
    const oh = catalogWords({ id: "open-houses" });
    expect(oh.what).toContain("Nothing of value changes hands");
    expect(oh.rules).toContain("Nothing of value is exchanged");
    expect(catalogWords({ id: "meta" }).steps.join(" ")).toContain("Special Ad Category for housing");
    expect(catalogWords({ id: "meta" }).rules).toMatch(/Fair housing/);
    expect(catalogWords({ id: "web-form-ads" }).rules).toMatch(/housing ads/);
  });
  it("suggests types not already in use, in catalog order, never the sphere", () => {
    expect(testCandidates([]).map((t) => t.id)).toEqual(["web-form-ads", "meta"]);
    expect(testCandidates([{ key: "web-form", leads: 3, spendCents: 0 }, { key: "zillow", leads: 4, spendCents: 1 }]).map((t) => t.id)).toEqual(["meta", "google-business"]);
    expect(testCandidates([], ["Facebook leads", "Google Ads"], 3).map((t) => t.id)).toEqual(["google-business", "open-houses", "marketplaces"]);
    expect(testCandidates([{ key: "meta", leads: 0, spendCents: 0 }]).map((t) => t.id)).toEqual(["web-form-ads", "meta"]);
  });
});

describe("the planner's words (D86)", () => {
  const P = LEAD_PLAN;
  const W = P.split.why;
  const all = [
    P.title, P.assistant, P.saved.line("$1,500", 5, 90), P.saved.over, P.saved.keeps, P.budget.targetHelp("$1,000"), P.budget.custom,
    ...P.split.rules({ sphereMin: "$150", sphereMax: "$250", spherePct: 10, share: 60, testFrom: "$2,000", testPct: 20, testDays: 60, rankLoans: 2 }),
    W.sphere, W.bestLoan("$600"), W.loan("$1,800", 2), W.callable("$150", 3), W.noCallable(4), W.capped(60), W.thin(6, 60), W.newTest(60), W.suggests("Meta lead forms"), W.reserveNone, W.reserveCap,
    P.split.leftOut.pause("Bankrate", "$1,500"), P.split.leftOut.paused("Zillow", "Jan 20"), P.split.leftOut.noSpend("Your web form"), P.split.leftOut.budget("Zillow"), P.split.never, P.split.noSources,
    P.estimate.note(["90d"]), P.estimate.none, P.estimate.leftOut, P.roadmap.intro,
    ...Object.values(P.roadmap.steps).flatMap((s) => [typeof s.title === "function" ? s.title("$1,000") : s.title, s.why]),
    ...Object.values(P.catalog.types).flatMap((t) => [t.name, t.what, ...t.steps, t.permission, t.rules]), P.catalog.intro, P.catalog.cost,
    P.save.saved, P.save.changed, P.save.restarted, P.checkin.update(30), P.checkin.keep(60), P.checkin.whyChange("Zillow from $450 to $0"), P.checkin.whySame, P.checkin.end,
    P.approved.setAmount("Zillow", "$0"), P.approved.setAmountWhy("$450", "$0"), P.approved.pauseWhy, P.approved.fixWhy, P.approved.done(2, true), P.approved.done(1, false),
  ];

  it("every line passes the lead-advice rules: no gift for referrals, no paying for them, no credit-check lists, no contact without a yes, no rates", () => {
    for (const t of all) {
      expect(reviewLeadMove(t), t).toEqual({ ok: true });
      expect(findRateMentions(t), t).toEqual([]);
    }
    // The guardrail chips are the rules said as "never" (the one about credit-check leads names them on purpose).
    expect(P.save.guardrails).toEqual(["No trigger leads", "Nothing of value for referrals (RESPA)", "You approve every dollar"]);
    expect(reviewLeadMove(P.save.guardrails[1])).toEqual({ ok: true });
  });

  it("no banned words, no promises, and every estimate is labeled as one", () => {
    const text = all.join("\n").toLowerCase();
    const banned = ["guaran" + "teed", "best " + "rates", "lowest " + "rates", "commis" + "sion", "referral " + "fee", "act " + "now", "hur" + "ry", "limited " + "time", "national " + "average", "industry " + "average"];
    for (const b of banned) expect(text).not.toContain(b);
    expect(text).not.toMatch(/\bwill (get|close|make|earn)\b|\byou'?ll (get|close|earn)\b/);
    expect(P.estimate.title).toBe("Estimates");
    expect(P.estimate.note(["90d"])).toMatch(/^Estimates from your own/);
  });
});
