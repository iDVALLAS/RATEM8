/**
 * lib/today/facts.ts — gathers what the Today screen ranks (D5). SERVER-ONLY.
 */
import type { User } from "@/lib/accounts/store";
import { contactStore } from "@/lib/contacts/store";
import { scopeOf, summarize } from "@/lib/contacts/service";
import { touchStore } from "@/lib/messaging/store";
import { DAILY_SCENARIOS } from "@/lib/pricing/daily";
import { manualProvider } from "@/lib/pricing/providers/manual";
import { tenantForState } from "@/lib/pricing/tenants";
import { rankToday, type RateRef, type TodayCard } from "./rank";
import { pipelineStore } from "@/lib/pipeline/store";
import { alertsFor, learnPace } from "@/lib/pipeline/guardian";
import { view as journeyView } from "@/lib/journey/engine";
import { conciergeStore } from "@/lib/concierge/store";

/** Today's lowest priced example for the standard rate-and-term refinance, if fresh. Loan officer's eyes only. */
export async function refinanceReference(): Promise<RateRef> {
  const s = DAILY_SCENARIOS.find((x) => x.id === "wa-daily-refi-70");
  const tenant = s ? tenantForState(s.state) : undefined;
  if (!s || !tenant) return null;
  const run = await manualProvider.priceScenario(tenant.id, s).catch(() => null);
  const rates = run?.quotes.map((q) => q.noteRate).filter((r): r is number => typeof r === "number") ?? [];
  return run && rates.length ? { rate: Math.min(...rates), label: "30-year rate-and-term refinance at 70% of value", pricedAt: run.pricedAt } : null;
}

/** `ownOnly`: only the user's own book, even for the owner (the Concierge works one loan officer's clients). */
export async function todayFor(user: User, now = new Date(), opts: { ownOnly?: boolean } = {}): Promise<{ cards: TodayCard[]; people: number; ref: RateRef }> {
  const scope = opts.ownOnly ? user.id : scopeOf(user);
  const { contacts } = await contactStore().list({ ownerUserId: scope, limit: 500 });
  const [consents, threads, ref] = await Promise.all([contactStore().consentsFor(contacts.map((c) => c.id)), touchStore().threads(scope, 500), refinanceReference()]);
  const lastBy = new Map(threads.map((t) => [t.contactId, t]));
  const facts = contacts.map((contact) => {
    const t = lastBy.get(contact.id);
    return { contact, consent: summarize(consents.filter((e) => e.contactId === contact.id)), last: t ? { direction: t.direction, at: t.at, body: t.body } : null };
  });
  // D6: the milestone guardian's alerts, alongside people.
  const loans = await pipelineStore().list(scope);
  const pace = learnPace(loans);
  const loanCards: TodayCard[] = loans.flatMap((l) =>
    alertsFor(l, pace, now).map((a) => ({ kind: a.kind === "late" ? "loan_late" : a.kind, contactId: l.contactId ?? "", name: l.borrowerName, title: a.title, reason: a.reason, score: a.score, next: l.contactId ? "text" : "pipeline", loanId: l.id }) as TodayCard),
  );
  // D19: the Loan Journey's clocks (Loan Estimate due, Closing Disclosure wait, old VOE). The general appraisal-fee
  // hold is left to the journey page: it applies to every new loan and would crowd Today.
  const journeyCards: TodayCard[] = [];
  for (const l of loans.filter((x) => !x.closed && !x.dead)) {
    const v = await journeyView(l, now);
    for (const c of v.clocks.filter((x) => x.level !== "ok" && x.key !== "fee_hold")) journeyCards.push({ kind: "journey", contactId: l.contactId ?? "", name: l.borrowerName, title: `${l.borrowerName}: ${c.key === "le_due" ? "Loan Estimate deadline" : c.key === "cd_wait" ? "Closing Disclosure timing" : "employment re-verification"}`, reason: c.text, score: c.level === "stop" ? 97 : 82, next: "pipeline", loanId: l.id });
  }
  // D31: the loan officer's own promises, due today or overdue.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const promiseCards: TodayCard[] = (await conciergeStore().tasks(user.id)).filter((t) => t.lane === "promise" && t.due && t.due <= today).map((t) => ({ kind: "promise", contactId: t.contactId, name: t.title, title: t.due! < today ? `${t.title} (was due ${t.due})` : t.title, reason: t.why, score: t.due! < today ? 96 : 92, next: "open" }));
  const cards = [...promiseCards, ...journeyCards, ...loanCards, ...rankToday(facts, now, ref, 24)].sort((a, b) => b.score - a.score).slice(0, 15);
  return { cards, people: contacts.length + loans.length, ref };
}
