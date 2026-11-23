/**
 * tests/lead-ask-harness.ts — D85: a small book for "Ask your Concierge" on Lead sources, in the memory stores.
 * Shared by lib/leads/ask.test.ts and tests/lead-ask-redteam.spec.ts. Test code only.
 */
import { afterEach, beforeEach } from "vitest";
import { MemoryContactStore, contactStore, setContactStoreForTests, type Contact } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, pipelineStore, setPipelineStoreForTests, type Loan } from "@/lib/pipeline/store";
import { MemoryExpenseStore, expenseStore, setExpenseStoreForTests, type Entry } from "@/lib/expenses/store";
import { MemoryCampaignStore, setCampaignStoreForTests } from "@/lib/campaigns/store";
import { MemoryPrefsStore, setPrefsStoreForTests } from "@/lib/profile/prefs";
import { MemoryTeamStore, setTeamStoreForTests } from "@/lib/agents/store";
import { MemoryLeadEventStore, leadEventStore, setLeadEventStoreForTests, type LeadEvent } from "@/lib/leads/events";
import { MemoryMonthlyStore, monthlyStore, setMonthlyStoreForTests } from "@/lib/leads/spend";
import { MemoryPlanStore, setPlanStoreForTests } from "@/lib/leads/plan-store";
import type { LeadAskCall } from "@/lib/concierge/desk";

export const NOW = new Date("2026-11-22T18:00:00Z");
const DAY = 86_400_000;
export const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const dayAgo = (days: number) => ago(days).slice(0, 10);

export const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
export const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
export const assistant: User = { ...me, id: "as1", email: "as1@x.com", role: "assistant", assistsUserId: "lo1" };

/** Fresh memory stores around each test. */
export function useLeadStores() {
  const setters = [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setExpenseStoreForTests, setTeamStoreForTests, setCampaignStoreForTests, setPrefsStoreForTests, setLeadEventStoreForTests, setMonthlyStoreForTests, setPlanStoreForTests] as const;
  beforeEach(() => {
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setExpenseStoreForTests(new MemoryExpenseStore());
    setTeamStoreForTests(new MemoryTeamStore());
    setCampaignStoreForTests(new MemoryCampaignStore());
    setPrefsStoreForTests(new MemoryPrefsStore());
    setLeadEventStoreForTests(new MemoryLeadEventStore());
    setMonthlyStoreForTests(new MemoryMonthlyStore());
    setPlanStoreForTests(new MemoryPlanStore());
  });
  afterEach(() => {
    for (const f of setters) f(null);
  });
}

const entry = (owner: string, id: string, leadSource: string | null, dollars: number, date: string): Entry => ({ id, ownerUserId: owner, kind: "expense", date, amountCents: dollars * 100, miles: null, vendor: "Vendor", category: "advertising", businessPct: 100, purpose: "", recipient: null, receiptId: null, source: "typed", leadSource, status: "confirmed", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
const event = (owner: string, key: string, label: string, contactId: string, days: number, namesYou = true): LeadEvent => ({ id: `le_${owner}_${contactId}_${days}`, ownerUserId: owner, sourceKey: key, sourceLabel: label, contactId, at: ago(days), duplicate: false, namesYou, externalId: null, origin: "delivery", datedBy: "delivery" });
const pLoan = (owner: string, id: string, contactId: string, closedDaysAgo: number): Loan => ({ id, ownerUserId: owner, externalId: id, source: "test", contactId, borrowerName: "Quinn Borrower", purpose: null, loanType: null, amount: 412_000, noteRate: 6.875, milestone: "Funded", milestoneAt: ago(closedDaysAgo), history: [], keyDates: { application: dayAgo(closedDaysAgo + 30), lockExpires: null, appraisal: null, clearToClose: null, closing: null }, agentName: null, closed: true, dead: false, updatedAt: NOW.toISOString() });

/** Personal data that must never reach the pack or the model. */
export const PERSONAL = ["Quinn Borrower", "Wendy Westbrook", "wendy@example.com", "(206) 555-0142", "2065550142", "6.875", "412,000", "412000"];

/**
 * The book: Bankrate 25 leads (10 named you, $1,500, no loans for a long time → Pause?), LendingTree 30 leads (6
 * named you → Fix permission), the web form 20 leads ($1,200, 2 loans closed → Best value), a Zillow monthly amount
 * of $1,200, and a contact with a name, phone, email and a loan with a rate.
 */
export async function seedBook(owner = "lo1") {
  for (let i = 0; i < 25; i++) await leadEventStore().add(event(owner, "bankrate", "Bankrate", `b${i}`, 20, i < 10));
  await leadEventStore().add(event(owner, "bankrate", "Bankrate", "b-old", 85));
  for (let i = 0; i < 30; i++) await leadEventStore().add(event(owner, "lendingtree", "LendingTree", `t${i}`, 20, i < 6));
  for (let i = 0; i < 20; i++) await leadEventStore().add(event(owner, "web-form", "Your web form", `w${i}`, 10));
  await expenseStore().put(entry(owner, `${owner}-e1`, "bankrate", 1500, dayAgo(30)));
  await expenseStore().put(entry(owner, `${owner}-e2`, "web-form", 1200, dayAgo(5)));
  await pipelineStore().put(pLoan(owner, `${owner}-l1`, "w0", 3));
  await pipelineStore().put(pLoan(owner, `${owner}-l2`, "w1", 4));
  await monthlyStore().put({ ownerUserId: owner, sourceKey: "zillow", sourceLabel: "Zillow", cents: 120_000, lastMonth: null, updatedAt: NOW.toISOString() });
  await contactStore().put({ firstName: "Wendy", lastName: "Westbrook", email: "wendy@example.com", phone: "+12065550142", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "lead", tags: [], notes: null, loan: { closedOn: null, amount: 412000, noteRate: 6.875 }, agent: null, id: "w0", provenance: "personal", locked: false, ownerUserId: owner, kind: "contact", source: "lead:web-form", createdAt: ago(10), updatedAt: ago(10) } as unknown as Contact);
}

/** A fake model: records what it was sent and answers with `say`. */
export function fakeModel(say: string | ((user: string) => string), stop: string | null = "end_turn") {
  const seen: { system: string; user: string }[] = [];
  const call: LeadAskCall = async (p) => {
    seen.push(p);
    return { text: typeof say === "function" ? say(p.user) : say, stop };
  };
  return { call, seen };
}
