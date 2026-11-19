/**
 * lib/concierge/promises.ts — the Promises ledger (D31).
 *
 * From the research spec (§1.1, "3:00 p.m. Promises ledger"): last Thursday
 * the loan officer texted "I'll send you numbers Tuesday"; on Tuesday,
 * Command Center reminds them. It reads only the loan officer's own words
 * (texts they sent and their call notes), never the client's, and it's
 * deterministic: no model. Each promise becomes a reminder due that day,
 * shown on Today.
 */
import { randomBytes } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import type { Contact } from "@/lib/contacts/store";
import { automationStore } from "@/lib/automations/store";
import { checkNote } from "./guard";
import { conciergeStore } from "./store";

const DAY = 86_400_000;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "I'll", "I will", "I'm going to", "let me", "I can", followed by what and when. */
const PROMISE = /\b(?:i'?ll|i will|i'?m going to|i am going to|let me|i can|i'?ll be sure to)\s+([^.!?\n]{3,90}?)\s*(?:,\s*)?\b(today|tonight|this (?:afternoon|evening|morning)|by (?:the )?end of (?:the )?day|eod|tomorrow(?: morning| afternoon)?|first thing tomorrow|(?:on |by |this |next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next week|later this week|by (?:the )?end of (?:the )?week|this week)\b/gi;

export type Promise_ = { what: string; when: string; due: string; sentence: string };

const pacificParts = (d: Date) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, weekday: DAYS.indexOf(get("weekday").toLowerCase()) };
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The day a "when" phrase means, from `now` (Pacific, where the loan officer works). */
export function dueFor(when: string, now: Date): string {
  const { iso, weekday } = pacificParts(now);
  const w = when.toLowerCase();
  if (/today|tonight|this (afternoon|evening|morning)|end of (the )?day|eod/.test(w)) return iso;
  if (/tomorrow/.test(w)) return addDays(iso, 1);
  if (/next week/.test(w)) return addDays(iso, ((1 - weekday + 7) % 7) || 7); // the coming Monday
  if (/end of (the )?week|later this week|this week/.test(w)) return addDays(iso, Math.max(0, 5 - weekday)); // Friday (or today, on a weekend)
  const d = DAYS.findIndex((x) => w.includes(x));
  // A named day is its next occurrence after today ("Tuesday" said on a Tuesday means a week out).
  if (d >= 0) return addDays(iso, (d - weekday + 7) % 7 || 7);
  return iso;
}

/** Promises in a loan officer's own words, with their due dates. At most three per message. */
export function findPromises(text: string, now: Date): Promise_[] {
  const out: Promise_[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const sentence of sentences) {
    PROMISE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROMISE.exec(sentence)) !== null && out.length < 3) {
      const what = m[1].replace(/\s+(?:by|on|until|before)$/i, "").replace(/\s+/g, " ").trim();
      if (what.split(" ").length < 2) continue;
      out.push({ what, when: m[2].toLowerCase(), due: dueFor(m[2], now), sentence: sentence.trim().slice(0, 240) });
    }
  }
  return out;
}

// ---- Recording (server-only: stores and the guard) ----

/** Turns the loan officer's own promises in a sent text or call note into reminders (once per source). */
export async function recordPromises(user: User, c: Contact, text: string, sourceId: string, now = new Date()): Promise<number> {
  let n = 0;
  const first = c.firstName || "them";
  for (const [i, p] of findPromises(text, now).entries()) {
    const title = checkNote(`Your promise to ${first}: ${p.what} (${p.when})`, { names: [c.firstName, c.lastName] });
    const why = checkNote(`You wrote on ${now.toISOString().slice(0, 10)}: "${p.sentence}"`, { names: [c.firstName, c.lastName] });
    if (!title.ok) continue;
    if (!(await automationStore().claim({ key: `promise:${sourceId}:${i}`, ownerUserId: user.id, recipeId: "promise", contactId: c.id, loanId: null, outcome: "reminder", at: now.toISOString() }))) continue;
    await conciergeStore().putTask({ id: `k_${randomBytes(9).toString("base64url")}`, ownerUserId: c.ownerUserId, contactId: c.id, title: title.text.slice(0, 200), why: why.ok ? why.text : "From your own words.", due: p.due, done: false, createdAt: now.toISOString(), lane: "promise" });
    n++;
  }
  return n;
}
