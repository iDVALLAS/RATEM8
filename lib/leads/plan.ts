/**
 * lib/leads/plan.ts — D86: the budget planner and 90-day roadmap (Option C). PURE.
 *
 * `allocatePlan` splits a monthly budget across the loan officer's own sources, from their 90-day scorecard
 * (lib/leads/scorecard.ts), by the owner's six rules (the brief, D86 item 2), in this order:
 *  1. "Past clients & sphere" first, with a small amount (PLAN_RULES.sphere).
 *  2. Paid sources (spend on the scorecard) ranked by cost per loan; a source with fewer than
 *     PLAN_RULES.rankByLoanMin closed loans is ranked by cost per lead you can call, after the ranked-by-loan ones.
 *  3. The best source funded up to its share (PLAN_RULES.sharePct of the budget), then the next, and so on.
 *  4. At a budget of PLAN_RULES.testFromDollars or more, one test slot of at most PLAN_RULES.testPct for a new
 *     source, capped for PLAN_RULES.testDays days.
 *  5. Sources marked Pause? are left out (and any source the loan officer paused through an approved move).
 *  6. Sources marked Not enough data are capped as tests (at most PLAN_RULES.testPct of the budget each).
 * What no source can take stays in reserve. Whole dollars; the lines add up to the budget exactly. Same inputs,
 * same output: every sort ends on the source's label and key.
 *
 * `planEstimate` gives leads and loans a month as ranges from the loan officer's own history only (their 30-day,
 * 90-day and this-year scorecards), never from anyone else's numbers; null with no history.
 *
 * Never imports the example fixture (lib/leads/examples.ts).
 */
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import type { ScoreBadge } from "./scorecard";
import { SPHERE_KEY } from "./source-key";

const DAY = 86_400_000;

/** Every number behind the split, in one place (dollars unless named otherwise). */
export const PLAN_RULES = {
  /** The planner's presets, and the budget it opens on without one. */
  presetsDollars: [750, 1500, 3000] as readonly number[],
  defaultDollars: 1500,
  /** A budget must be in this range (the same range D85 reads from a question). */
  minDollars: 100,
  maxDollars: 100_000,
  /** Rule 1: "a small amount" for past clients & sphere: this % of the budget, rounded down to `stepDollars`, between `minDollars` and `maxDollars` (all of a budget smaller than `minDollars`). */
  sphere: { pct: 10, minDollars: 150, maxDollars: 250, stepDollars: 50 },
  /** Rule 2: a source needs this many closed loans to be ranked by cost per loan (the scorecard's Scale up minimum). */
  rankByLoanMin: 2,
  /** Rule 3: "its share": the most of the budget one source may take, in %. */
  sharePct: 60,
  /** Rule 4: the test slot for a new source: from this budget, at most this %, rounded down to `testStepDollars`. */
  testFromDollars: 2000,
  testPct: 20,
  testStepDollars: 50,
  /** Rules 4 and 6: a test is capped for this many days. */
  testDays: 60,
  /** A plan runs this many days; the Business Manager checks in every `checkInDays`. */
  planDays: 90,
  checkInDays: 30,
} as const;

export type PlanKind = "sphere" | "fund" | "test" | "new-test" | "reserve";

/** One part of the split. `key` is the source key ("new-test" and "reserve" for the two that aren't sources). */
export type PlanLine = {
  key: string;
  label: string;
  kind: PlanKind;
  cents: number;
  /** 1 = the best paid source; null for the sphere, the new-source test and the reserve. */
  rank: number | null;
  rankedBy: "loan" | "callable" | null;
  /** Funded up to its cap (its share, or the test cap). */
  capped: boolean;
  perLoanCents: number | null;
  perCallableCents: number | null;
  leads: number;
  closed: number;
};

export type LeftOutReason = "pause" | "paused" | "noSpend" | "budget";
export type LeftOut = { key: string; label: string; reason: LeftOutReason; spendCents: number; until?: string | null };

export type Allocation = { budgetCents: number; lines: PlanLine[]; leftOut: LeftOut[] };

/** The few scorecard row fields the split reads (a `ScoreRow` fits). */
export type PlanRow = {
  key: string;
  label: string;
  sphere: boolean;
  spendCents: number;
  leads: number;
  canCall: number;
  closed: number;
  perLoanCents: number | null;
  perCallableCents: number | null;
  badge: ScoreBadge | null;
};

export type AllocateInput = {
  budgetCents: number;
  rows: readonly PlanRow[];
  /** Sources the loan officer paused through an approved Business Manager move, with when the pause ends. */
  paused?: readonly { key: string; until: string | null }[];
};

export const NEW_TEST_KEY = "new-test";
export const RESERVE_KEY = "reserve";

/** A monthly budget in whole dollars within the range, else null. */
export function cleanBudget(dollars: unknown): number | null {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return null;
  const d = Math.round(n);
  return d >= PLAN_RULES.minDollars && d <= PLAN_RULES.maxDollars ? d : null;
}

const floorTo = (n: number, step: number) => Math.floor(n / step) * step;

/** Rule 1: the sphere's small amount, in whole dollars. */
export function sphereDollars(budget: number): number {
  const S = PLAN_RULES.sphere;
  if (budget <= S.minDollars) return budget;
  return Math.min(budget, Math.max(S.minDollars, Math.min(S.maxDollars, floorTo((budget * S.pct) / 100, S.stepDollars))));
}

/** Rule 4: the test slot, in whole dollars (0 below the threshold). */
export function testSlotDollars(budget: number): number {
  if (budget < PLAN_RULES.testFromDollars) return 0;
  return floorTo((budget * PLAN_RULES.testPct) / 100, PLAN_RULES.testStepDollars);
}

/** Rule 6: the most a Not-enough-data source may take, in whole dollars. */
export const testCapDollars = (budget: number) => Math.floor((budget * PLAN_RULES.testPct) / 100);
/** Rule 3: a source's share, in whole dollars. */
export const shareDollars = (budget: number) => Math.floor((budget * PLAN_RULES.sharePct) / 100);

const cmpNull = (a: number | null, b: number | null) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : a - b);
/** Last words of every sort: the label, then the key (same inputs, same order). */
const tie = (a: PlanRow, b: PlanRow) => a.label.localeCompare(b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Rule 2: the paid sources in rank order. */
export function rankSources(rows: readonly PlanRow[]): { row: PlanRow; by: "loan" | "callable" }[] {
  const byLoan = rows.filter((r) => r.closed >= PLAN_RULES.rankByLoanMin).sort((a, b) => cmpNull(a.perLoanCents, b.perLoanCents) || b.closed - a.closed || b.canCall - a.canCall || tie(a, b));
  const byCallable = rows.filter((r) => r.closed < PLAN_RULES.rankByLoanMin).sort((a, b) => cmpNull(a.perCallableCents, b.perCallableCents) || b.closed - a.closed || b.canCall - a.canCall || tie(a, b));
  return [...byLoan.map((row) => ({ row, by: "loan" as const })), ...byCallable.map((row) => ({ row, by: "callable" as const }))];
}

/** The split. Whole dollars, summing exactly to the budget. */
export function allocatePlan(input: AllocateInput): Allocation {
  const budget = Math.max(0, Math.round(input.budgetCents / 100));
  const pausedBy = new Map((input.paused ?? []).map((p) => [p.key, p.until]));
  const lines: PlanLine[] = [];
  const leftOut: LeftOut[] = [];
  const line = (r: PlanRow | null, kind: PlanKind, dollars: number, extra: Partial<PlanLine> = {}): PlanLine => ({
    key: r?.key ?? (kind === "new-test" ? NEW_TEST_KEY : kind === "reserve" ? RESERVE_KEY : SPHERE_KEY),
    label: r?.label ?? (kind === "new-test" ? LEAD_PLAN.split.names.newTest : kind === "reserve" ? LEAD_PLAN.split.names.reserve : LEAD_PLAN.split.names.sphere),
    kind,
    cents: dollars * 100,
    rank: null,
    rankedBy: null,
    capped: false,
    perLoanCents: r?.perLoanCents ?? null,
    perCallableCents: r?.perCallableCents ?? null,
    leads: r?.leads ?? 0,
    closed: r?.closed ?? 0,
    ...extra,
  });
  let left = budget;

  // 1. Past clients & sphere first, with a small amount.
  const sphereRow = input.rows.find((r) => r.sphere || r.key === SPHERE_KEY) ?? null;
  const sphere = sphereDollars(budget);
  lines.push(line(sphereRow, "sphere", sphere));
  left -= sphere;

  // 4. The test slot for a new source (kept before the paid sources take their shares).
  const slot = Math.min(left, testSlotDollars(budget));
  left -= slot;

  // 5. Pause? and paused sources are left out; a source with no spend can't be ranked on cost.
  const candidates: PlanRow[] = [];
  for (const r of [...input.rows].sort(tie)) {
    if (r.sphere || r.key === SPHERE_KEY) continue;
    if (pausedBy.has(r.key)) leftOut.push({ key: r.key, label: r.label, reason: "paused", spendCents: r.spendCents, until: pausedBy.get(r.key) ?? null });
    else if (r.badge === "pause") leftOut.push({ key: r.key, label: r.label, reason: "pause", spendCents: r.spendCents });
    else if (r.spendCents <= 0) {
      if (r.leads || r.closed) leftOut.push({ key: r.key, label: r.label, reason: "noSpend", spendCents: 0 });
    } else candidates.push(r);
  }

  // 2, 3 and 6. Ranked; each funded up to its share, a Not-enough-data source only up to the test cap.
  const share = shareDollars(budget);
  const testCap = testCapDollars(budget);
  const funded: PlanLine[] = [];
  let rank = 0;
  for (const { row, by } of rankSources(candidates)) {
    const thin = row.badge === "thin";
    const cap = thin ? testCap : share;
    const amount = Math.min(cap, left);
    if (amount <= 0) {
      leftOut.push({ key: row.key, label: row.label, reason: "budget", spendCents: row.spendCents });
      continue;
    }
    left -= amount;
    funded.push(line(row, thin ? "test" : "fund", amount, { rank: ++rank, rankedBy: by, capped: amount === cap }));
  }
  lines.push(...funded.filter((l) => l.kind === "fund"), ...funded.filter((l) => l.kind === "test"));
  if (slot > 0) lines.push(line(null, "new-test", slot, { capped: true }));
  if (left > 0) lines.push(line(null, "reserve", left));
  return { budgetCents: budget * 100, lines, leftOut };
}

// ---- Estimates (own history only) ----

/** One scorecard's rows, as the estimate reads them. */
export type HistoryCard = { period: string; rows: readonly Pick<PlanRow, "key" | "spendCents" | "leads" | "closed">[] };
export type Estimate = { leads: [number, number]; loans: [number, number]; periods: string[] };

/**
 * Leads and loans a month at this split, as a range across the loan officer's own scorecards: each funded line's
 * dollars × that source's leads (or loans) per dollar spent in the period, summed; the range is the lowest and the
 * highest of those sums (rounded down and up). Only sources with spend in a period count in it. Null when no
 * funded source has any history (never anyone else's numbers).
 */
export function planEstimate(lines: readonly PlanLine[], cards: readonly HistoryCard[]): Estimate | null {
  const sums: { period: string; leads: number; loans: number }[] = [];
  for (const card of cards) {
    const by = new Map(card.rows.map((r) => [r.key, r]));
    let leads = 0;
    let loans = 0;
    let any = false;
    for (const l of lines) {
      if (l.kind === "new-test" || l.kind === "reserve" || l.cents <= 0) continue;
      const r = by.get(l.key);
      if (!r || r.spendCents <= 0) continue;
      any = true;
      leads += (l.cents * r.leads) / r.spendCents;
      loans += (l.cents * r.closed) / r.spendCents;
    }
    if (any) sums.push({ period: card.period, leads, loans });
  }
  if (!sums.length) return null;
  const range = (v: number[]): [number, number] => [Math.floor(Math.min(...v) + 1e-9), Math.ceil(Math.max(...v) - 1e-9)];
  return { leads: range(sums.map((s) => s.leads)), loans: range(sums.map((s) => s.loans)), periods: sums.map((s) => s.period) };
}

// ---- The 90 days ----

/** The day a plan is on (1 on the day it starts); can pass `planDays` once it's over. */
export function planDay(startedAt: string, now: Date): number {
  return Math.max(1, Math.floor((now.getTime() - Date.parse(startedAt)) / DAY) + 1);
}

/** The next check-in date (start + 30, 60 or 90 days), or null when all three have passed. */
export function nextCheckIn(startedAt: string, now: Date): Date | null {
  const start = Date.parse(startedAt);
  for (let k = 1; k * PLAN_RULES.checkInDays <= PLAN_RULES.planDays; k++) {
    const at = start + k * PLAN_RULES.checkInDays * DAY;
    if (at > now.getTime()) return new Date(at);
  }
  return null;
}

/** The latest check-in that's due (30, 60 or 90), or null before day 31. */
export function dueCheckIn(startedAt: string, now: Date): number | null {
  const start = Date.parse(startedAt);
  let due: number | null = null;
  for (let k = 1; k * PLAN_RULES.checkInDays <= PLAN_RULES.planDays; k++) if (start + k * PLAN_RULES.checkInDays * DAY <= now.getTime()) due = k * PLAN_RULES.checkInDays;
  return due;
}

/** The roadmap phases that have begun (0 = days 1–30, 1 = days 31–60, 2 = days 61–90). */
export function phasesBegun(startedAt: string, now: Date): number[] {
  const start = Date.parse(startedAt);
  return [0, 1, 2].filter((p) => start + p * PLAN_RULES.checkInDays * DAY <= now.getTime());
}

/** The roadmap: three phases, three steps each (the step ids; words in lib/content/lead-plan.ts). */
export const ROADMAP: readonly { id: "free" | "test" | "scale"; from: number; to: number; steps: readonly { id: "sphere" | "wording" | "tag" | "move" | "cap" | "answer" | "keep" | "pause" | "rerun"; href: string }[] }[] = [
  { id: "free", from: 1, to: 30, steps: [{ id: "sphere", href: "/mlo/campaigns" }, { id: "wording", href: "/mlo/leads#add" }, { id: "tag", href: "/mlo/expenses" }] },
  { id: "test", from: 31, to: 60, steps: [{ id: "move", href: "/mlo/leads/plan" }, { id: "cap", href: "/mlo/leads#monthly" }, { id: "answer", href: "/mlo/calls" }] },
  { id: "scale", from: 61, to: 90, steps: [{ id: "keep", href: "/mlo/leads#scorecard" }, { id: "pause", href: "/mlo/leads#monthly" }, { id: "rerun", href: "/mlo/leads/plan" }] },
];

/** What changed between two splits, source by source (the new-source test and the reserve aren't sources). */
export function planChanges(before: readonly PlanLine[], after: readonly PlanLine[]): { key: string; label: string; fromCents: number; toCents: number }[] {
  const real = (l: PlanLine) => l.kind !== "new-test" && l.kind !== "reserve";
  const a = new Map(before.filter(real).map((l) => [l.key, l]));
  const b = new Map(after.filter(real).map((l) => [l.key, l]));
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  return keys
    .map((k) => ({ key: k, label: (b.get(k) ?? a.get(k))!.label, fromCents: a.get(k)?.cents ?? 0, toCents: b.get(k)?.cents ?? 0 }))
    .filter((c) => c.fromCents !== c.toCents)
    .sort((x, y) => Math.abs(y.toCents - y.fromCents) - Math.abs(x.toCents - x.fromCents) || x.label.localeCompare(y.label) || (x.key < y.key ? -1 : 1));
}

/** A line's share of the budget, as a whole percent. */
export const linePct = (l: Pick<PlanLine, "cents">, budgetCents: number) => (budgetCents > 0 ? Math.round((100 * l.cents) / budgetCents) : 0);
