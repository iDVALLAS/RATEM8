/**
 * D86: the saved plan with the stores — Save (own book, assistants refused), re-saving (history, the same 90 days, no
 * duplicate steps), the roadmap's steps on Today by phase, the Business Manager's 30-day check-ins, Approve on a
 * lead-source move (updates the plan and adds steps, nothing else), the plan card's switch from example to real, the
 * Concierge's pack and Download everything. The Neon plan store binds every value.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { teamStore, type Move } from "@/lib/agents/store";
import { leadPackFor } from "@/lib/concierge/desk";
import { buildExport } from "@/lib/export/service";
import { expenseStore } from "@/lib/expenses/store";
import { touchStore } from "@/lib/messaging/store";
import { monthlyStore } from "@/lib/leads/spend";
import { accountStore } from "@/lib/accounts/store";
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { assistant, me, NOW, other, seedBook, useLeadStores } from "@/tests/lead-ask-harness";
import { leadPageMode } from "./mode";
import { packContext } from "./ask";
import { NeonPlanStore, planStore } from "./plan-store";
import { advancePlan, approveLeadMove, plannerFor, planView, savePlan } from "./plan-service";

const DAY = 86_400_000;
const later = (days: number) => new Date(NOW.getTime() + days * DAY);
const steps = async (owner = "lo1", status: "open" | "any" = "any") => (await teamStore().moves(owner, { status, limit: 2000 })).filter((m) => m.key.startsWith("lead-step:"));
const leadMoves = async (owner = "lo1") => (await teamStore().moves(owner, { status: "any", limit: 2000 })).filter((m) => m.key.startsWith("lead-source:"));
const move = (key: string, o: Partial<Move> = {}): Move => ({ id: `mv_${key.replace(/\W/g, "")}`, key, ownerUserId: "lo1", agent: "business", kind: "plan", title: "Pause Your web form for 60 days", why: "Your web form: $1,200 spent.", contactId: null, loanId: null, playbookId: null, channel: null, subject: "", body: "", amountCents: null, href: "/mlo/leads", gift: null, score: 50, status: "open", note: "", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), until: null, ...o });

describe("the planner with the loan officer's own numbers (D86)", () => {
  useLeadStores();

  it("splits from their own 90-day scorecard: sphere first, the best source to its share, Pause? and no-spend sources left out", async () => {
    await seedBook();
    const p = await plannerFor(me, 150_000, NOW);
    expect(p.alloc.lines.map((l) => [l.key, l.cents / 100])).toEqual([["past-clients-sphere", 150], ["web-form", 900], ["reserve", 450]]);
    expect(p.alloc.leftOut.map((o) => [o.key, o.reason])).toEqual([["bankrate", "pause"], ["lendingtree", "noSpend"]]);
    expect(p.targetCents).toBe(100_000);
    // Estimates from their own periods: the web form, $900 of its $1,200 → 15 leads and 1.5 loans in each window.
    expect(p.estimate).toEqual({ leads: [15, 15], loans: [1, 2], periods: ["30d", "90d", "year"] });
    expect(p.suggestions.map((s) => s.id)).toEqual(["meta", "google-business"]);
    // Another loan officer's book is theirs alone.
    expect((await plannerFor(other, 150_000, NOW)).alloc.lines.map((l) => l.key)).toEqual(["past-clients-sphere", "reserve"]);
    expect((await plannerFor(other, 150_000, NOW)).estimate).toBeNull();
  });

  it("Save stores the plan (own book only) and adds the first 30 days' steps to Today; assistants and bad budgets are refused", async () => {
    await seedBook();
    expect(await savePlan(assistant, 1500, NOW)).toEqual({ ok: false, error: "assistant" });
    expect(await savePlan(me, 50, NOW)).toEqual({ ok: false, error: "range" });
    expect(await planStore().get("lo1")).toBeNull();
    expect(await savePlan(me, 1500, NOW)).toEqual({ ok: true, kind: "new", steps: 3 });
    const plan = (await planStore().get("lo1"))!;
    expect(plan).toMatchObject({ ownerUserId: "lo1", budgetCents: 150_000, targetCents: 100_000, startedAt: NOW.toISOString(), why: "saved", history: [], pending: null });
    expect(plan.lines.reduce((n, l) => n + l.cents, 0)).toBe(150_000);
    expect(await planStore().get("lo2")).toBeNull();
    const s = await steps();
    expect(s.map((m) => m.title)).toEqual(expect.arrayContaining([LEAD_PLAN.roadmap.steps.sphere.title, LEAD_PLAN.roadmap.steps.wording.title, LEAD_PLAN.roadmap.steps.tag.title]));
    for (const m of s) {
      expect(m).toMatchObject({ agent: "business", kind: "plan", contactId: null, status: "open", body: "", amountCents: null });
      expect(m.key).toMatch(/^lead-step:roadmap:2026-11-22:/);
      expect(m.href).toMatch(/^\/mlo\//);
      expect(m.why).toMatch(/^Days 1–30 · Free first\. /);
    }
    // Nothing spent, sent or signed up for: no expense, message or monthly amount was written.
    expect((await expenseStore().list("lo1", null)).map((e) => e.id).sort()).toEqual(["lo1-e1", "lo1-e2"]);
    expect(await touchStore().since("lo1", "1970-01-01T00:00:00.000Z")).toEqual([]);
    expect((await monthlyStore().list("lo1")).map((m) => [m.sourceKey, m.cents])).toEqual([["zillow", 120_000]]);
    const audit = await accountStore().recentAudit(50);
    expect(audit.find((a) => a.action === "lead.plan.save")).toMatchObject({ actor: "lo1@x.com", detail: { budgetCents: 150_000, kind: "new", steps: 3 } });
  });

  it("re-saving replaces the plan within its 90 days: same start, the old version in history, no duplicate steps", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    expect(await savePlan(me, 3000, later(2))).toEqual({ ok: true, kind: "changed", steps: 0 });
    expect(await savePlan(me, 3000, later(2))).toEqual({ ok: true, kind: "changed", steps: 0 });
    const plan = (await planStore().get("lo1"))!;
    expect(plan.startedAt).toBe(NOW.toISOString());
    expect(plan.budgetCents).toBe(300_000);
    expect(plan.history.map((h) => h.budgetCents)).toEqual([300_000, 150_000]);
    expect(plan.lines.some((l) => l.kind === "new-test")).toBe(true);
    expect((await steps()).length).toBe(3);
    expect((await advancePlan(me, later(3))).steps).toBe(0);
  });

  it("each phase's steps arrive once when its 30 days begin; the Business Manager checks in at day 30, 60 and 90", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    expect(await advancePlan(me, later(29))).toEqual({ steps: 0, checkIn: false });
    expect(await advancePlan(me, later(30))).toEqual({ steps: 3, checkIn: true });
    expect(await advancePlan(me, later(31))).toEqual({ steps: 0, checkIn: false });
    const c30 = (await leadMoves()).find((m) => m.key === "lead-source:checkin:2026-11-22:30")!;
    expect(c30).toMatchObject({ agent: "business", kind: "plan", href: "/mlo/leads", contactId: null, title: LEAD_PLAN.checkin.keep(30) });
    expect(c30.why).toContain(LEAD_PLAN.checkin.whySame);
    expect((await planStore().get("lo1"))!.pending).toMatchObject({ moveId: c30.id, day: 30, budgetCents: 150_000 });
    expect(await advancePlan(me, later(61))).toEqual({ steps: 3, checkIn: true });
    expect((await steps()).map((m) => m.key.split(":").pop())).toEqual(expect.arrayContaining(["sphere", "wording", "tag", "move", "cap", "answer", "keep", "pause", "rerun"]));
    expect((await steps()).length).toBe(9);
    expect((await steps()).find((m) => m.key.endsWith(":keep"))!.title).toBe("Keep sources at or under your $1,000 target cost per loan");
    await advancePlan(me, later(95));
    expect((await leadMoves()).map((m) => m.key).sort()).toEqual(["lead-source:checkin:2026-11-22:30", "lead-source:checkin:2026-11-22:60", "lead-source:checkin:2026-11-22:90"]);
    expect((await leadMoves()).find((m) => m.key.endsWith(":90"))!.why).toContain(LEAD_PLAN.checkin.end);
  });

  it("a check-in proposes the split today's scorecard gives, and Approve applies it and adds the change as a step", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    // A month later Zillow's $1,200 is confirmed spend (no leads yet, so Not enough data): the check-in gives it a test.
    await expenseStore().put({ id: "lo1-z", ownerUserId: "lo1", kind: "expense", date: later(25).toISOString().slice(0, 10), amountCents: 120_000, miles: null, vendor: "Zillow", category: "advertising", businessPct: 100, purpose: "", recipient: null, receiptId: null, source: "typed", leadSource: "zillow", status: "confirmed", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    await advancePlan(me, later(30));
    const c = (await leadMoves()).find((m) => m.key.endsWith(":30"))!;
    expect(c.title).toBe(LEAD_PLAN.checkin.update(30));
    expect(c.why).toMatch(/Zillow from \$0 to \$300/);
    const r = await approveLeadMove(me, c.id, later(31));
    expect(r).toEqual({ ok: true, planUpdated: true, steps: 1 });
    const plan = (await planStore().get("lo1"))!;
    expect(plan.lines.find((l) => l.key === "zillow")).toMatchObject({ cents: 30_000, kind: "test" });
    expect(plan).toMatchObject({ why: "checkin", pending: null, startedAt: NOW.toISOString() });
    expect(plan.history[0].why).toBe("saved");
    expect((await teamStore().move(c.id))!.status).toBe("done");
    expect((await steps()).find((m) => m.key.startsWith(`lead-step:approved:${c.id}`))!.title).toBe("Set Zillow’s monthly amount to $300");
    // Approving again finds nothing waiting; nothing doubles.
    expect(await approveLeadMove(me, c.id, later(32))).toEqual({ ok: false, error: "gone" });
    expect((await steps()).filter((m) => m.key.startsWith("lead-step:approved:")).length).toBe(1);
  });

  it("Approve on the Business Manager's pause updates only the saved plan and adds tasks: never money, a vendor or a message", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    const before = { exp: await expenseStore().list("lo1", null), monthly: await monthlyStore().list("lo1") };
    const m = move("lead-source:pause:web-form:2026-11");
    await teamStore().putMove(m);
    const r = await approveLeadMove(me, m.id, later(1));
    expect(r).toEqual({ ok: true, planUpdated: true, steps: 2 });
    const plan = (await planStore().get("lo1"))!;
    expect(plan.lines.map((l) => [l.key, l.cents / 100])).toEqual([["past-clients-sphere", 150], ["reserve", 1350]]);
    expect(plan.paused).toEqual([{ key: "web-form", label: "Your web form", until: later(61).toISOString() }]);
    expect(plan.why).toBe("approved");
    expect(plan.history).toHaveLength(1);
    const added = (await steps()).filter((x) => x.key.startsWith(`lead-step:approved:${m.id}`)).map((x) => x.title);
    expect(added).toEqual(["Pause Your web form for 60 days", "Set Your web form’s monthly amount to $0"]);
    expect((await teamStore().move(m.id))!).toMatchObject({ status: "done", note: LEAD_PLAN.approved.done(2, true) });
    expect(await expenseStore().list("lo1", null)).toEqual(before.exp);
    expect(await monthlyStore().list("lo1")).toEqual(before.monthly);
    expect(await touchStore().since("lo1", "1970-01-01T00:00:00.000Z")).toEqual([]);
    // The planner keeps it out until the pause ends, then it's back.
    expect((await plannerFor(me, 150_000, later(10))).alloc.leftOut.find((o) => o.key === "web-form")).toMatchObject({ reason: "paused" });
    expect((await plannerFor(me, 150_000, later(62))).alloc.lines.map((l) => l.key)).toContain("web-form");
  });

  it("Approve on a permission fix adds its step and changes no dollars; with no plan saved, only steps are added", async () => {
    await seedBook();
    const fix = move("lead-source:fix:lendingtree:2026-11", { title: "Ask LendingTree for consent wording that names you", why: "LendingTree: 30 leads." });
    await teamStore().putMove(fix);
    expect(await approveLeadMove(me, fix.id, NOW)).toEqual({ ok: true, planUpdated: false, steps: 1 });
    expect(await planStore().get("lo1")).toBeNull();
    expect((await steps()).map((x) => x.title)).toEqual(["Ask LendingTree for consent wording that names you"]);
    const pause = move("lead-source:pause:bankrate:2026-11", { title: "Pause Bankrate for 60 days" });
    await teamStore().putMove(pause);
    expect(await approveLeadMove(me, pause.id, NOW)).toEqual({ ok: true, planUpdated: false, steps: 1 });
    // A step already open with the same words (from the Concierge's answer, say) isn't added twice.
    const again = move("lead-source:pause:bankrate:2026-12", { id: "mv_again", title: "Pause Bankrate for 60 days" });
    await teamStore().putMove(again);
    expect(await approveLeadMove(me, again.id, NOW)).toEqual({ ok: true, planUpdated: false, steps: 0 });
    expect((await steps("lo1", "open")).filter((x) => x.title === "Pause Bankrate for 60 days")).toHaveLength(1);
  });

  it("Approve refuses another loan officer's move, an assistant, a move that isn't a lead-source move, and wording Compliance holds", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    const theirs = move("lead-source:fix:zillow:2026-11", { ownerUserId: "lo2", id: "mv_theirs" });
    const notLead = move("exp-drafts:2026-11-22", { id: "mv_exp" });
    const bad = move("lead-source:fix:zillow:2026-12", { id: "mv_bad", why: "Offer agents a gift card when they send you buyers." });
    for (const m of [theirs, notLead, bad]) await teamStore().putMove(m);
    expect(await approveLeadMove(me, "mv_theirs", NOW)).toEqual({ ok: false, error: "gone" });
    expect(await approveLeadMove(assistant, "mv_theirs", NOW)).toEqual({ ok: false, error: "gone" });
    expect(await approveLeadMove(me, "mv_exp", NOW)).toEqual({ ok: false, error: "gone" });
    expect(await approveLeadMove(me, "mv_bad", NOW)).toEqual({ ok: false, error: "held" });
    expect((await planStore().get("lo1"))!.history).toEqual([]);
    expect((await steps()).filter((m) => m.key.startsWith("lead-step:approved:"))).toEqual([]);
  });

  it("after day 90 saving starts a new 90 days: the last plan's open steps and check-in close, the new first steps arrive", async () => {
    await seedBook();
    await savePlan(me, 1500, NOW);
    await advancePlan(me, later(35));
    expect(await savePlan(me, 750, later(95))).toEqual({ ok: true, kind: "restarted", steps: 3 });
    const plan = (await planStore().get("lo1"))!;
    expect(plan.startedAt).toBe(later(95).toISOString());
    expect(plan.history[0].budgetCents).toBe(150_000);
    const open = await steps("lo1", "open");
    expect(open.map((m) => m.key.split(":")[2])).toEqual(["2027-02-25", "2027-02-25", "2027-02-25"]);
    expect((await leadMoves()).filter((m) => m.status === "open")).toEqual([]);
  });

  it("the plan card's switch flips from example to real on the first save, with day 1 of 90 and the next check-in", async () => {
    await seedBook();
    expect(leadPageMode({ contacts: [], savedPlan: !!(await planStore().get("lo1")) }).plan).toBe("example");
    await savePlan(me, 1500, NOW);
    const v = planView((await planStore().get("lo1"))!, NOW);
    expect(leadPageMode({ contacts: [], savedPlan: !!v }).plan).toBe("real");
    expect(v).toMatchObject({ budgetCents: 150_000, day: 1, of: 90, done: false, next: "Dec 22" });
    expect(planView((await planStore().get("lo1"))!, later(40))).toMatchObject({ day: 41, next: "Jan 21" });
    expect(planView((await planStore().get("lo1"))!, later(100))).toMatchObject({ day: 90, done: true, next: null });
    // The card itself renders in app/mlo/leads/plan-card.test.ts (only app/mlo/leads/ imports the page's files).
  });

  it("the Concierge's pack carries the saved plan; Download everything has it with its history", async () => {
    await seedBook();
    expect((await leadPackFor(me, "90d", null, NOW)).plan).toBeNull();
    await savePlan(me, 1500, NOW);
    await savePlan(me, 3000, later(1));
    const pack = await leadPackFor(me, "90d", null, later(1));
    expect(pack.plan).toMatchObject({ budgetCents: 300_000, day: 2, of: 90, next: "Dec 22" });
    expect(packContext(pack, "dx")).toContain("Saved 90-day plan: $3,000 a month, day 2 of 90, next check-in Dec 22. Split: ");
    const ex = await buildExport(me, later(1));
    expect(ex.counts.leadPlan).toBe(pack.plan!.lines.length + 3);
    expect((await buildExport(other, later(1))).counts.leadPlan).toBe(0);
  });

  it("the Neon plan store keeps one row per loan officer and binds every value", async () => {
    const seen: { text: string; params?: unknown[] }[] = [];
    const s = new NeonPlanStore(async (text, params) => {
      seen.push({ text, params });
      return text.startsWith("SELECT data") ? [{ data: JSON.stringify({ ownerUserId: "lo1", budgetCents: 1 }) }] : [];
    });
    await s.put({ ownerUserId: "lo1'); DROP TABLE x;--", savedAt: "a", startedAt: "b", budgetCents: 1, targetCents: 1, lines: [], leftOut: [], why: "saved", paused: [], pending: null, history: [] });
    expect(await s.get("lo1")).toMatchObject({ ownerUserId: "lo1" });
    expect(seen[0].text).toMatch(/CREATE TABLE IF NOT EXISTS cc_lead_plans \(owner_user_id text PRIMARY KEY/);
    const ins = seen.find((q) => q.text.startsWith("INSERT INTO cc_lead_plans"))!;
    expect(ins.text).toContain("ON CONFLICT (owner_user_id) DO UPDATE");
    expect(ins.text).not.toContain("DROP");
    expect(ins.params).toHaveLength(4);
    expect(seen.find((q) => q.text.startsWith("SELECT data"))!.params).toEqual(["lo1"]);
  });
});

describe("the planner page (D86)", () => {
  it("presets, the target and Save are bound actions; no value-carrying buttons; assistants get no planner", () => {
    const parts = readFileSync("app/mlo/leads/plan/PlanParts.tsx", "utf8");
    expect(parts).toMatch(/pickBudgetAction\.bind\(null, d\)/);
    expect(parts).toMatch(/aria-pressed=\{d === dollars\}/);
    expect(parts).toMatch(/role="group" aria-label=\{B\.presetsLabel\}/);
    expect(parts).toMatch(/planTargetAction\.bind\(null, dollars\)/);
    expect(parts).toMatch(/savePlanAction\.bind\(null, dollars\)/);
    expect(parts).not.toMatch(/<button[^>]*\b(name|value)=/);
    const page = readFileSync("app/mlo/leads/plan/page.tsx", "utf8");
    expect(page).toMatch(/me\.role === "assistant"/);
    expect(page).toContain("LEAD_PLAN.assistant");
    // The split bar is for the eye; the list under it says the same in words.
    expect(parts).toMatch(/className="cc-plan__bar" aria-hidden="true"/);
  });
});
