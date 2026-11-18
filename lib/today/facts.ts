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

/** Today's lowest priced example for the standard rate-and-term refinance, if fresh. Loan officer's eyes only. */
export async function refinanceReference(): Promise<RateRef> {
  const s = DAILY_SCENARIOS.find((x) => x.id === "wa-daily-refi-70");
  const tenant = s ? tenantForState(s.state) : undefined;
  if (!s || !tenant) return null;
  const run = await manualProvider.priceScenario(tenant.id, s).catch(() => null);
  const rates = run?.quotes.map((q) => q.noteRate).filter((r): r is number => typeof r === "number") ?? [];
  return run && rates.length ? { rate: Math.min(...rates), label: "30-year rate-and-term refinance at 70% of value", pricedAt: run.pricedAt } : null;
}

export async function todayFor(user: User, now = new Date()): Promise<{ cards: TodayCard[]; people: number; ref: RateRef }> {
  const { contacts } = await contactStore().list({ ownerUserId: scopeOf(user), limit: 500 });
  const [consents, threads, ref] = await Promise.all([contactStore().consentsFor(contacts.map((c) => c.id)), touchStore().threads(scopeOf(user), 500), refinanceReference()]);
  const lastBy = new Map(threads.map((t) => [t.contactId, t]));
  const facts = contacts.map((contact) => {
    const t = lastBy.get(contact.id);
    return { contact, consent: summarize(consents.filter((e) => e.contactId === contact.id)), last: t ? { direction: t.direction, at: t.at, body: t.body } : null };
  });
  return { cards: rankToday(facts, now, ref), people: contacts.length, ref };
}
