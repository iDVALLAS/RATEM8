/**
 * lib/agents/business.ts — the Business Manager (D54.1). SERVER-ONLY.
 * Numbers from the loan officer's own expenses, loans and leads:
 * profit so far this year, a tax set-aside to discuss with their CPA, cost
 * per closed loan, and which lead sources turn into loans. Reminders:
 * expense drafts to confirm, receipts missing, quarterly estimated taxes.
 */
import type { User } from "@/lib/accounts/store";
import { listAll } from "@/lib/contacts/store";
import { yearSummary } from "@/lib/expenses/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { WEB_FORM_KEY } from "@/lib/leads/source-key";
import { leadSourceMove, scoreUsd, type LeadScorecard, type ScoreBadge, type ScoreRow } from "@/lib/leads/scorecard";
import { scorecardFor } from "@/lib/leads/score-service";
import { LEAD_MOVES } from "@/lib/content/cc-pages";
import { reviewMove } from "./compliance";
import { teamStore } from "./store";
import type { Proposal } from "./runner";

/** A common starting point for self-employed set-asides; the CPA sets the real number. */
export const SET_ASIDE = 0.25;
const DAY = 86_400_000;

export type Snapshot = {
  year: number;
  incomeCents: number;
  expenseCents: number;
  profitCents: number;
  setAsideCents: number;
  loansClosed: number;
  costPerLoanCents: number | null;
  drafts: number;
  missingReceipts: number;
  /**
   * D84: the Lead sources scorecard for the last 90 days (the same numbers the page shows): per source, spend at its
   * business share, leads, leads you can call, loans closed and in progress, cost per lead and per loan, and its badge.
   */
  sources: SourceLine[];
};

export type SourceLine = { key: string; source: string; spendCents: number; leads: number; canCall: number; sharePct: number | null; perLeadCents: number | null; perCallableCents: number | null; inPipeline: number; loans: number; perLoanCents: number | null; repeats: number; badge: ScoreBadge | null };

/** The scorecard rows the Business Manager reads (rows with nothing in the period are left out). */
export const sourceLines = (card: Pick<LeadScorecard, "rows">): SourceLine[] =>
  card.rows
    .filter((r) => r.leads || r.spendCents || r.closed || r.inPipeline)
    .map((r) => ({ key: r.key, source: r.label, spendCents: r.spendCents, leads: r.leads, canCall: r.canCall, sharePct: r.sharePct, perLeadCents: r.perLeadCents, perCallableCents: r.perCallableCents, inPipeline: r.inPipeline, loans: r.closed, perLoanCents: r.perLoanCents, repeats: r.repeats, badge: r.badge }));

export async function snapshot(user: User, now = new Date()): Promise<Snapshot> {
  const year = now.getUTCFullYear();
  const [y, loans, contacts] = await Promise.all([yearSummary(user, year).catch(() => null), pipelineStore().list(user.id).catch(() => []), listAll({ ownerUserId: user.id, kind: "contact" }).then((r) => r.contacts).catch(() => [])]);
  const card = await scorecardFor(user, "90d", now, { contacts }).catch(() => null);
  const closedThisYear = loans.filter((l) => l.closed && !l.dead && l.milestoneAt.startsWith(String(year)));
  const income = y?.incomeCents ?? 0;
  const spent = y?.expenseCents ?? 0;
  const profit = income - spent;
  return {
    year,
    incomeCents: income,
    expenseCents: spent,
    profitCents: profit,
    setAsideCents: profit > 0 ? Math.round(profit * SET_ASIDE) : 0,
    loansClosed: closedThisYear.length,
    costPerLoanCents: closedThisYear.length ? Math.round(spent / closedThisYear.length) : null,
    drafts: y?.drafts ?? 0,
    missingReceipts: y?.missingReceipts ?? 0,
    sources: card ? sourceLines(card).slice(0, 12) : [],
  };
}

/** A source's name in the middle of a sentence ("your web form", "your past clients & sphere"). */
const mid = (r: ScoreRow) => (r.key === WEB_FORM_KEY ? "your web form" : r.sphere ? "your past clients & sphere" : r.label);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * D84: the one lead-source move for this period, worded, or null. Deterministic from the scorecard's badges
 * (`leadSourceMove`). Its key names the kind, the source and the month.
 */
export function leadMoveProposal(card: Pick<LeadScorecard, "rows">, now: Date, task: (agent: "business", key: string, title: string, why: string, score: number, extra?: Partial<Proposal>) => Proposal): Proposal | null {
  const m = leadSourceMove(card);
  if (!m) return null;
  const month = now.toISOString().slice(0, 7);
  if (m.kind === "pause") {
    const title = m.to ? LEAD_MOVES.pauseTo(m.from.label, mid(m.to)) : LEAD_MOVES.pause(m.from.label);
    const why = [LEAD_MOVES.pauseWhy(m.from.label, scoreUsd(m.from.spendCents), m.from.leads), m.to ? LEAD_MOVES.toWhy(cap(mid(m.to)), scoreUsd(m.to.perLoanCents)) : "", LEAD_MOVES.tail].filter(Boolean).join(" ");
    return task("business", `lead-source:pause:${m.from.key}:${month}`, title, why, 50, { kind: "plan", href: "/mlo/leads", cooldownDays: LEAD_MOVE_DAYS });
  }
  const r = m.source;
  const why = `${LEAD_MOVES.fixWhy(r.label, r.leads, r.canCall, r.sharePct ?? 0)} ${LEAD_MOVES.tail}`;
  return task("business", `lead-source:fix:${r.key}:${month}`, LEAD_MOVES.fix(r.label), why, 48, { kind: "plan", href: "/mlo/leads", cooldownDays: LEAD_MOVE_DAYS });
}

/** At most one lead-source move in this many days (the Business Manager's period). */
export const LEAD_MOVE_DAYS = 30;

/** Whether a lead-source move was already made in the last LEAD_MOVE_DAYS days (any answer). */
async function leadMoveRecently(user: User, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - LEAD_MOVE_DAYS * DAY).toISOString();
  const recent = await teamStore().moves(user.id, { status: "any", since, limit: 2000 }).catch(() => []);
  return recent.some((m) => m.key.startsWith("lead-source:") && m.createdAt >= since);
}

/** Federal estimated tax due dates (the 15th; a weekend or holiday moves it). */
const DUE = [{ m: 0, d: 15, label: "the fourth-quarter" }, { m: 3, d: 15, label: "the first-quarter" }, { m: 5, d: 15, label: "the second-quarter" }, { m: 8, d: 15, label: "the third-quarter" }];

export async function businessIdeas(user: User, now: Date, task: (agent: "business", key: string, title: string, why: string, score: number, extra?: Partial<Proposal>) => Proposal): Promise<Proposal[]> {
  const out: Proposal[] = [];
  const s = await snapshot(user, now);
  // D84: at most one lead-source move per period, from the same scorecard as Lead sources, checked by Compliance.
  if (!(await leadMoveRecently(user, now))) {
    const card = await scorecardFor(user, "90d", now).catch(() => null);
    const p = card ? leadMoveProposal(card, now, task) : null;
    if (p && reviewMove(p, "client").ok) out.push(p);
  }
  if (s.drafts) out.push(task("business", `exp-drafts:${now.toISOString().slice(0, 10)}`, `Confirm ${s.drafts} expense draft${s.drafts === 1 ? "" : "s"}`, "They don't count toward your books until you confirm them.", 28, { href: "/mlo/expenses", cooldownDays: 7 }));
  if (s.missingReceipts) out.push(task("business", `receipts:${now.toISOString().slice(0, 7)}`, `${s.missingReceipts} expense${s.missingReceipts === 1 ? "" : "s"} missing a receipt`, "Snap or upload them while you still have them; your CPA will ask.", 26, { href: "/mlo/expenses", cooldownDays: 14 }));
  for (const d of DUE) {
    const year = d.m === 0 && now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const due = Date.UTC(year, d.m, d.d);
    const days = Math.ceil((due - now.getTime()) / DAY);
    if (days >= 0 && days <= 14) {
      const amount = s.setAsideCents > 0 ? ` So far this year, ${Math.round(SET_ASIDE * 100)}% of your profit is about $${Math.round(s.setAsideCents / 100).toLocaleString("en-US")}, a common starting point; your CPA sets the real amount.` : "";
      out.push(task("business", `est-tax:${year}-${d.m + 1}`, `Estimated tax payment due ${new Date(due).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`, `${d.label[0].toUpperCase()}${d.label.slice(1)} federal estimated payment for self-employed income.${amount}`, 60 - days, { href: "/mlo/expenses", cooldownDays: 30 }));
    }
  }
  return out;
}
