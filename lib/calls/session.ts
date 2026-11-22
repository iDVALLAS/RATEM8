/**
 * lib/calls/session.ts — the call session (D11). SERVER-ONLY.
 *
 * The compliant version of a power dialer (Viato rings three lines at once
 * and drops voicemails automatically): one person at a time, dialed by the
 * loan officer's own hand from a tel: link, with their script one tap
 * away. Each call is checked by the send gate first (permission, DNC within
 * 31 days, the daily call cap, quiet hours in their state); anyone blocked
 * is listed with the reason instead. No simultaneous ringing (FCC abandoned-
 * call rules, 47 CFR 64.1200(a)(7)) and no prerecorded voicemail drops
 * (prerecorded marketing messages need prior express written consent).
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { canSee, recordConsent } from "@/lib/contacts/service";
import { contactStore, type Contact, type Purpose } from "@/lib/contacts/store";
import { gateFor } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";
import { redactChatInput } from "@/lib/m8/redact";
import { todayFor } from "@/lib/today/facts";
import type { TodayCard } from "@/lib/today/rank";
import { scriptStore } from "@/lib/scripts/store";

const SERVICE_KINDS = new Set(["reply", "loan_late", "lock", "closing"]);
const pacificDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

export type CallItem = { card: TodayCard; contact: Contact; purpose: Purpose; allowed: boolean; reason: string | null; scriptId: string | null };

/** Today's people to call: ready first (in Today's order), then those the gate blocks, with why. */
export async function callQueue(user: User, now = new Date(), today0?: TodayCard[]): Promise<{ ready: CallItem[]; blocked: CallItem[]; done: number }> {
  // D76: Home passes the cards it already has, so the list is read once.
  const cards = today0 ?? (await todayFor(user, now)).cards;
  const seen = new Set<string>();
  const today = pacificDate(now);
  const ready: CallItem[] = [];
  const blocked: CallItem[] = [];
  let done = 0;
  for (const card of cards) {
    if (!card.contactId || seen.has(card.contactId)) continue;
    seen.add(card.contactId);
    const c = await contactStore().get(card.contactId);
    if (!c || !canSee(user, c) || !c.phone) continue;
    // Called (and logged) today already: off the list.
    if ((await touchStore().forContact(c.id, 20)).some((t) => t.channel === "call" && t.direction === "out" && pacificDate(new Date(t.at)) === today)) {
      done++;
      continue;
    }
    const purpose: Purpose = SERVICE_KINDS.has(card.kind) ? "service" : "marketing";
    const g = await gateFor(user, c, "call", purpose, now);
    const [script] = await scriptStore().forContact(user.id, c.id, 1);
    const item = { card, contact: c, purpose, allowed: g.allowed, reason: g.reasons[0] ?? null, scriptId: script?.id ?? null };
    (g.allowed ? ready : blocked).push(item);
  }
  return { ready, blocked, done };
}

/** D78: how many people a list's call session reads (each one is checked by the gate). */
export const LIST_CALLS_MAX = 100;

/**
 * D78: a call session from a saved list (or the Contacts page's filters):
 * the first `LIST_CALLS_MAX` people in it with a phone, not yet called today,
 * each checked by the gate for a sales call you dial yourself.
 */
export async function listCallQueue(user: User, rule: import("@/lib/contacts/filter").ListRule, label: string, now = new Date()): Promise<{ ready: CallItem[]; blocked: CallItem[]; done: number; total: number }> {
  const { peopleIn } = await import("@/lib/contacts/lists");
  const people = (await peopleIn(user, rule, 5000, now)).filter((c) => !!c.phone);
  const today = pacificDate(now);
  const ready: CallItem[] = [];
  const blocked: CallItem[] = [];
  let done = 0;
  for (const c of people.slice(0, LIST_CALLS_MAX)) {
    if ((await touchStore().forContact(c.id, 20)).some((t) => t.channel === "call" && t.direction === "out" && pacificDate(new Date(t.at)) === today)) {
      done++;
      continue;
    }
    const name = `${c.firstName} ${c.lastName}`.trim() || c.email || "Someone";
    const card: TodayCard = { kind: "check_in", contactId: c.id, name, title: label, reason: "", score: 0, next: "call" };
    const g = await gateFor(user, c, "call", "marketing", now);
    const [script] = await scriptStore().forContact(user.id, c.id, 1);
    (g.allowed ? ready : blocked).push({ card, contact: c, purpose: "marketing", allowed: g.allowed, reason: g.reasons[0] ?? null, scriptId: script?.id ?? null });
  }
  return { ready, blocked, done, total: people.length };
}

export const CALL_RESULTS = ["reached", "voicemail", "no_answer", "booked", "not_now", "asked_to_stop", "wrong_number"] as const;
export type CallResult = (typeof CALL_RESULTS)[number];
export const CALL_RESULT_LABELS: Record<CallResult, string> = { reached: "Talked", voicemail: "Left a voicemail", no_answer: "No answer", booked: "Set a next step", not_now: "Not interested now", asked_to_stop: "Asked not to be contacted", wrong_number: "Wrong number" };

/**
 * Logs a hand-dialed call on their conversation (counted toward the daily
 * call cap). "Asked not to be contacted" and "wrong number" record a stop on
 * every phone channel, the same as the Permission panel.
 */
export async function logCall(user: User, contactId: string, result: string, note: string, purpose: Purpose = "marketing", now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await contactStore().get(contactId);
  if (!c || !canSee(user, c)) return { ok: false, error: "No such contact." };
  if (!(CALL_RESULTS as readonly string[]).includes(result)) return { ok: false, error: "Pick how it went." };
  const r = result as CallResult;
  const clean = redactChatInput(note.trim()).text.slice(0, 400);
  await touchStore().add({ id: `t_${randomBytes(9).toString("base64url")}`, contactId: c.id, ownerUserId: c.ownerUserId, channel: "call", purpose, direction: "out", body: `Call: ${CALL_RESULT_LABELS[r]}${clean ? `. ${clean}` : ""}`, status: "logged", providerId: null, note: r === "not_now" ? "logged from a call session; declined a sales call" : "logged from a call session", at: now.toISOString(), actor: user.email, origin: "human" });
  if (r === "asked_to_stop" || r === "wrong_number") {
    const res = await recordConsent(user, c.id, { channel: "call", purpose: "marketing", granted: false, evidence: "revoked", proof: r === "wrong_number" ? `Wrong number, found on a call ${now.toISOString().slice(0, 10)}` : `Said so on a call logged ${now.toISOString().slice(0, 10)}` }, now);
    if (!res.ok) return res;
  }
  await accountStore().audit({ at: now.toISOString(), actor: user.email, action: "call.logged", detail: { contactId: c.id, result: r } });
  return { ok: true };
}

