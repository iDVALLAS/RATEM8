/**
 * lib/leads/plan-service.ts — D86: the budget planner, the saved plan, its 90-day roadmap and the Business Manager's
 * check-ins. SERVER-ONLY.
 *
 * The planner never spends money, signs up for a vendor or contacts anyone: it reads the loan officer's own
 * scorecard, saves their plan (lib/leads/plan-store.ts) and adds steps to Today as Business Manager steps (the shape
 * D85 uses: `kind: "plan"`, no contact, an `href`, listed on Home under "Lead plan steps").
 *
 *  - `plannerFor`: the split for a budget (lib/leads/plan.ts), the estimates from their own 30-day, 90-day and
 *    this-year scorecards, and the Business Finder's suggestions for the test slot (lib/leads/catalog.ts).
 *  - `savePlan`: stores the plan. Saving again within the 90 days keeps the day count and the steps (the version
 *    before goes into the plan's history); after day 90 it starts a new 90 days.
 *  - `advancePlan`: each roadmap phase's steps once its 30 days begin (each step once, by key), and at day 30, 60 and
 *    90 the Business Manager's check-in, proposed through the lead-source move flow (the scorecard's banner, Review,
 *    Approve or Not now). Runs on the planner and Lead sources page views and in the morning run (no new cron).
 *  - `approveLeadMove`: Approve on a lead-source move. It only updates the saved plan and adds steps; it never moves
 *    money or contacts a vendor. Compliance (`reviewMove`) passes it first.
 *
 * Own book only; an assistant has no plan (spend is private).
 */
import { createHash } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { reviewLeadMove, reviewMove } from "@/lib/agents/compliance";
import { teamStore, type Move } from "@/lib/agents/store";
import { LEAD_ASK, LEAD_MOVES } from "@/lib/content/cc-pages";
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { testCandidates, type CatalogType } from "./catalog";
import { connectedSourceLabels } from "./mode";
import { allocatePlan, cleanBudget, dueCheckIn, nextCheckIn, phasesBegun, planChanges, planDay, planEstimate, PLAN_RULES, ROADMAP, type Allocation, type Estimate, type PlanLine } from "./plan";
import { PLAN_HISTORY, planStore, type LeadPlan, type PlanVersion } from "./plan-store";
import { scoreUsd, type LeadScorecard } from "./scorecard";
import { scorecardFor, scorecardsFor } from "./score-service";
import { NOT_LEADS } from "./sources";
import { sourceLabel } from "./source-key";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const usd = scoreUsd;

export type Planner = {
  budgetCents: number;
  targetCents: number;
  alloc: Allocation;
  estimate: Estimate | null;
  suggestions: CatalogType[];
  plan: LeadPlan | null;
};

/** Pauses still running (a pause with no end date stays until the loan officer re-saves without it). */
export const activePauses = (plan: Pick<LeadPlan, "paused"> | null, now: Date) => (plan?.paused ?? []).filter((p) => !p.until || Date.parse(p.until) > now.getTime());

/** The split for a budget, from the loan officer's own scorecards. Never for an assistant (the page doesn't ask). */
export async function plannerFor(user: User, budgetCents: number, now = new Date()): Promise<Planner> {
  const [cards, plan, keys] = await Promise.all([
    scorecardsFor(user, ["30d", "90d", "year"], now).catch(() => [] as LeadScorecard[]),
    planStore().get(user.id).catch(() => null),
    pipelineStore().keys(user.id).catch(() => []),
  ]);
  const card = cards[1] ?? null;
  const rows = card?.rows ?? [];
  const alloc = allocatePlan({ budgetCents, rows, paused: activePauses(plan, now) });
  const estimate = planEstimate(alloc.lines, cards.map((c) => ({ period: c.period, rows: c.rows })));
  return {
    budgetCents: alloc.budgetCents,
    targetCents: card?.targetCents ?? 0,
    alloc,
    estimate,
    suggestions: testCandidates(rows, connectedSourceLabels(keys.map((k) => k.label), NOT_LEADS)),
    plan: plan && plan.ownerUserId === user.id ? plan : null,
  };
}

/** The version a plan is now, for its history. */
const versionOf = (p: LeadPlan): PlanVersion => ({ savedAt: p.savedAt, startedAt: p.startedAt, budgetCents: p.budgetCents, targetCents: p.targetCents, lines: p.lines, leftOut: p.leftOut, why: p.why });

/** A new version of a plan from a split, the one before kept in its history. */
function nextVersion(prev: LeadPlan, alloc: Pick<Allocation, "budgetCents" | "lines" | "leftOut">, why: PlanVersion["why"], targetCents: number, now: Date, change: Partial<LeadPlan> = {}): LeadPlan {
  return { ...prev, savedAt: iso(now), budgetCents: alloc.budgetCents, targetCents, lines: alloc.lines, leftOut: alloc.leftOut, why, pending: null, history: [versionOf(prev), ...prev.history].slice(0, PLAN_HISTORY), ...change };
}

export type SaveResult = { ok: true; kind: "new" | "changed" | "restarted"; steps: number } | { ok: false; error: "range" | "assistant" };

/** "Save as my 90-day plan". Stores the plan and adds the first phase's steps; nothing else. */
export async function savePlan(user: User, dollars: number, now = new Date()): Promise<SaveResult> {
  if (user.role === "assistant") return { ok: false, error: "assistant" };
  const budget = cleanBudget(dollars);
  if (budget === null) return { ok: false, error: "range" };
  const p = await plannerFor(user, budget * 100, now);
  const prev = p.plan;
  const keep = !!prev && planDay(prev.startedAt, now) <= PLAN_RULES.planDays;
  const at = iso(now);
  const next: LeadPlan = prev
    ? nextVersion(prev, p.alloc, "saved", p.targetCents, now, { startedAt: keep ? prev.startedAt : at, paused: activePauses(prev, now) })
    : { ownerUserId: user.id, savedAt: at, startedAt: at, budgetCents: p.alloc.budgetCents, targetCents: p.targetCents, lines: p.alloc.lines, leftOut: p.alloc.leftOut, why: "saved", paused: [], pending: null, history: [] };
  await planStore().put(next);
  // A new 90 days: the last plan's open roadmap steps and check-in are closed, so nothing shows twice.
  if (prev && !keep) {
    const old = prev.startedAt.slice(0, 10);
    for (const m of await teamStore().moves(user.id, { status: "open", limit: 2000 }).catch(() => [])) {
      if (m.key.startsWith(`lead-step:roadmap:${old}:`) || m.key.startsWith(`lead-source:checkin:${old}:`)) await teamStore().putMove({ ...m, status: "dismissed", updatedAt: at });
    }
  }
  const adv = await advancePlan(user, now);
  await accountStore().audit({ at, actor: user.email, action: "lead.plan.save", detail: { budgetCents: next.budgetCents, lines: next.lines.length, kind: !prev ? "new" : keep ? "changed" : "restarted", steps: adv.steps } }).catch(() => undefined);
  return { ok: true, kind: !prev ? "new" : keep ? "changed" : "restarted", steps: adv.steps };
}

/**
 * D87: a keyed step's or check-in's id, fixed by its owner and key. Two runs at once (a page view and the morning
 * run, or the planner and Lead sources) both pass the "not made yet" check; with the same id the second write lands
 * on the first instead of adding a twin. Every key here is made once (roadmap steps, approved steps, check-ins), so a
 * fixed id never overwrites an earlier move of the same key.
 */
export const keyedMoveId = (owner: string, key: string) => `mv_${createHash("sha256").update(`${owner}\n${key}`).digest("base64url").slice(0, 12)}`;

const blankMove = (user: User, key: string, title: string, why: string, href: string, score: number, now: Date, note: string): Move => ({
  id: keyedMoveId(user.id, key),
  key,
  ownerUserId: user.id,
  agent: "business",
  kind: "plan",
  title,
  why,
  contactId: null,
  loanId: null,
  playbookId: null,
  channel: null,
  subject: "",
  body: "",
  amountCents: null,
  href,
  gift: null,
  score,
  status: "open",
  note,
  createdAt: iso(now),
  updatedAt: iso(now),
  until: null,
});

/**
 * A step on Today (a Business Manager step, Home's "Lead plan steps"), added once per key, and not at all while an
 * open lead plan step already says the same thing (one the Concierge added from an answer, say).
 */
async function addStep(user: User, key: string, title: string, why: string, href: string, now: Date): Promise<boolean> {
  if (!reviewLeadMove(`${title}\n${why}`).ok) return false;
  const store = teamStore();
  if (await store.moveByKey(user.id, key).catch(() => null)) return false;
  const open = await store.moves(user.id, { status: "open", limit: 2000 }).catch(() => []);
  if (open.some((m) => m.key.startsWith("lead-step:") && m.title === title)) return false;
  await store.putMove(blankMove(user, key, title, why, href, 44, now, LEAD_ASK.today.from));
  return true;
}

/** The words of one roadmap step. */
export function roadmapStep(id: (typeof ROADMAP)[number]["steps"][number]["id"], targetCents: number): { title: string; why: string } {
  const s = LEAD_PLAN.roadmap.steps[id];
  return { title: typeof s.title === "function" ? s.title(usd(targetCents)) : s.title, why: s.why };
}

/** A check-in's title and why, from what would change. */
export function checkInWords(day: number, changes: ReturnType<typeof planChanges>): { title: string; why: string } {
  const C = LEAD_PLAN.checkin;
  const body = changes.length ? C.whyChange(changes.map((c) => C.change(c.label, usd(c.fromCents), usd(c.toCents))).join("; ")) : C.whySame;
  return { title: changes.length ? C.update(day) : C.keep(day), why: [body, day >= PLAN_RULES.planDays ? C.end : "", LEAD_MOVES.tail].filter(Boolean).join(" ") };
}

/**
 * Moves the roadmap along: each phase's steps once its 30 days begin (each once, by key, so re-saving or running
 * again adds nothing twice), and the Business Manager's latest due check-in (day 30, 60 or 90) once.
 */
export async function advancePlan(user: User, now = new Date()): Promise<{ steps: number; checkIn: boolean }> {
  const out = { steps: 0, checkIn: false };
  if (user.role === "assistant") return out;
  const plan = await planStore().get(user.id).catch(() => null);
  if (!plan || plan.ownerUserId !== user.id) return out;
  const start = plan.startedAt.slice(0, 10);
  const R = LEAD_PLAN.roadmap;
  for (const p of phasesBegun(plan.startedAt, now)) {
    const phase = ROADMAP[p];
    const name = `${R.phase(phase.from, phase.to)} · ${R.phases[p].name}`;
    for (const s of phase.steps) {
      const w = roadmapStep(s.id, plan.targetCents);
      if (await addStep(user, `lead-step:roadmap:${start}:${s.id}`, w.title, R.stepWhy(name, w.why), s.href, now)) out.steps++;
    }
  }
  const due = dueCheckIn(plan.startedAt, now);
  if (due) {
    const key = `lead-source:checkin:${start}:${due}`;
    const store = teamStore();
    if (!(await store.moveByKey(user.id, key).catch(() => null))) {
      const card = await scorecardFor(user, "90d", now).catch(() => null);
      const alloc = allocatePlan({ budgetCents: plan.budgetCents, rows: card?.rows ?? [], paused: activePauses(plan, now) });
      const w = checkInWords(due, planChanges(plan.lines, alloc.lines));
      const move = blankMove(user, key, w.title, w.why, "/mlo/leads", 50, now, "");
      if (reviewMove(move, "client").ok) {
        await store.putMove(move);
        await planStore().put({ ...plan, pending: { moveId: move.id, day: due, budgetCents: alloc.budgetCents, lines: alloc.lines, leftOut: alloc.leftOut } });
        out.checkIn = true;
      }
    }
  }
  return out;
}

export type ApproveResult = { ok: true; planUpdated: boolean; steps: number } | { ok: false; error: "gone" | "held" };

/**
 * Approve on one of the Business Manager's lead-source moves (the scorecard's banner). A pause leaves the source out
 * of the saved plan for 60 days and re-splits the budget; a check-in applies the split it proposed; a permission fix
 * changes no dollars. Each adds its steps to Today (once). Nothing is spent, signed up for or sent.
 */
export async function approveLeadMove(user: User, id: string, now = new Date()): Promise<ApproveResult> {
  if (user.role === "assistant") return { ok: false, error: "gone" };
  const store = teamStore();
  const m = await store.move(id);
  if (!m || m.ownerUserId !== user.id || m.status !== "open" || !m.key.startsWith("lead-source:")) return { ok: false, error: "gone" };
  if (!reviewMove(m, "client").ok) return { ok: false, error: "held" };
  const [, kind, src] = m.key.split(":");
  const plan = await planStore().get(user.id).catch(() => null);
  const card = await scorecardFor(user, "90d", now).catch(() => null);
  const label = (key: string) => card?.rows.find((r) => r.key === key)?.label ?? sourceLabel(key);
  const target = card?.targetCents ?? plan?.targetCents ?? 0;
  const steps: { title: string; why: string; href: string }[] = [];
  let updated: LeadPlan | null = null;
  if (kind === "pause" && src) {
    steps.push({ title: LEAD_ASK.steps.pause(label(src), PLAN_RULES.testDays), why: LEAD_PLAN.approved.pauseWhy, href: "/mlo/leads#monthly" });
    if (plan) {
      const paused = [...activePauses(plan, now).filter((p) => p.key !== src), { key: src, label: label(src), until: iso(new Date(now.getTime() + PLAN_RULES.testDays * DAY)) }];
      updated = nextVersion(plan, allocatePlan({ budgetCents: plan.budgetCents, rows: card?.rows ?? [], paused }), "approved", target, now, { paused });
    }
  } else if (kind === "fix" && src) {
    steps.push({ title: LEAD_ASK.steps.fix(label(src)), why: LEAD_PLAN.approved.fixWhy, href: "/mlo/leads#add" });
  } else if (kind === "checkin" && plan) {
    const pend = plan.pending && plan.pending.moveId === m.id ? plan.pending : null;
    const alloc = pend ? { budgetCents: pend.budgetCents, lines: pend.lines, leftOut: pend.leftOut } : allocatePlan({ budgetCents: plan.budgetCents, rows: card?.rows ?? [], paused: activePauses(plan, now) });
    updated = nextVersion(plan, alloc, "checkin", target, now);
  }
  if (plan && updated) {
    for (const c of planChanges(plan.lines, updated.lines).slice(0, 4)) {
      steps.push({ title: LEAD_PLAN.approved.setAmount(c.label, usd(c.toCents)), why: LEAD_PLAN.approved.setAmountWhy(usd(c.fromCents), usd(c.toCents)), href: "/mlo/leads#monthly" });
    }
    await planStore().put(updated);
  }
  let added = 0;
  for (const [i, s] of steps.entries()) if (await addStep(user, `lead-step:approved:${m.id}:${i}`, s.title, s.why, s.href, now)) added++;
  await store.putMove({ ...m, status: "done", note: LEAD_PLAN.approved.done(added, !!updated), updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "lead.move.approve", detail: { kind: kind ?? "", planUpdated: !!updated, steps: added } }).catch(() => undefined);
  return { ok: true, planUpdated: !!updated, steps: added };
}

/** The plan card's figures (Lead sources) and the Concierge's pack line. */
export type PlanView = { budgetCents: number; day: number; of: number; done: boolean; next: string | null; lines: Pick<PlanLine, "key" | "label" | "kind" | "cents">[] };

/** "Dec 22" on the West Coast, like the rest of the books. */
export const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

export function planView(plan: LeadPlan, now: Date): PlanView {
  const day = planDay(plan.startedAt, now);
  const of = PLAN_RULES.planDays;
  const next = nextCheckIn(plan.startedAt, now);
  return { budgetCents: plan.budgetCents, day: Math.min(day, of), of, done: day > of, next: next ? shortDate(next) : null, lines: plan.lines.filter((l) => l.cents > 0).map(({ key, label, kind, cents }) => ({ key, label, kind, cents })) };
}
