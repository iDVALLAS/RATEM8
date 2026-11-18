/**
 * lib/pipeline/guardian.ts — the milestone guardian (D6). Pure.
 *
 * Learns each loan officer's own pace: how long their loans usually sit in
 * each stage (the median from their history, once there are 3 or more),
 * otherwise a cautious default. A loan is "late" when it has sat 50% longer
 * than usual and at least 2 days more. Also: locks expiring in 5 days and
 * closings in 3 days without clear-to-close. Never promises a date.
 */
import type { Loan } from "./store";

const DAY = 24 * 3600 * 1000;
const DEFAULT_DAYS: [RegExp, number][] = [
  [/application|app taken|registered|lead|prospect|pre-?qual|pre-?approv/i, 5],
  [/disclos/i, 3],
  [/process/i, 7],
  [/submit|underwrit/i, 5],
  [/condition|suspen/i, 6],
  [/approv/i, 5],
  [/clear to close|ctc/i, 4],
  [/doc|closing/i, 3],
];
export const stageKey = (m: string) => m.trim().toLowerCase();
const defaultDays = (m: string) => DEFAULT_DAYS.find(([re]) => re.test(m))?.[1] ?? 7;

/** Median days per stage from this loan officer's finished stages. */
export function learnPace(loans: Loan[]): Record<string, number> {
  const spans: Record<string, number[]> = {};
  for (const l of loans)
    for (let i = 0; i < l.history.length - 1; i++) {
      const d = (Date.parse(l.history[i + 1].at) - Date.parse(l.history[i].at)) / DAY;
      (spans[stageKey(l.history[i].milestone)] ??= []).push(d);
    }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(spans))
    if (v.length >= 3) {
      const s = [...v].sort((a, b) => a - b);
      out[k] = s[Math.floor(s.length / 2)];
    }
  return out;
}

export type LoanAlert = { loanId: string; kind: "late" | "lock" | "closing"; title: string; reason: string; score: number };

export function alertsFor(l: Loan, pace: Record<string, number>, now: Date): LoanAlert[] {
  if (l.closed || l.dead) return [];
  const out: LoanAlert[] = [];
  const days = (now.getTime() - Date.parse(l.milestoneAt)) / DAY;
  const usual = pace[stageKey(l.milestone)] ?? defaultDays(l.milestone);
  if (days > Math.max(usual * 1.5, usual + 2)) {
    out.push({ loanId: l.id, kind: "late", title: `${l.borrowerName}'s loan has been in "${l.milestone}" for ${Math.floor(days)} days`, reason: `Your loans usually move on in about ${Math.round(usual)} days${pace[stageKey(l.milestone)] ? "" : " (a starting estimate until you have more history)"}. A short update to the borrower${l.agentName ? ` and ${l.agentName}` : ""} now saves a worried call later.`, score: 85 + Math.min(Math.floor(days - usual), 10) });
  }
  // Whole calendar days from today (Pacific, where the loan officer works) to the date.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const until = (iso: string | null) => (iso ? Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY) : null);
  const lock = until(l.keyDates.lockExpires);
  if (lock !== null && lock >= 0 && lock <= 5) out.push({ loanId: l.id, kind: "lock", title: `${l.borrowerName}'s rate lock expires ${lock === 0 ? "today" : `in ${lock} day${lock === 1 ? "" : "s"}`}`, reason: `Lock expires ${l.keyDates.lockExpires}; the loan is in "${l.milestone}". Decide on an extension before it lapses.`, score: 95 - lock });
  const close = until(l.keyDates.closing);
  if (close !== null && close >= 0 && close <= 3 && !l.keyDates.clearToClose && !/clear to close|ctc|doc|fund/i.test(l.milestone)) out.push({ loanId: l.id, kind: "closing", title: `${l.borrowerName} is scheduled to close ${close === 0 ? "today" : `in ${close} day${close === 1 ? "" : "s"}`} without clear-to-close`, reason: `Closing ${l.keyDates.closing}; still in "${l.milestone}". Check what's outstanding and set expectations honestly (never promise the date).`, score: 98 - close });
  return out;
}
