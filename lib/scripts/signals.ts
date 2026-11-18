/**
 * lib/scripts/signals.ts — what a client might need, read from what the
 * loan officer already knows (D9 script builder). Pure and client-safe.
 *
 * A signal is a possible need with its reason in plain words, for the loan
 * officer's eyes. Every "why" is written so it can go to the model as is:
 * no rates, no payments, and nothing about protected traits. Agents get no
 * signals from production data (RETR's terms bar its data in AI or
 * automated processes); they get the partner check-in only.
 */
import type { ConsentSummary } from "@/lib/contacts/service";
import type { Contact } from "@/lib/contacts/store";
import type { Loan } from "@/lib/pipeline/store";

export const GOALS = ["auto", "reply", "loan_status", "anniversary", "refi_review", "arm_reset", "mortgage_insurance", "equity", "next_home", "referral", "permission", "re_engage", "check_in", "partner"] as const;
export type Goal = (typeof GOALS)[number];
export type ScriptGoal = Exclude<Goal, "auto">;

export const GOAL_LABELS: Record<Goal, string> = {
  auto: "Let the builder pick",
  reply: "Answer what they asked",
  loan_status: "Loan in process: status call",
  anniversary: "Home anniversary",
  refi_review: "Refinance review",
  arm_reset: "Adjustable rate coming up for a reset",
  mortgage_insurance: "Mortgage insurance review",
  equity: "Home projects or debt (equity options)",
  next_home: "Next home: moving, buying again, a second property",
  referral: "Ask for introductions",
  permission: "Ask how they'd like to hear from you",
  re_engage: "Reconnect with an earlier lead",
  check_in: "Relationship check-in",
  partner: "Agent partner check-in",
};

/** Texts after the call about their own loan are "service"; everything else is "marketing". */
export const SERVICE_GOALS: ScriptGoal[] = ["reply", "loan_status"];

export type Signal = { goal: ScriptGoal; label: string; why: string; strength: number; from: "pipeline" | "loan" | "memory" | "today" | "relationship" | "permission" };

/** A remembered fact the client stated (lib/concierge/store MemoryNote, the parts used here). */
export type RememberedNeed = { kind: string; fact: string };

export type SignalInput = {
  contact: Contact;
  /** Loans from their loan system linked to this contact. */
  loans: Loan[];
  memory: RememberedNeed[];
  consent: ConsentSummary;
  /** Today's card kinds for this person (reply, rate_gap, ...). */
  todayKinds: string[];
  /** Days since the last message either way; null if never. */
  daysSinceTouch: number | null;
};

const DAY = 86_400_000;
const yearsSince = (iso: string, now: Date) => (now.getTime() - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / (365.25 * DAY);

export const EQUITY_WORDS = /\b(remodel\w*|renovat\w*|kitchen|bath(room)?s?|roof|addition|adu|pool|deck|landscap\w*|solar|project|repairs?|debt|credit cards?|consolidat\w*|cash out|pay (it )?off|heloc|equity)\b/i;
export const MOVE_WORDS = /\b(mov(e|ing)|relocat\w*|bigger|upsiz\w*|downsiz\w*|second home|vacation home|cabin|rental|investment property|buy(ing)? (a|another|our next)|next (home|house|place)|sell(ing)? (the|our|my) (home|house|place))\b/i;
const BUYDOWN_WORDS = /\b(buy ?down|2-1|3-2-1|temporary)\b/i;
const ARM_TYPES = /\b(arm|adjustable)\b/i;

/** Years before an ARM's first change for common products (5/6, 7/6, 10/6, 5/1 …). */
function armFirstChange(loanType: string): number | null {
  const m = loanType.match(/\b(3|5|7|10)\s*\/\s*(1|6)\b/);
  return m ? Number(m[1]) : ARM_TYPES.test(loanType) ? 5 : null;
}

/** Signals for one contact, strongest first. Always ends with a check-in (or the partner call for agents). */
export function signalsFor(f: SignalInput, now: Date): Signal[] {
  const c = f.contact;
  const out: Signal[] = [];
  const add = (s: Signal) => {
    const at = out.findIndex((x) => x.goal === s.goal);
    if (at === -1) out.push(s);
    else if (out[at].strength < s.strength) out[at] = s;
  };
  if (f.todayKinds.includes("reply")) add({ goal: "reply", label: GOAL_LABELS.reply, why: "They wrote and are waiting for an answer.", strength: 98, from: "today" });

  if (c.kind === "agent") {
    add({ goal: "partner", label: GOAL_LABELS.partner, why: "An agent you work with. Scripts for agents use only what you know firsthand, never production data.", strength: 50, from: "relationship" });
    return out.sort((a, b) => b.strength - a.strength);
  }

  // Loans in process come first: these people are relying on you right now.
  for (const l of f.loans.filter((x) => !x.closed && !x.dead)) {
    const dates = [l.keyDates.lockExpires ? `lock expires ${l.keyDates.lockExpires}` : "", l.keyDates.closing ? `closing set for ${l.keyDates.closing}` : ""].filter(Boolean).join(", ");
    add({ goal: "loan_status", label: GOAL_LABELS.loan_status, why: `Their ${l.purpose ? `${l.purpose.toLowerCase()} ` : ""}loan is at "${l.milestone}"${dates ? ` (${dates})` : ""}.`, strength: f.todayKinds.some((k) => k === "loan_late" || k === "lock" || k === "closing") ? 95 : 88, from: "pipeline" });
  }

  const closedOn = c.loan?.closedOn ?? f.loans.find((l) => l.closed && l.keyDates.closing)?.keyDates.closing ?? null;
  const closedYears = closedOn ? yearsSince(closedOn, now) : null;

  if (f.todayKinds.includes("anniversary") && closedOn) add({ goal: "anniversary", label: GOAL_LABELS.anniversary, why: `Their loan closed ${closedOn.slice(0, 10)}; the anniversary is close.`, strength: 72, from: "today" });
  if (f.todayKinds.includes("rate_gap")) add({ goal: "refi_review", label: GOAL_LABELS.refi_review, why: "Their note rate is well above today's priced example (the numbers are on Today). Price their real scenario before you call.", strength: 80, from: "today" });

  // Closed loans from the loan system carry the product type.
  for (const l of f.loans.filter((x) => x.closed && x.loanType)) {
    const type = l.loanType ?? "";
    const closeIso = l.keyDates.closing ?? l.milestoneAt;
    const yrs = yearsSince(closeIso, now);
    const first = armFirstChange(type);
    if (first !== null && yrs > first - 0.75 && yrs < first + 0.25) add({ goal: "arm_reset", label: GOAL_LABELS.arm_reset, why: `Their ${type} loan closed ${closeIso.slice(0, 10)}; its first rate change is about ${first} years in, which is near.`, strength: 90, from: "pipeline" });
    if (/\bfha\b/i.test(type) && yrs >= 1) add({ goal: "mortgage_insurance", label: GOAL_LABELS.mortgage_insurance, why: `They have an FHA loan from ${closeIso.slice(0, 4)}. FHA mortgage insurance often stays for the life of the loan, so it may be worth seeing whether a conventional loan could drop it.`, strength: 55, from: "pipeline" });
    else if (/\bconv\w*\b/i.test(type) && yrs >= 2 && yrs <= 11) add({ goal: "mortgage_insurance", label: GOAL_LABELS.mortgage_insurance, why: `They have a conventional loan from ${closeIso.slice(0, 4)}. If it has mortgage insurance, they can usually ask to remove it once the balance reaches 80% of the original value.`, strength: 45, from: "pipeline" });
  }

  for (const m of f.memory) {
    if (EQUITY_WORDS.test(m.fact)) add({ goal: "equity", label: GOAL_LABELS.equity, why: `They mentioned: ${m.fact}`, strength: 86, from: "memory" });
    if (MOVE_WORDS.test(m.fact)) add({ goal: "next_home", label: GOAL_LABELS.next_home, why: `They mentioned: ${m.fact}`, strength: 86, from: "memory" });
    if (BUYDOWN_WORDS.test(m.fact)) add({ goal: "refi_review", label: GOAL_LABELS.refi_review, why: `They mentioned: ${m.fact}`, strength: 78, from: "memory" });
  }

  // The loan officer's own notes (their words, not the client's).
  if (c.notes && EQUITY_WORDS.test(c.notes)) add({ goal: "equity", label: GOAL_LABELS.equity, why: "Your notes on them mention a project, repairs or debt.", strength: 60, from: "loan" });
  if (c.notes && MOVE_WORDS.test(c.notes)) add({ goal: "next_home", label: GOAL_LABELS.next_home, why: "Your notes on them mention a move or another property.", strength: 60, from: "loan" });

  const past = c.relationship === "past_client" || closedYears !== null;
  if (past && closedYears !== null && closedYears >= 2) add({ goal: "equity", label: GOAL_LABELS.equity, why: `They've owned the home since ${closedOn!.slice(0, 4)}. Ask about plans for it; don't assume they want to borrow.`, strength: 35, from: "loan" });
  if (past && closedYears !== null && closedYears >= 0.5) add({ goal: "referral", label: GOAL_LABELS.referral, why: "A past client. If the call goes well, ask who they know who's thinking about buying or refinancing.", strength: 30, from: "relationship" });

  const anyPermission = Object.values(f.consent).some((p) => p.service.granted || p.marketing.granted);
  const stopped = Object.values(f.consent).some((p) => p.service.evidence === "revoked" || p.marketing.evidence === "revoked");
  if (!anyPermission && !stopped) add({ goal: "permission", label: GOAL_LABELS.permission, why: "There's no permission on file for texts or email. A short call to ask how they'd like to hear from you fixes that.", strength: f.todayKinds.includes("ask_permission") ? 62 : 40, from: "permission" });

  if (c.relationship === "lead" && closedYears === null && (f.daysSinceTouch === null || f.daysSinceTouch > 30)) add({ goal: "re_engage", label: GOAL_LABELS.re_engage, why: f.daysSinceTouch === null ? "A lead with no conversation on record yet." : `A lead you haven't talked with in ${f.daysSinceTouch} days.`, strength: 50, from: "relationship" });

  add({ goal: "check_in", label: GOAL_LABELS.check_in, why: f.daysSinceTouch === null ? "No conversation on record yet." : `Last conversation ${f.daysSinceTouch} days ago.`, strength: 20, from: "relationship" });
  return out.sort((a, b) => b.strength - a.strength);
}

/** The goal to build for: the one asked for, else the strongest signal. */
export function pickGoal(asked: Goal, signals: Signal[]): ScriptGoal {
  if (asked !== "auto") return asked;
  return signals[0]?.goal ?? "check_in";
}
