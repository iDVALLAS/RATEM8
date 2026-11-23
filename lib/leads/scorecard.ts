/**
 * lib/leads/scorecard.ts — D84: the lead-source scorecard (Option B). PURE.
 *
 * For a period (30 days, 90 days or this year) it joins three things on the
 * one source key (`sourceKey()`, D83):
 *  - lead events: every delivery is a lead, repeats are a subset, and "you
 *    can call" is the delivery's own `namesYou`, frozen when it arrived
 *    (owner decision 1); for an imported lead, whether the import recorded
 *    the person's yes to texts or calls (D87.3, owner decision 6). An
 *    imported lead with no date of its own counts as
 *    a lead but in no period (decision 5); the scorecard says how many;
 *  - confirmed lead-spend lines from Expenses, at their business-use share
 *    (the same share the year-end report uses, without its tax-only rules:
 *    the 50% meals rule and the $25 gift limit don't change what a source
 *    cost);
 *  - pipeline loans, each credited to one row: a client's new loan after an
 *    earlier closing is repeat business ("Past clients & sphere"), else the
 *    contact's first lead source, else "Past clients & sphere" for a past
 *    client or sphere contact (decision 3), else no row.
 *
 * Every figure is computed here; nothing divides by zero. A figure that
 * can't be worked out (no spend, no leads, no loans) is null, shown as "—".
 * The badges are deterministic rules whose thresholds live in BADGE_RULES.
 *
 * Never imports the example fixture (lib/leads/examples.ts): example numbers
 * never reach this module, the agents or the Concierge.
 */
import { SPHERE_KEY, sourceLabel } from "./source-key";

const DAY = 86_400_000;

export const SCORE_PERIODS = ["30d", "90d", "year"] as const;
export type ScorePeriod = (typeof SCORE_PERIODS)[number];
export const DEFAULT_PERIOD: ScorePeriod = "90d";
export const isScorePeriod = (v: unknown): v is ScorePeriod => (SCORE_PERIODS as readonly unknown[]).includes(v);

/** Every threshold behind a badge, in one place (the owner's brief, D84 item 4). Money in cents. */
export const BADGE_RULES = {
  /** The target cost per loan, until the loan officer sets their own. */
  defaultTargetCents: 100_000,
  /** What the target can be set to ($100 to $100,000). */
  minTargetCents: 10_000,
  maxTargetCents: 10_000_000,
  /** Not enough data: fewer leads than this. Overrides every badge except Pause?. */
  enoughLeads: 10,
  /** Fix permission: at least `enoughLeads` leads and under this share you can call. */
  fixShareBelowPct: 50,
  /** Pause?: at least this much spent in the period … */
  pauseSpendCents: 100_000,
  /** … this many days or more since the source's first lead or spend … */
  pauseHistoryDays: 60,
  /** … and no loans (closed or in the pipeline). */
  pauseLoans: 0,
  /** Best value: the lowest cost per loan among sources with at least this many closed loans. */
  bestMinLoans: 1,
  /** Scale up: at least this many closed loans, at or under the target. */
  scaleMinLoans: 2,
  /** Watch: spend with cost per loan over the target, or fewer closed loans than this. */
  watchUnderLoans: 2,
} as const;

export const SCORE_BADGES = ["pause", "thin", "fix", "best", "scale", "watch"] as const;
/** pause = "Pause?", thin = "Not enough data", fix = "Fix permission", best = "Best value", scale = "Scale up", watch = "Watch". */
export type ScoreBadge = (typeof SCORE_BADGES)[number];
/** Which badge wins when several rules match (first wins). */
export const BADGE_PRECEDENCE: readonly ScoreBadge[] = SCORE_BADGES;

/** The few lead-event fields this needs (a `LeadEvent` fits). */
export type ScoreEvent = { contactId: string; sourceKey: string; sourceLabel: string; at: string; duplicate: boolean; namesYou: boolean; datedBy: string };
/** The few expense fields this needs (an expense `Entry` fits). */
export type ScoreSpend = { date: string; amountCents: number; businessPct: number; leadSource: string | null; status: string; kind: string };
/** The few loan fields this needs (a pipeline `Loan` fits). */
export type ScoreLoan = { id: string; contactId: string | null; closed: boolean; dead: boolean; milestoneAt: string; keyDates: { application: string | null }; history: readonly { at: string }[] };
/** The few contact fields this needs (a `Contact` fits). */
export type ScoreContact = { id: string; relationship: string; loan?: { closedOn?: string | null } | null };

export type ScoreInput = {
  period: ScorePeriod;
  now: Date;
  events: readonly ScoreEvent[];
  spend: readonly ScoreSpend[];
  loans: readonly ScoreLoan[];
  contacts: readonly ScoreContact[];
  /** Target cost per loan in cents (the loan officer's own setting). */
  targetCents?: number;
  /** Names for keys no lead event names (a monthly amount's source, "Other…" spend). */
  labels?: Readonly<Record<string, string>>;
};

export type ScoreRow = {
  key: string;
  label: string;
  /** The "Past clients & sphere" row. */
  sphere: boolean;
  spendCents: number;
  leads: number;
  /** Leads whose delivery named the loan officer (frozen `namesYou`); for the sphere row, people who started a loan too. */
  canCall: number;
  /** canCall / leads as a whole percent; null with no leads. */
  sharePct: number | null;
  perLeadCents: number | null;
  perCallableCents: number | null;
  /** Open loans (not closed, not dead) that started in the period. */
  inPipeline: number;
  /** Loans closed in the period. */
  closed: number;
  perLoanCents: number | null;
  repeats: number;
  /** Days since this source's first lead or spend (any time); null when it has neither. */
  historyDays: number | null;
  badge: ScoreBadge | null;
};

export type LeadScorecard = {
  period: ScorePeriod;
  from: string;
  to: string;
  targetCents: number;
  rows: ScoreRow[];
  /** Imported leads with no date of their own: counted as leads, in no period. */
  undated: number;
  /** Loans closed in the period with no lead source (no lead event, not a past client or sphere). */
  unattributed: number;
};

/** The window a period covers: the last 30 or 90 days, or this calendar year to now. */
export function periodWindow(period: ScorePeriod, now: Date): { from: Date; to: Date } {
  if (period === "year") return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: now };
  return { from: new Date(now.getTime() - (period === "30d" ? 30 : 90) * DAY), to: now };
}

/** A target as stored: whole cents within the allowed range, else the default. */
export function cleanTarget(cents: unknown): number {
  const n = Number(cents);
  return Number.isFinite(n) && n >= BADGE_RULES.minTargetCents && n <= BADGE_RULES.maxTargetCents ? Math.round(n) : BADGE_RULES.defaultTargetCents;
}

/** What a lead-spend line counts for: its business-use share (1–100%). */
export function leadSpendCents(e: Pick<ScoreSpend, "amountCents" | "businessPct">): number {
  const pct = Number.isFinite(e.businessPct) ? Math.min(100, Math.max(0, e.businessPct)) : 100;
  return Math.max(0, Math.round((Number.isFinite(e.amountCents) ? e.amountCents : 0) * (pct / 100)));
}

/** When a loan started: its application date, else its first stage entry; null when neither is known. */
export function loanStart(l: Pick<ScoreLoan, "keyDates" | "history">): string | null {
  if (l.keyDates?.application) return l.keyDates.application.slice(0, 10);
  const first = [...(l.history ?? [])].map((h) => h.at).filter(Boolean).sort()[0];
  return first ? first.slice(0, 10) : null;
}

/** A whole-number division, or null when it can't be worked out. */
const per = (cents: number, n: number) => (cents > 0 && n > 0 ? Math.round(cents / n) : null);
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);
const dated = (e: ScoreEvent) => e.datedBy !== "none";

/** Each contact's first lead source: the key of their earliest lead event. */
export function firstSources(events: readonly ScoreEvent[]): Map<string, string> {
  const first = new Map<string, ScoreEvent>();
  for (const e of events) {
    const o = first.get(e.contactId);
    if (!o || e.at < o.at || (e.at === o.at && e.sourceKey < o.sourceKey)) first.set(e.contactId, e);
  }
  return new Map([...first].map(([id, e]) => [id, e.sourceKey]));
}

/**
 * The row a loan is credited to (one row at most, never two): a new loan for
 * someone whose earlier loan already closed is repeat business ("Past clients
 * & sphere"); else the contact's first lead source; else "Past clients &
 * sphere" for a past client or sphere contact; else none.
 */
export function creditFor(loan: ScoreLoan, ctx: { loans: readonly ScoreLoan[]; contacts: Map<string, ScoreContact>; first: Map<string, string> }): string | null {
  if (!loan.contactId) return null;
  const c = ctx.contacts.get(loan.contactId);
  const start = loanStart(loan);
  if (start) {
    const earlier = ctx.loans.some((o) => o.id !== loan.id && o.contactId === loan.contactId && o.closed && !o.dead && o.milestoneAt.slice(0, 10) < start);
    const closedOn = c?.loan?.closedOn ?? null;
    if (earlier || (closedOn && closedOn.slice(0, 10) < start)) return SPHERE_KEY;
  }
  const first = ctx.first.get(loan.contactId);
  if (first) return first;
  if (c && (c.relationship === "past_client" || c.relationship === "sphere")) return SPHERE_KEY;
  return null;
}

type Acc = Omit<ScoreRow, "sharePct" | "perLeadCents" | "perCallableCents" | "perLoanCents" | "historyDays" | "badge"> & { seenLabel: string | null; contactsCounted: Set<string> };

/** The scorecard for one period. */
export function leadScorecard(input: ScoreInput): LeadScorecard {
  const { from, to } = periodWindow(input.period, input.now);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const fromDay = fromIso.slice(0, 10);
  const toDay = toIso.slice(0, 10);
  const inAt = (at: string) => at >= fromIso && at <= toIso;
  const inDay = (d: string | null | undefined) => !!d && d.slice(0, 10) >= fromDay && d.slice(0, 10) <= toDay;
  const targetCents = cleanTarget(input.targetCents ?? BADGE_RULES.defaultTargetCents);

  const rows = new Map<string, Acc>();
  const row = (key: string, seen?: string | null): Acc => {
    let r = rows.get(key);
    if (!r) {
      r = { key, label: "", sphere: key === SPHERE_KEY, spendCents: 0, leads: 0, canCall: 0, inPipeline: 0, closed: 0, repeats: 0, seenLabel: seen ?? null, contactsCounted: new Set() };
      rows.set(key, r);
    }
    if (!r.seenLabel && seen) r.seenLabel = seen;
    return r;
  };
  row(SPHERE_KEY);

  // History: the first day each source had a lead or spend, any time.
  const firstSeen = new Map<string, string>();
  const seen = (key: string, at: string) => {
    if (!key) return;
    const o = firstSeen.get(key);
    if (!o || at < o) firstSeen.set(key, at);
  };

  // 1. Leads, from events (every delivery; repeats are a subset).
  let undated = 0;
  const labels = new Map<string, string>();
  for (const e of input.events) if (e.sourceKey && e.sourceLabel && !labels.has(e.sourceKey)) labels.set(e.sourceKey, e.sourceLabel);
  for (const [k, v] of Object.entries(input.labels ?? {})) if (v && !labels.has(k)) labels.set(k, v);
  for (const e of input.events) {
    if (!e.sourceKey) continue;
    if (!dated(e)) {
      undated++;
      continue;
    }
    seen(e.sourceKey, e.at);
    if (!inAt(e.at)) continue;
    const r = row(e.sourceKey, e.sourceLabel);
    r.leads++;
    if (e.namesYou) r.canCall++;
    if (e.duplicate) r.repeats++;
    if (r.sphere) r.contactsCounted.add(e.contactId);
  }

  // 2. Spend: confirmed lead-spend lines, at their business-use share.
  for (const s of input.spend) {
    if (s.status !== "confirmed" || s.kind !== "expense" || !s.leadSource) continue;
    seen(s.leadSource, `${s.date.slice(0, 10)}T00:00:00.000Z`);
    if (!inDay(s.date)) continue;
    row(s.leadSource, labels.get(s.leadSource)).spendCents += leadSpendCents(s);
  }

  // 3. Loans, each credited to one row.
  const contacts = new Map(input.contacts.map((c) => [c.id, c]));
  const ctx = { loans: input.loans, contacts, first: firstSources(input.events) };
  let unattributed = 0;
  for (const l of input.loans) {
    const key = creditFor(l, ctx);
    const start = loanStart(l);
    const closedIn = l.closed && !l.dead && inAt(l.milestoneAt);
    if (!key) {
      if (closedIn) unattributed++;
      continue;
    }
    const startedIn = inDay(start);
    const openIn = !l.closed && !l.dead && startedIn;
    if (!closedIn && !openIn && !(key === SPHERE_KEY && startedIn)) continue;
    const r = row(key, labels.get(key));
    if (closedIn) r.closed++;
    else if (openIn) r.inPipeline++;
    // "Past clients & sphere": people who started a new loan in the period are its leads (once each).
    if (r.sphere && startedIn && l.contactId && !r.contactsCounted.has(l.contactId)) {
      r.contactsCounted.add(l.contactId);
      r.leads++;
      r.canCall++;
    }
  }

  const nowMs = input.now.getTime();
  const out: ScoreRow[] = [...rows.values()]
    .filter((r) => r.sphere || r.leads || r.spendCents || r.closed || r.inPipeline)
    .map(({ seenLabel, contactsCounted: _c, ...r }) => {
      void _c;
      const first = firstSeen.get(r.key);
      return {
        ...r,
        label: sourceLabel(r.key, seenLabel),
        sharePct: pctOf(r.canCall, r.leads),
        perLeadCents: per(r.spendCents, r.leads),
        perCallableCents: per(r.spendCents, r.canCall),
        perLoanCents: per(r.spendCents, r.closed),
        historyDays: first ? Math.max(0, Math.floor((nowMs - Date.parse(first)) / DAY)) : null,
        badge: null,
      };
    });
  assignBadges(out, targetCents);
  out.sort((a, b) => Number(b.sphere) - Number(a.sphere) || (a.perLoanCents ?? Infinity) - (b.perLoanCents ?? Infinity) || b.leads - a.leads || a.label.localeCompare(b.label));
  return { period: input.period, from: fromIso, to: toIso, targetCents, rows: out, undated, unattributed };
}

type BadgeFacts = Pick<ScoreRow, "sphere" | "spendCents" | "leads" | "sharePct" | "closed" | "inPipeline" | "perLoanCents" | "historyDays">;

/** Every badge rule that matches a row, before precedence (Best value is decided across rows). */
export function badgeRules(r: BadgeFacts, targetCents: number): Record<Exclude<ScoreBadge, "best">, boolean> {
  const R = BADGE_RULES;
  return {
    pause: r.spendCents >= R.pauseSpendCents && r.historyDays !== null && r.historyDays >= R.pauseHistoryDays && r.closed + r.inPipeline <= R.pauseLoans,
    thin: r.leads < R.enoughLeads,
    // No vendor wording to fix for your own past clients and sphere.
    fix: !r.sphere && r.leads >= R.enoughLeads && r.sharePct !== null && r.sharePct < R.fixShareBelowPct,
    scale: r.closed >= R.scaleMinLoans && r.perLoanCents !== null && r.perLoanCents <= targetCents,
    watch: r.spendCents > 0 && (r.closed < R.watchUnderLoans || (r.perLoanCents !== null && r.perLoanCents > targetCents)),
  };
}

/** One badge per row, by BADGE_PRECEDENCE. Best value goes to the lowest cost per loan among rows no earlier badge took. */
export function assignBadges(rows: ScoreRow[], targetCents: number): void {
  const rules = rows.map((r) => badgeRules(r, targetCents));
  const early = (i: number) => rules[i].pause || rules[i].thin || rules[i].fix;
  let best = -1;
  rows.forEach((r, i) => {
    if (early(i) || r.closed < BADGE_RULES.bestMinLoans || r.perLoanCents === null) return;
    const b = rows[best];
    if (best < 0 || r.perLoanCents < b.perLoanCents! || (r.perLoanCents === b.perLoanCents && (r.closed > b.closed || (r.closed === b.closed && r.label.localeCompare(b.label) < 0)))) best = i;
  });
  rows.forEach((r, i) => {
    const m = { ...rules[i], best: i === best };
    r.badge = BADGE_PRECEDENCE.find((k) => m[k]) ?? null;
  });
}

/** D84: the Business Manager's one lead-source move for a period, from the badges. */
export type LeadMove =
  | { kind: "pause"; from: ScoreRow; to: ScoreRow | null }
  | { kind: "fix"; source: ScoreRow };

/**
 * At most one move, deterministic: a source marked Pause? (the one with the
 * most spend) gives its budget to the Best value source (else the cheapest
 * Scale up) for 60 days; else the Fix permission source with the most leads
 * is asked for consent wording that names the loan officer. Your own past
 * clients and sphere are never the source a move takes budget from.
 */
export function leadSourceMove(card: Pick<LeadScorecard, "rows">): LeadMove | null {
  const rows = card.rows;
  const pause = rows.filter((r) => r.badge === "pause" && !r.sphere).sort((a, b) => b.spendCents - a.spendCents || a.label.localeCompare(b.label))[0];
  if (pause) {
    const to = rows.find((r) => r.badge === "best" && r.key !== pause.key) ?? rows.filter((r) => r.badge === "scale" && r.key !== pause.key).sort((a, b) => (a.perLoanCents ?? Infinity) - (b.perLoanCents ?? Infinity))[0] ?? null;
    return { kind: "pause", from: pause, to };
  }
  const fix = rows.filter((r) => r.badge === "fix").sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label))[0];
  return fix ? { kind: "fix", source: fix } : null;
}

/** Dollars for display: "$1,200", "—" for null. */
export const scoreUsd = (cents: number | null) => (cents === null ? "—" : `$${Math.round(cents / 100).toLocaleString("en-US")}`);
