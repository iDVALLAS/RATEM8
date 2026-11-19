/**
 * lib/today/rank.ts — the Today screen: who to reach out to, and why (D5).
 * Pure and client-safe. The server gathers the facts; this ranks them.
 *
 * Every card carries its reason in plain words and the one next step.
 * Nothing here sends anything: actions go through the send gate.
 */
import type { ConsentSummary } from "@/lib/contacts/service";
import type { Contact } from "@/lib/contacts/store";

export type CardKind = "promise" | "journey" | "new_lead" | "reply" | "anniversary" | "rate_gap" | "check_in" | "ask_permission" | "agent" | "loan_late" | "lock" | "closing";

export type TodayCard = {
  kind: CardKind;
  contactId: string;
  name: string;
  title: string;
  reason: string;
  score: number;
  /** What the loan officer can do in one tap. */
  next: "reply" | "call" | "text" | "record_permission" | "open" | "pipeline";
  /** D19: the loan this card is about, for "Open the journey". */
  loanId?: string;
};

export type TodayFacts = {
  contact: Contact;
  consent: ConsentSummary;
  /** Latest message in either direction, if any. */
  last: { direction: "in" | "out"; at: string; body: string } | null;
};

export type RateRef = { rate: number; label: string; pricedAt: string } | null;

const DAY = 24 * 3600 * 1000;
const name = (c: Contact) => `${c.firstName} ${c.lastName}`.trim() || c.email || "Someone";
const canText = (s: ConsentSummary) => s.text.service.granted || s.text.marketing.granted;
const anyPermission = (s: ConsentSummary) => Object.values(s).some((p) => p.service.granted || p.marketing.granted);

/** Days until the next anniversary of an ISO date (0 = today). */
export function daysToAnniversary(iso: string, now: Date): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const y = now.getUTCFullYear();
  let next = Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), 12);
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate(), 12);
  if (next < today) next = Date.UTC(y + 1, d.getUTCMonth(), d.getUTCDate(), 12);
  return Math.round((next - today) / DAY);
}

export function cardsFor(f: TodayFacts, now: Date, ref: RateRef): TodayCard[] {
  const c = f.contact;
  if (c.locked) return [];
  const out: TodayCard[] = [];
  const n = name(c);
  const stopped = Object.values(f.consent).some((p) => p.service.evidence === "revoked" || p.marketing.evidence === "revoked");

  // 1. They wrote and nobody answered.
  if (f.last?.direction === "in" && !stopped) {
    const hours = Math.max(0, Math.round((now.getTime() - Date.parse(f.last.at)) / 3_600_000));
    out.push({ kind: "reply", contactId: c.id, name: n, title: `${n} is waiting for a reply`, reason: `“${f.last.body.slice(0, 80)}${f.last.body.length > 80 ? "…" : ""}” · ${hours < 1 ? "just now" : `${hours} hours ago`}`, score: 100 + Math.min(hours, 48), next: "reply" });
  }
  if (stopped) return out;

  // D14: a new lead nobody has contacted yet. Speed matters most in the first hours.
  if (c.source.startsWith("lead:") && !f.last && now.getTime() - Date.parse(c.createdAt) < 2 * DAY) {
    const hrs = Math.max(0, Math.round((now.getTime() - Date.parse(c.createdAt)) / 3_600_000));
    out.push({ kind: "new_lead", contactId: c.id, name: n, title: `New lead: ${n}`, reason: `From ${c.source.slice(6)}, ${hrs < 1 ? "just now" : `${hrs} hours ago`}. ${anyPermission(f.consent) ? "Their form gave you permission." : "Their form didn't name you, so there's no permission on file yet: check their page before you reach out."}`, score: 99 - Math.min(hrs, 40) / 4, next: anyPermission(f.consent) ? "call" : "open" });
  }

  // D6: agents aren't ranked. RETR's terms (2026-09-17) bar using its data
  // in AI, rules engines or automated processes, so agent production numbers
  // are only shown to the loan officer on the agent's page.
  if (c.kind === "agent") return out;

  // 2. Home anniversary in the next two weeks.
  if (c.loan?.closedOn) {
    const d = daysToAnniversary(c.loan.closedOn, now);
    const annivYear = new Date(now.getTime() + d * DAY).getUTCFullYear();
    const years = annivYear - Number(c.loan.closedOn.slice(0, 4));
    if (d <= 14 && years >= 1) out.push({ kind: "anniversary", contactId: c.id, name: n, title: `${n}'s ${years}-year home anniversary ${d === 0 ? "is today" : `is in ${d} day${d === 1 ? "" : "s"}`}`, reason: `Their loan closed ${c.loan.closedOn}. A good reason to check in${canText(f.consent) ? "" : " (call them; there's no texting permission yet)"}.`, score: 75 - d, next: canText(f.consent) ? "text" : "call" });
  }

  // 3. Their rate is well above today's priced example (shown to the loan officer only).
  if (c.loan?.noteRate && ref && c.loan.noteRate - ref.rate >= 0.75) {
    const gap = (c.loan.noteRate - ref.rate).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    out.push({ kind: "rate_gap", contactId: c.id, name: n, title: `${n} may be worth a refinance look`, reason: `Their note rate is ${c.loan.noteRate}%. Today's priced example for a ${ref.label} is ${ref.rate}% (${gap} lower; a dated example, not their quote). Price their actual scenario before you say anything about rates.`, score: 70 + Math.min(Number(gap) * 10, 20), next: "call" });
  }

  // 4. Permission on file but no contact in 90 days.
  if (anyPermission(f.consent) && (!f.last || now.getTime() - Date.parse(f.last.at) > 90 * DAY)) {
    out.push({ kind: "check_in", contactId: c.id, name: n, title: `Check in with ${n}`, reason: f.last ? `Last in touch ${Math.round((now.getTime() - Date.parse(f.last.at)) / DAY)} days ago.` : "You have permission on file and haven't been in touch here yet.", score: 50, next: canText(f.consent) ? "text" : "call" });
  }

  // 5. Past clients with no permission yet: ask.
  if (c.relationship === "past_client" && !anyPermission(f.consent) && !f.last) {
    out.push({ kind: "ask_permission", contactId: c.id, name: n, title: `Ask ${n} how they'd like to hear from you`, reason: "A past client with no permission on file. Call them yourself, then record what they say, so M8 can help later.", score: 30, next: "record_permission" });
  }
  return out;
}

/** The top cards across everyone, at most one per person (their best), highest score first. */
export function rankToday(facts: TodayFacts[], now: Date, ref: RateRef, limit = 12): TodayCard[] {
  const best = facts.map((f) => cardsFor(f, now, ref).sort((a, b) => b.score - a.score)[0]).filter((x): x is TodayCard => !!x);
  return best.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
