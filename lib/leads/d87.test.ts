/**
 * D87: the coverage the brief asks for, filled in where D82–D86 left gaps, and the bug fix the audit found.
 *  - the source key: the same key read twice, anything the picker or a vendor sends, length and characters;
 *  - the scorecard on 40 generated books in each period: no NaN or Infinity anywhere, every division null when
 *    there's nothing to divide (zero spend, zero leads, zero loans, zero leads you can call), counts that add up,
 *    and each badge exactly the first rule that matches in the owner's order;
 *  - the split on the same books at 18 budgets: whole dollars that add up, every cap kept, Pause? and paused
 *    sources never funded, the same answer whatever order the rows come in;
 *  - the example-mode switch, every combination of its inputs;
 *  - the lead-event backfill run twice, twice at once, and on the contacts in any order;
 *  - the fix: two runs of the roadmap at once (a page view and the morning run) used to add each step and check-in
 *    twice; their ids are now fixed by their keys.
 */
import { describe, expect, it } from "vitest";
import { teamStore } from "@/lib/agents/store";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { accountStore } from "@/lib/accounts/store";
import { me, NOW, seedBook, useLeadStores } from "@/tests/lead-ask-harness";
import { randomBook, rng } from "@/tests/lead-books";
import { SPHERE_KEY, sourceKey, VENDOR_FILE_KEY, WEB_FORM_KEY } from "./source-key";
import { assignBadges, badgeRules, BADGE_PRECEDENCE, BADGE_RULES, leadScorecard, SCORE_PERIODS, type LeadScorecard, type ScoreContact, type ScoreLoan, type ScoreRow } from "./scorecard";
import { allocatePlan, PLAN_RULES, shareDollars, testCapDollars, type PlanRow } from "./plan";
import { leadPageMode } from "./mode";
import { planLeadEvents, type BackfillContact } from "./backfill";
import { leadEventStore } from "./events";
import { syncLeadEvents } from "./sync";
import { advancePlan, keyedMoveId, savePlan } from "./plan-service";
import { planStore } from "./plan-store";

const DAY = 86_400_000;

describe("D87: the source key", () => {
  const NAMES = ["Zillow", "zillow.com", "Zillow Premier Agent leads", "lead: Zillow", "Lending Tree", "LendingTree - refi", "Bankrate.com leads", "Lower My Bills", "LMB", "Google Ads", "AdWords", "google search", "Facebook", "FB ads", "Instagram", "Meta lead forms", "Website", "web form", "Contact form", "Landing page", "Referral", "Agent referral", "Past client", "SOI", "Friends & family", "Word of mouth", "Repeat client", "Past clients & sphere", "My Local Vendor!", "  spaces   everywhere  ", "Ünïcødé Vendor", "Leads R Us", "123 Leads", "x".repeat(80), "a-b--c", "Open house", "Google Business Profile", VENDOR_FILE_KEY];

  it("reading a key again gives the same key (the picker and Expenses send keys back)", () => {
    for (const n of NAMES) {
      const k = sourceKey(n);
      expect(sourceKey(k), `${n} → ${k}`).toBe(k);
    }
  });

  it("is a lowercase slug of letters, digits and single dashes, at most 30 characters, or empty", () => {
    for (const n of [...NAMES, "", "   ", "!!!", "lead:", "—", null, undefined]) {
      const k = sourceKey(n as string);
      expect(k, String(n)).toMatch(/^(|[a-z0-9]+(-[a-z0-9]+)*)$/);
      expect(k.length).toBeLessThanOrEqual(30);
    }
    for (const n of ["", "   ", "!!!", "lead:", "—"]) expect(sourceKey(n), n).toBe("");
  });

  it("the named sources and the built-in two keep one key however they're written", () => {
    const groups: [string, string[]][] = [
      ["zillow", ["Zillow", "zillow.com", "Zillow Premier Agent leads", "lead: Zillow"]],
      ["lendingtree", ["Lending Tree", "LendingTree - refi"]],
      ["bankrate", ["Bankrate.com leads"]],
      ["lowermybills", ["Lower My Bills", "LMB"]],
      ["google-ads", ["Google Ads", "AdWords", "google search"]],
      ["meta", ["Facebook", "FB ads", "Instagram", "Meta lead forms"]],
      [WEB_FORM_KEY, ["Website", "web form", "Contact form", "Landing page"]],
      [SPHERE_KEY, ["Referral", "Agent referral", "Past client", "SOI", "Friends & family", "Word of mouth", "Repeat client", "Past clients & sphere"]],
    ];
    for (const [key, names] of groups) for (const n of names) expect(sourceKey(n), n).toBe(key);
  });
});

// ---- the scorecard on generated books ----

/** Adds contacts (some past clients or sphere) and a few repeat loans to a generated book, so every credit rule runs. */
function bookWithContacts(seed: number) {
  const b = randomBook(seed);
  const r = rng(seed * 7 + 1);
  const ids = [...new Set(b.events.map((e) => e.contactId))];
  const contacts: ScoreContact[] = ids.map((id) => ({ id, relationship: r() < 0.15 ? "past_client" : r() < 0.1 ? "sphere" : "lead", loan: r() < 0.1 ? { closedOn: new Date(NOW.getTime() - Math.floor(r() * 900) * DAY).toISOString().slice(0, 10) } : null }));
  // People with no lead event at all (past clients and sphere who came back, and someone nobody knows).
  for (let i = 0; i < 4; i++) contacts.push({ id: `p-${seed}-${i}`, relationship: i % 2 ? "past_client" : "sphere", loan: null });
  const extra: ScoreLoan[] = [];
  for (let i = 0; i < 5; i++) {
    const contactId = i < 4 ? `p-${seed}-${i}` : ids[Math.floor(r() * Math.max(1, ids.length))] ?? null;
    const started = Math.floor(r() * 200);
    extra.push({ id: `x-${seed}-${i}`, contactId, closed: r() < 0.5, dead: false, milestoneAt: new Date(NOW.getTime() - Math.max(0, started - 20) * DAY).toISOString(), keyDates: { application: null }, history: r() < 0.8 ? [{ at: new Date(NOW.getTime() - started * DAY).toISOString() }] : [] });
  }
  return { ...b, loans: [...b.loans, ...extra], contacts };
}

const NUMBERS: (keyof ScoreRow)[] = ["spendCents", "leads", "canCall", "sharePct", "perLeadCents", "perCallableCents", "inPipeline", "closed", "perLoanCents", "repeats", "historyDays"];

const scorecards: { seed: number; card: LeadScorecard; book: ReturnType<typeof bookWithContacts> }[] = [];
for (let seed = 1; seed <= 40; seed++) {
  const book = bookWithContacts(seed);
  for (const period of SCORE_PERIODS) scorecards.push({ seed, book, card: leadScorecard({ period, now: NOW, ...book, targetCents: [100_000, 40_000, 300_000][seed % 3] }) });
}

describe("D87: the scorecard on 40 generated books", () => {
  it("never shows NaN or Infinity: every figure is a whole number or null", () => {
    let figures = 0;
    for (const { seed, card } of scorecards) {
      for (const r of card.rows) for (const k of NUMBERS) {
        const v = r[k] as number | null;
        figures++;
        if (v === null) continue;
        expect(Number.isInteger(v), `${seed} ${card.period} ${r.key}.${k}=${v}`).toBe(true);
        expect(v, `${seed} ${card.period} ${r.key}.${k}`).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isInteger(card.undated) && Number.isInteger(card.unattributed)).toBe(true);
    }
    expect(figures).toBeGreaterThan(3000);
  });

  it("every division is null when there's nothing to divide, and the rounded quotient otherwise", () => {
    const seen = { noSpend: 0, noLeads: 0, noLoans: 0, noCallable: 0 };
    for (const { card } of scorecards) for (const r of card.rows) {
      const div = (a: number, b: number) => (a > 0 && b > 0 ? Math.round(a / b) : null);
      expect(r.perLeadCents).toBe(div(r.spendCents, r.leads));
      expect(r.perCallableCents).toBe(div(r.spendCents, r.canCall));
      expect(r.perLoanCents).toBe(div(r.spendCents, r.closed));
      expect(r.sharePct).toBe(r.leads > 0 ? Math.round((100 * r.canCall) / r.leads) : null);
      if (r.spendCents === 0) seen.noSpend++;
      if (r.leads === 0) seen.noLeads++;
      if (r.closed === 0) seen.noLoans++;
      if (r.canCall === 0) seen.noCallable++;
    }
    // The books reach every zero case many times over.
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(20);
  });

  it("counts add up: leads you can call and repeats never exceed leads, and spend is the confirmed tagged lines in the window", () => {
    for (const { book, card } of scorecards) {
      for (const r of card.rows) {
        expect(r.canCall).toBeLessThanOrEqual(r.leads);
        expect(r.repeats).toBeLessThanOrEqual(r.leads);
        expect(r.sharePct === null || (r.sharePct >= 0 && r.sharePct <= 100)).toBe(true);
      }
      const fromDay = card.from.slice(0, 10);
      const toDay = card.to.slice(0, 10);
      const spend = book.spend.filter((s) => s.status === "confirmed" && s.leadSource && s.date >= fromDay && s.date <= toDay).reduce((n, s) => n + Math.max(0, Math.round(s.amountCents * (Number.isFinite(s.businessPct) ? Math.min(100, Math.max(0, s.businessPct)) : 100) / 100)), 0);
      expect(card.rows.reduce((n, r) => n + r.spendCents, 0)).toBe(spend);
      const undated = book.events.filter((e) => e.datedBy === "none").length;
      expect(card.undated).toBe(undated);
      // Each loan counts once at most: closed plus in pipeline is never more than the loans there are.
      expect(card.rows.reduce((n, r) => n + r.closed + r.inPipeline, 0) + card.unattributed).toBeLessThanOrEqual(book.loans.length);
      // Past clients & sphere is always there, first.
      expect(card.rows[0].sphere).toBe(true);
    }
  });

  it("each badge is the first rule that matches in the owner's order (Pause?, Not enough data, Fix permission, Best value, Scale up, Watch)", () => {
    let badged = 0;
    for (const { card } of scorecards) {
      const best = card.rows.filter((r) => r.badge === "best");
      expect(best.length).toBeLessThanOrEqual(1);
      for (const r of card.rows) {
        const m = badgeRules(r, card.targetCents);
        const expected = BADGE_PRECEDENCE.filter((k) => k !== "best").find((k) => m[k as keyof typeof m]) ?? null;
        if (r.badge === "best") {
          // Best value sits between Fix permission and Scale up, and only where no earlier rule matched.
          expect(m.pause || m.thin || m.fix).toBe(false);
          expect(r.closed).toBeGreaterThanOrEqual(BADGE_RULES.bestMinLoans);
          // … the lowest cost per loan among the rows it could go to.
          const eligible = card.rows.filter((o) => { const x = badgeRules(o, card.targetCents); return !x.pause && !x.thin && !x.fix && o.closed >= BADGE_RULES.bestMinLoans && o.perLoanCents !== null; });
          expect(Math.min(...eligible.map((o) => o.perLoanCents!))).toBe(r.perLoanCents);
        } else expect(r.badge, `${r.key}`).toBe(expected);
        if (r.badge) badged++;
      }
    }
    expect(badged).toBeGreaterThan(100);
    // Every badge shows up somewhere in the books.
    const all = new Set(scorecards.flatMap(({ card }) => card.rows.map((r) => r.badge)));
    for (const b of BADGE_PRECEDENCE) expect(all.has(b), b).toBe(true);
  });

  it("assigning badges twice changes nothing (the page and the Business Manager read the same badges)", () => {
    for (const { card } of scorecards.slice(0, 30)) {
      const again = card.rows.map((r) => ({ ...r }));
      assignBadges(again, card.targetCents);
      expect(again.map((r) => r.badge)).toEqual(card.rows.map((r) => r.badge));
    }
  });
});

// ---- the split on the same books ----

const BUDGETS = [100, 149, 150, 151, 500, 750, 999, 1500, 1999, 2000, 2001, 2550, 3000, 4999, 10_000, 33_333, 75_000, 100_000];

describe("D87: the split on the generated books", () => {
  it("whole dollars that add up exactly, every cap kept, never a Pause? or paused source", () => {
    let splits = 0;
    for (const { seed, card } of scorecards.filter((x) => x.card.period === "90d")) {
      const paused = card.rows.filter((r) => !r.sphere).slice(0, seed % 2).map((r) => ({ key: r.key, until: null }));
      for (const budget of BUDGETS) {
        const a = allocatePlan({ budgetCents: budget * 100, rows: card.rows, paused });
        splits++;
        const where = `seed ${seed} $${budget}`;
        expect(a.lines.reduce((n, l) => n + l.cents, 0), where).toBe(budget * 100);
        for (const l of a.lines) {
          expect(l.cents % 100, where).toBe(0);
          expect(l.cents, where).toBeGreaterThanOrEqual(0);
        }
        expect(a.lines[0].kind, where).toBe("sphere");
        for (const l of a.lines.filter((x) => x.kind === "fund")) expect(l.cents, where).toBeLessThanOrEqual(shareDollars(budget) * 100);
        for (const l of a.lines.filter((x) => x.kind === "test")) expect(l.cents, where).toBeLessThanOrEqual(testCapDollars(budget) * 100);
        const slot = a.lines.find((x) => x.kind === "new-test");
        if (budget < PLAN_RULES.testFromDollars) expect(slot, where).toBeUndefined();
        const funded = new Set(a.lines.map((l) => l.key));
        for (const r of card.rows) if (r.badge === "pause" || paused.some((p) => p.key === r.key)) expect(funded.has(r.key), `${where} ${r.key}`).toBe(r.sphere);
        // Nothing is both funded and left out.
        for (const o of a.leftOut) expect(funded.has(o.key), `${where} ${o.key}`).toBe(false);
      }
    }
    expect(splits).toBe(40 * BUDGETS.length);
  });

  it("the same split whatever order the scorecard's rows come in", () => {
    for (const { seed, card } of scorecards.filter((x) => x.card.period === "90d").slice(0, 20)) {
      const r = rng(seed);
      const shuffled: PlanRow[] = [...card.rows].sort(() => r() - 0.5);
      for (const budget of [750, 2000, 5000]) expect(allocatePlan({ budgetCents: budget * 100, rows: shuffled })).toEqual(allocatePlan({ budgetCents: budget * 100, rows: card.rows }));
    }
  });
});

// ---- the example-mode switch ----

describe("D87: the example-mode switch, every combination", () => {
  const C = (o: Partial<BackfillContact> & { kind?: "contact" | "agent" }) => ({ id: "c", kind: "contact" as const, source: "manual", createdAt: NOW.toISOString(), ...o });
  const BOOKS: [string, ReturnType<typeof C>[], boolean][] = [
    ["empty", [], false],
    ["hand-added", [C({ source: "manual" })], false],
    ["an agent from a lead address", [C({ kind: "agent", source: "lead:zillow" })], false],
    ["an import with no lead source", [C({ source: "import:x" })], false],
    ["a delivered lead", [C({ source: "lead:zillow" })], true],
    ["an import with a lead source", [C({ source: "import:x", leadSource: "Referral" })], true],
    ["a lead-vendor file", [C({ source: "import:x", provenance: "lead_vendor" })], true],
  ];

  it("each section is example or real (never both), the plan follows only a saved plan, and assistants never see examples or spend", () => {
    let combos = 0;
    for (const [name, contacts, realBook] of BOOKS) for (const leadEvents of [0, 1]) for (const savedPlan of [false, true]) for (const assistant of [false, true]) {
      combos++;
      const m = leadPageMode({ contacts, leadEvents, savedPlan, assistant });
      const real = realBook || leadEvents > 0;
      const where = `${name} events=${leadEvents} plan=${savedPlan} assistant=${assistant}`;
      expect(m.hasRealLeads, where).toBe(real);
      expect(new Set(m.order).size, where).toBe(m.order.length);
      if (assistant) {
        expect(m, where).toMatchObject({ ask: "off", scorecard: "off", plan: "off", monthly: "off", recent: "real" });
        expect(m.order, where).toEqual(["add", "recent"]);
        continue;
      }
      expect([m.ask, m.scorecard, m.recent], where).toEqual(real ? ["real", "real", "real"] : ["example", "example", "example"]);
      expect(m.plan, where).toBe(savedPlan ? "real" : "example");
      expect(m.monthly, where).toBe("real");
      expect(m.addCard, where).toBe(real ? "compact" : "top");
      expect(m.order[0], where).toBe(real ? "ask" : "add");
      expect([...m.order].sort(), where).toEqual(["add", "ask", "monthly", "plan", "recent", "scorecard"]);
    }
    expect(combos).toBe(BOOKS.length * 8);
  });
});

// ---- the lead-event backfill ----

describe("D87: the lead-event backfill is idempotent", () => {
  useLeadStores();

  const contacts: BackfillContact[] = [
    { id: "a", kind: "contact", source: "lead: Zillow", createdAt: "2026-10-01T10:00:00.000Z" },
    { id: "b", kind: "contact", source: "import:i1", leadSource: "LendingTree", createdAt: "2026-11-01T10:00:00.000Z", importId: "i1", loan: { appliedOn: "2026-09-15" } },
    { id: "c", kind: "contact", source: "import:i1", provenance: "lead_vendor", createdAt: "2026-11-01T10:00:00.000Z", importId: "i1" },
    { id: "d", kind: "contact", source: "import:i2", leadSource: "Referral", createdAt: "2026-11-02T10:00:00.000Z", importId: "i2", loan: { closedOn: "2021-05-01" } },
    { id: "e", kind: "contact", source: "import:i2", leadSource: "Bankrate", createdAt: "2026-11-02T10:00:00.000Z", importId: "i2" },
    { id: "f", kind: "agent", source: "lead: Zillow", createdAt: "2026-11-02T10:00:00.000Z" },
  ];
  const audit = [
    { at: "2026-10-01T10:00:00.000Z", actor: "lead:Zillow", detail: { owner: "lo1", contactId: "a", created: true, permission: "recorded" } },
    { at: "2026-10-05T10:00:00.000Z", actor: "lead:LendingTree", detail: { owner: "lo1", contactId: "a", created: false, permission: "not_naming_us" } },
    { at: "2026-10-06T10:00:00.000Z", actor: "lead:Zillow", detail: { owner: "lo2", contactId: "z", created: true, permission: "recorded" } },
  ];
  const input = { owner: "lo1", contacts, entries: [], audit, history: true, now: NOW };

  it("the same events whatever order the contacts and audit rows come in, and planning twice gives the same ids", () => {
    const once = planLeadEvents(input);
    expect(once.map((e) => [e.contactId, e.sourceKey, e.datedBy, e.duplicate])).toEqual([
      ["a", "zillow", "delivery", false],
      ["a", "lendingtree", "delivery", true],
      ["b", "lendingtree", "application", false],
      ["c", VENDOR_FILE_KEY, "import", false],
      ["d", SPHERE_KEY, "closed", false],
      ["e", "bankrate", "none", false],
    ]);
    const byId = (es: typeof once) => [...es].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(planLeadEvents({ ...input, contacts: [...contacts].reverse(), audit: [...audit].reverse() }))).toEqual(byId(once));
    expect(planLeadEvents(input)).toEqual(once);
    expect(once.every((e) => e.ownerUserId === "lo1")).toBe(true);
  });

  it("syncing twice, or twice at once, adds every lead once", async () => {
    const book: Contact[] = contacts.filter((c) => c.kind === "contact").map((c) => ({ ...c, ownerUserId: "lo1", firstName: c.id, lastName: "X", email: null, phone: null, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "lead", tags: [], notes: null, loan: c.loan ? { closedOn: null, amount: null, noteRate: null, ...c.loan } : null, agent: null, provenance: c.provenance ?? "personal", locked: false, updatedAt: c.createdAt }) as unknown as Contact);
    for (const c of book) await contactStore().put(c);
    for (const a of audit) await accountStore().audit({ ...a, action: "lead.inbound" });
    await Promise.all([syncLeadEvents(me, { now: NOW }), syncLeadEvents(me, { now: NOW }), syncLeadEvents(me, { now: NOW })]);
    const first = await leadEventStore().list("lo1");
    expect(first).toHaveLength(6);
    expect((await syncLeadEvents(me, { now: NOW })).added).toBe(0);
    expect(await leadEventStore().list("lo1")).toEqual(first);
    expect(await leadEventStore().count("lo2")).toBe(0);
  });
});

// ---- the fix: the roadmap run twice at once ----

describe("D87 fix: two runs of the roadmap at once add each step and check-in once", () => {
  useLeadStores();

  it("a page view and the morning run at the same moment make one of each (before D87: two of each)", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    const day31 = new Date(NOW.getTime() + 31 * DAY);
    await Promise.all([advancePlan(me, day31), advancePlan(me, day31), advancePlan(me, day31)]);
    const moves = (await teamStore().moves("lo1", { status: "any", limit: 2000 })).filter((m) => m.key.startsWith("lead-"));
    const keys = moves.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k.startsWith("lead-step:roadmap:"))).toHaveLength(6);
    expect(keys.filter((k) => k.startsWith("lead-source:checkin:"))).toHaveLength(1);
    // The check-in the plan waits on is the one that was kept.
    const checkIn = moves.find((m) => m.key.startsWith("lead-source:checkin:"))!;
    expect(checkIn.id).toBe(keyedMoveId("lo1", checkIn.key));
    expect((await planStore().get("lo1"))!.pending?.moveId).toBe(checkIn.id);
  });

  it("a fixed id belongs to one owner and one key", () => {
    expect(keyedMoveId("lo1", "lead-step:roadmap:2026-11-22:sphere")).toMatch(/^mv_[A-Za-z0-9_-]{12}$/);
    expect(keyedMoveId("lo1", "lead-step:roadmap:2026-11-22:sphere")).not.toBe(keyedMoveId("lo2", "lead-step:roadmap:2026-11-22:sphere"));
    expect(keyedMoveId("lo1", "lead-step:roadmap:2026-11-22:sphere")).not.toBe(keyedMoveId("lo1", "lead-step:roadmap:2026-11-22:wording"));
  });
});

// ---- D87 copy and markup ----

describe("D87: the Lead sources entry and its tap targets", () => {
  it("the owner's words on the page and in the menus, tabs and Home tiles", async () => {
    const { SUBS } = await import("@/lib/content/cc-pages");
    const { DESTS } = await import("@/app/mlo/nav");
    const words = "Where your leads come from, what each source costs, and what to do next.";
    expect(SUBS.leads).toBe(words);
    expect(DESTS.find((d) => d.key === "leads")?.desc).toBe(words);
  });

  it("fold headings and links that stand on their own are 44px targets without moving anything; the estimates group is named", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/mlo/cc-shell.css", "utf8");
    expect(css).toMatch(/\.mlo-section\[data-fold\] > h2:first-child \{ min-height: 44px; box-sizing: border-box; padding-block: 7px; margin-top: -7px; margin-bottom: 1px; \}/);
    expect(css).toMatch(/\.cc-app \.cc-tap \{ display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; margin-block: -12px; margin-block: calc\(\(1lh - 44px\) \/ 2\); \}/);
    const sections = readFileSync("app/mlo/leads/LeadSections.tsx", "utf8");
    expect(sections).toContain('<Link href={`/mlo/contacts/${id}`} className="cc-tap">{name}</Link>');
    expect(sections).toContain('<Link href="/mlo/expenses#drafts" className="cc-tap">');
    expect(readFileSync("app/mlo/leads/plan/page.tsx", "utf8")).toContain('<Link href="/mlo/leads" className="cc-tap">{LEAD_PLAN.back}</Link>');
    expect(readFileSync("app/mlo/leads/plan/PlanParts.tsx", "utf8")).toContain('<div className="cc-lplan-est" role="group" aria-labelledby="lplan-est">');
  });
});

describe("D87: monthly drafts made twice at once", () => {
  useLeadStores();

  it("two runs at the same moment (a page view and the morning run) make one draft per source", async () => {
    const { makeMonthlyDrafts } = await import("./spend");
    const { expenseStore } = await import("@/lib/expenses/store");
    await seedBook();
    await Promise.all([makeMonthlyDrafts(me, NOW), makeMonthlyDrafts(me, NOW), makeMonthlyDrafts(me, NOW)]);
    const drafts = (await expenseStore().list("lo1", null)).filter((e) => e.source === "monthly");
    expect(drafts.map((d) => [d.leadSource, d.status, d.amountCents])).toEqual([["zillow", "draft", 120_000]]);
  });
});
