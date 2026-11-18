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
    alertsFor(l, pace, now).map((a) => ({ kind: a.kind === "late" ? "loan_late" : a.kind, contactId: l.contactId ?? "", name: l.borrowerName, title: a.title, reason: a.reason, score: a.score, next: l.contactId ? "text" : "pipeline" }) as TodayCard),
  );
  const cards = [...loanCards, ...rankToday(facts, now, ref, 24)].sort((a, b) => b.score - a.score).slice(0, 15);
  return { cards, people: contacts.length + loans.length, ref };
}
