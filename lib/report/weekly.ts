/**
 * lib/report/weekly.ts — the loan officer's week in numbers (D27). SERVER-ONLY.
 *
 * What went out and came back, calls logged, new leads, loans that moved,
 * and what happened to the drafts. Counts only, so it can go by email. The
 * week before sits alongside for comparison. Sent Monday mornings to those
 * who turn it on (Concierge settings), once a week.
 */
import type { User } from "@/lib/accounts/store";
import { contactStore } from "@/lib/contacts/store";
import { touchStore } from "@/lib/messaging/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { conciergeStore } from "@/lib/concierge/store";
import { automationStore } from "@/lib/automations/store";
import { emailConfig } from "@/lib/m8/server";
import { CONFIG } from "@/lib/config";

const DAY = 86_400_000;

export type WeekNumbers = {
  textsSent: number;
  replies: number;
  optOuts: number;
  callsLogged: number;
  callsTalked: number;
  newLeads: number;
  newContacts: number;
  loanMoves: number;
  loansClosed: number;
  draftsSent: number;
  draftsDismissed: number;
};

export const LABELS: Record<keyof WeekNumbers, string> = {
  textsSent: "Texts sent",
  replies: "Replies from clients",
  optOuts: "People who said stop",
  callsLogged: "Calls logged",
  callsTalked: "Calls where you talked",
  newLeads: "New leads",
  newContacts: "New contacts",
  loanMoves: "Loan stage changes",
  loansClosed: "Loans closed or funded",
  draftsSent: "Drafts you approved and sent",
  draftsDismissed: "Drafts you dismissed",
};

async function numbers(user: User, from: Date, to: Date): Promise<WeekNumbers> {
  const f = from.toISOString();
  const t = to.toISOString();
  const inRange = (iso: string | null | undefined) => !!iso && iso >= f && iso < t;
  const touches = (await touchStore().since(user.id, f)).filter((x) => x.at < t);
  const { contacts } = await contactStore().list({ ownerUserId: user.id, limit: 5000 });
  const loans = await pipelineStore().list(user.id);
  const drafts = await conciergeStore().proposals(user.id);
  const optOut = (note: string | null) => (note ?? "").startsWith("Opt-out recorded");
  return {
    textsSent: touches.filter((x) => x.channel === "text" && x.direction === "out" && !["failed", "blocked", "undelivered"].includes(x.status)).length,
    replies: touches.filter((x) => x.channel === "text" && x.direction === "in" && !optOut(x.note)).length,
    optOuts: touches.filter((x) => x.direction === "in" && optOut(x.note)).length,
    callsLogged: touches.filter((x) => x.channel === "call" && x.direction === "out").length,
    callsTalked: touches.filter((x) => x.channel === "call" && x.direction === "out" && /Talked|next step/i.test(x.body)).length,
    newLeads: contacts.filter((c) => c.source.startsWith("lead:") && inRange(c.createdAt)).length,
    newContacts: contacts.filter((c) => inRange(c.createdAt)).length,
    loanMoves: loans.reduce((n, l) => n + l.history.filter((h) => inRange(h.at)).length, 0),
    loansClosed: loans.filter((l) => l.closed && l.history.some((h) => inRange(h.at))).length,
    draftsSent: drafts.filter((d) => d.status === "sent" && inRange(d.decidedAt)).length,
    draftsDismissed: drafts.filter((d) => d.status === "dismissed" && inRange(d.decidedAt)).length,
  };
}

export type Weekly = { from: string; to: string; week: WeekNumbers; before: WeekNumbers };

export async function weeklyFor(user: User, now = new Date()): Promise<Weekly> {
  const end = now;
  const start = new Date(end.getTime() - 7 * DAY);
  const prior = new Date(start.getTime() - 7 * DAY);
  const [week, before] = await Promise.all([numbers(user, start, end), numbers(user, prior, start)]);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), week, before };
}

export function weeklyText(user: User, w: Weekly): string {
  const rows = (Object.keys(LABELS) as (keyof WeekNumbers)[]).map((k) => `- ${LABELS[k]}: ${w.week[k]} (week before: ${w.before[k]})`);
  return [`Your week, ${w.from} to ${w.to}${user.name ? `, ${user.name.split(/\s+/)[0]}` : ""}:`, "", ...rows, "", `See it in Command Center: ${CONFIG.siteUrl.replace(/\/$/, "")}/mlo/report`, "", "You get this because you turned on the weekly report in your Concierge settings."].join("\n");
}

const pacific = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short" }).format(d);

/** Mondays (Pacific), once a week, to those who turned it on. */
export async function sendWeekly(user: User, now = new Date(), send: (to: string, subject: string, text: string) => Promise<boolean> = resendSend): Promise<"sent" | "skipped" | "failed"> {
  const s = await conciergeStore().settings(user.id);
  if (!s.weekly || user.status !== "active" || pacific(now) !== "Mon") return "skipped";
  const week = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  if (!(await automationStore().claim({ key: `weekly:${user.id}:${week}`, ownerUserId: user.id, recipeId: "weekly_report", contactId: null, loanId: null, outcome: "emailed", at: now.toISOString() }))) return "skipped";
  const w = await weeklyFor(user, now);
  return (await send(user.email, `Your week: ${w.week.textsSent} texts, ${w.week.callsLogged} calls, ${w.week.loanMoves} loan updates`, weeklyText(user, w))) ? "sent" : "failed";
}

async function resendSend(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = emailConfig();
  if (!cfg) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `LoanM8 Command Center <${cfg.from}>`, to: [to], subject, text }) });
    return res.ok;
  } catch {
    return false;
  }
}
