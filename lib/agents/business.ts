/**
 * lib/agents/business.ts — the Business Manager (D54.1). SERVER-ONLY.
 * Numbers from the loan officer's own expenses, loans and leads:
 * profit so far this year, a tax set-aside to discuss with their CPA, cost
 * per closed loan, and which lead sources turn into loans. Reminders:
 * expense drafts to confirm, receipts missing, quarterly estimated taxes.
 */
import type { User } from "@/lib/accounts/store";
import { contactStore } from "@/lib/contacts/store";
import { yearSummary } from "@/lib/expenses/service";
import { pipelineStore } from "@/lib/pipeline/store";
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
  sources: { source: string; leads: number; loans: number }[];
};

export async function snapshot(user: User, now = new Date()): Promise<Snapshot> {
  const year = now.getUTCFullYear();
  const [y, loans, contacts] = await Promise.all([yearSummary(user, year).catch(() => null), pipelineStore().list(user.id).catch(() => []), contactStore().list({ ownerUserId: user.id, kind: "contact", limit: 5000 }).then((r) => r.contacts).catch(() => [])]);
  const closedThisYear = loans.filter((l) => l.closed && !l.dead && l.milestoneAt.startsWith(String(year)));
  const income = y?.incomeCents ?? 0;
  const spent = y?.expenseCents ?? 0;
  const profit = income - spent;
  const loanContacts = new Set(loans.filter((l) => l.contactId && !l.dead).map((l) => l.contactId as string));
  const bySource = new Map<string, { leads: number; loans: number }>();
  for (const c of contacts) {
    if (!c.source.startsWith("lead:")) continue;
    const s = c.source.slice(5).trim() || "unknown";
    const row = bySource.get(s) ?? { leads: 0, loans: 0 };
    row.leads++;
    if (loanContacts.has(c.id)) row.loans++;
    bySource.set(s, row);
  }
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
    sources: [...bySource.entries()].map(([source, r]) => ({ source, ...r })).sort((a, b) => b.leads - a.leads).slice(0, 8),
  };
}

/** Federal estimated tax due dates (the 15th; a weekend or holiday moves it). */
const DUE = [{ m: 0, d: 15, label: "the fourth-quarter" }, { m: 3, d: 15, label: "the first-quarter" }, { m: 5, d: 15, label: "the second-quarter" }, { m: 8, d: 15, label: "the third-quarter" }];

export async function businessIdeas(user: User, now: Date, task: (agent: "business", key: string, title: string, why: string, score: number, extra?: Partial<Proposal>) => Proposal): Promise<Proposal[]> {
  const out: Proposal[] = [];
  const s = await snapshot(user, now);
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
