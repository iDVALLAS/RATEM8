/**
 * lib/leads/score-service.ts — D84: the scorecard from the loan officer's own
 * data. SERVER-ONLY.
 *
 * Reads their lead events, their confirmed lead-spend lines (Expenses are
 * private to their owner), their pipeline loans and their contacts, then
 * hands them to the pure `leadScorecard()`. Own book only: an assistant has
 * no scorecard (no spend), so this is never called for one.
 */
import type { User } from "@/lib/accounts/store";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { expenseStore } from "@/lib/expenses/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { prefsFor } from "@/lib/profile/prefs";
import { leadEventStore, type LeadEvent } from "./events";
import { monthlyStore } from "./spend";
import { leadScorecard, type LeadScorecard, type ScorePeriod } from "./scorecard";

export async function scorecardFor(user: User, period: ScorePeriod, now = new Date(), opts: { events?: LeadEvent[]; contacts?: Contact[] } = {}): Promise<LeadScorecard> {
  return (await scorecardsFor(user, [period], now, opts))[0];
}

/** D86: several periods from one read of the stores (the planner's estimates read 30 days, 90 days and this year). */
export async function scorecardsFor(user: User, periods: readonly ScorePeriod[], now = new Date(), opts: { events?: LeadEvent[]; contacts?: Contact[] } = {}): Promise<LeadScorecard[]> {
  const [events, spend, loans, contacts, prefs, monthly] = await Promise.all([
    opts.events ?? leadEventStore().list(user.id).catch(() => []),
    expenseStore().list(user.id, null).catch(() => []),
    pipelineStore().list(user.id).catch(() => []),
    opts.contacts ?? contactStore().list({ ownerUserId: user.id, kind: "contact", limit: 5000 }).then((r) => r.contacts).catch(() => []),
    prefsFor(user),
    monthlyStore().list(user.id).catch(() => []),
  ]);
  const base = {
    now,
    events: events.filter((e) => e.ownerUserId === user.id),
    spend: spend.filter((e) => e.ownerUserId === user.id),
    loans: loans.filter((l) => l.ownerUserId === user.id),
    contacts: contacts.filter((c) => c.ownerUserId === user.id),
    targetCents: prefs.leadTargetCents,
    labels: Object.fromEntries(monthly.map((m) => [m.sourceKey, m.sourceLabel])),
  };
  return periods.map((period) => leadScorecard({ ...base, period }));
}
