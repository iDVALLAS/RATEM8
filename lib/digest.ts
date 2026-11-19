/**
 * lib/digest.ts — the morning email (D11). SERVER-ONLY.
 *
 * From Viato's "Jobs" ("every weekday at 7am text me my new leads and the
 * files that need a touch") and Broker Marketplace's daily Refi Finder
 * report. An opt-in summary of the loan officer's day: who's on Today, how
 * many drafts and notes wait, who to answer personally, and loans needing
 * a touch. Email is less protected than the app, so it carries first names
 * and counts only: no rates, no amounts, no client words, no phone numbers.
 * Sent once a day per loan officer, by the morning run.
 */
import type { User } from "@/lib/accounts/store";
import { emailConfig } from "@/lib/m8/server";
import { CONFIG } from "@/lib/config";
import { todayFor } from "@/lib/today/facts";
import { CARD_BRIEF } from "@/lib/concierge/agent";
import { conciergeStore } from "@/lib/concierge/store";
import { automationStore } from "@/lib/automations/store";
import { contactStore } from "@/lib/contacts/store";

const LOAN_KINDS = new Set(["journey", "loan_late", "lock", "closing"]);
const pacificDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

export type Digest = { subject: string; text: string; people: number; drafts: number; personal: number; notes: number; loans: number };

export async function digestFor(user: User, now = new Date()): Promise<Digest> {
  const nowIso = now.toISOString();
  const [today, drafts, tasks, notes] = await Promise.all([todayFor(user, now, { ownOnly: true }), conciergeStore().proposals(user.id, "pending"), conciergeStore().tasks(user.id), conciergeStore().pendingMemory(user.id, nowIso)]);
  const personal = tasks.filter((t) => t.lane === "personal");
  const firstOf = async (id: string) => (await contactStore().get(id))?.firstName || "someone";
  const loanCards = today.cards.filter((c) => LOAN_KINDS.has(c.kind));
  const people = today.cards.filter((c) => !LOAN_KINDS.has(c.kind));
  const first = (name: string) => name.split(/\s+/)[0] || "someone";
  const line = (name: string, kind: keyof typeof CARD_BRIEF) => `- ${first(name)}: ${CARD_BRIEF[kind]}`;
  const base = CONFIG.siteUrl.replace(/\/$/, "");
  const parts = [
    `Good morning${user.name ? `, ${user.name.split(/\s+/)[0]}` : ""}. Here's your day.`,
    "",
    personal.length ? `Answer personally (${personal.length}): ${(await Promise.all(personal.map((t) => firstOf(t.contactId)))).join(", ")}` : "",
    loanCards.length ? `Loans needing a touch (${loanCards.length}):\n${loanCards.slice(0, 8).map((c) => line(c.name, c.kind)).join("\n")}` : "",
    people.length ? `People worth reaching out to (${people.length}):\n${people.slice(0, 8).map((c) => line(c.name, c.kind)).join("\n")}` : "Nobody on Today right now.",
    drafts.length ? `Drafts waiting for your OK: ${drafts.length}` : "",
    notes.length ? `Notes to keep or forget: ${notes.length}` : "",
    "",
    `Open Command Center: ${base}/mlo`,
    `Start a call session: ${base}/mlo/calls`,
    "",
    "You get this because you turned on the morning email in your Concierge settings. Turn it off there any time.",
  ];
  return {
    subject: `Your day: ${people.length} ${people.length === 1 ? "person" : "people"}, ${drafts.length} draft${drafts.length === 1 ? "" : "s"}${personal.length ? `, ${personal.length} to answer personally` : ""}`,
    text: parts.filter((p, i, all) => p !== "" || (all[i - 1] ?? "") !== "").join("\n"),
    people: people.length,
    drafts: drafts.length,
    personal: personal.length,
    notes: notes.length,
    loans: loanCards.length,
  };
}

/** Sends today's digest once. "skipped" when it's off, already sent, or email isn't set up. */
export async function sendDigest(user: User, now = new Date(), send: (to: string, subject: string, text: string) => Promise<boolean> = resendSend): Promise<"sent" | "skipped" | "failed"> {
  const s = await conciergeStore().settings(user.id);
  if (!s.digest || user.status !== "active") return "skipped";
  const day = pacificDate(now);
  const d = await digestFor(user, now);
  if (!(await automationStore().claim({ key: `digest:${user.id}:${day}`, ownerUserId: user.id, recipeId: "morning_digest", contactId: null, loanId: null, outcome: "emailed", at: now.toISOString() }))) return "skipped";
  return (await send(user.email, d.subject, d.text)) ? "sent" : "failed";
}

async function resendSend(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = emailConfig();
  if (!cfg) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `LoanM8 Command Center <${cfg.from}>`, to: [to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
