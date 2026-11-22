/**
 * lib/inbox/state.ts — where each conversation stands in the Inbox (D79).
 * Client-safe and pure: no stores, no clock of its own.
 *
 * A conversation "needs a reply" when its latest message came in from the
 * person and the loan officer hasn't marked it done or snoozed it since.
 * A new message from them always brings it back: Done and Snooze only cover
 * the messages that were there when they were pressed. A STOP isn't
 * something to answer (the contact rules won't let a reply go), so it reads
 * "Said stop" and never waits in Needs reply.
 *
 * Times are shown, and "tomorrow 9 AM" is worked out, in the loan
 * officer's own time zone (their settings), never a fixed one.
 */

export const INBOX_TABS = ["needs", "all", "done"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

/** needs: their message is waiting; sent: you wrote last; done: you marked it; snoozed: back later; stopped: they said stop. */
export type ThreadState = "needs" | "sent" | "done" | "snoozed" | "stopped";

/** What the loan officer pressed on a conversation. Stored per person (the thread is theirs). */
export type InboxMark = {
  contactId: string;
  ownerUserId: string;
  /** Done: covers every message up to this time. */
  doneAt: string | null;
  /** Snooze: pressed at `snoozedAt`, back at `snoozeUntil`. */
  snoozedAt: string | null;
  snoozeUntil: string | null;
  by: string;
  updatedAt: string;
};

/** The latest message in a conversation, as much as the state needs. */
export type Latest = { direction: "in" | "out"; at: string; note: string | null };

const OPTED_OUT = /^Opt-out recorded/;

export function threadState(latest: Latest, mark: InboxMark | null, now: Date): ThreadState {
  if (latest.direction === "out") return mark?.doneAt && mark.doneAt >= latest.at ? "done" : "sent";
  if (OPTED_OUT.test(latest.note ?? "")) return "stopped";
  if (mark?.doneAt && mark.doneAt >= latest.at) return "done";
  if (mark?.snoozedAt && mark.snoozeUntil && mark.snoozedAt >= latest.at && mark.snoozeUntil > now.toISOString()) return "snoozed";
  return "needs";
}

/** Which tab a conversation shows in. "All" has everything. */
export function inTab(state: ThreadState, tab: InboxTab): boolean {
  if (tab === "all") return true;
  if (tab === "needs") return state === "needs";
  return state === "done";
}

export const tabOf = (raw: string | undefined | null): InboxTab => (INBOX_TABS.includes(raw as InboxTab) ? (raw as InboxTab) : "needs");

// ─── Time zones ───────────────────────────────────────────────────────────

/** The zones a loan officer can pick (US, with Arizona and the territories' own). */
export const TIME_ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona (no daylight saving)"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Puerto_Rico", "Atlantic (Puerto Rico)"],
] as const;
export type TimeZone = (typeof TIME_ZONES)[number][0];
export const DEFAULT_ZONE: TimeZone = "America/Los_Angeles";
export const isZone = (z: unknown): z is TimeZone => TIME_ZONES.some(([k]) => k === z);
export const zoneLabel = (z: string) => TIME_ZONES.find(([k]) => k === z)?.[1] ?? "Pacific";

/** The wall clock in a zone: year, month (1–12), day, hour, minute, weekday (0 = Sunday). */
export function wallClock(at: Date, zone: string): { y: number; mo: number; d: number; h: number; mi: number; wd: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return { y: Number(get("year")), mo: Number(get("month")), d: Number(get("day")), h: Number(get("hour")) % 24, mi: Number(get("minute")), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

/** The moment a wall-clock time happens in a zone (daylight saving included). */
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, zone: string): Date {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  // Two passes settle the zone's offset at that moment (it can differ across a daylight-saving change).
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(t), zone);
    const seen = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
    t += want - seen;
  }
  return new Date(t);
}

/** "Snooze until tomorrow 9 AM": 9 AM on the next calendar day where the loan officer is. */
export function tomorrowAt(now: Date, zone: string, hour = 9): Date {
  const w = wallClock(now, zone);
  const next = new Date(Date.UTC(w.y, w.mo - 1, w.d + 1));
  return zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hour, 0, zone);
}

/** A time in the loan officer's zone: "Nov 21, 3:05 PM". */
export function whenIn(iso: string, zone: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A short time for a list row: "3:05 PM" today, "Mon" this week, else "Nov 14". */
export function shortWhen(iso: string, zone: string, now: Date): string {
  const at = new Date(iso);
  const a = wallClock(at, zone);
  const n = wallClock(now, zone);
  if (a.y === n.y && a.mo === n.mo && a.d === n.d) return at.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
  if (now.getTime() - at.getTime() < 6 * 86_400_000) return at.toLocaleDateString("en-US", { timeZone: zone, weekday: "short" });
  return at.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" });
}

// ─── Notification hours ───────────────────────────────────────────────────

/** Inside the loan officer's notification hours, [from, to) local hours. `to` may be 24. */
export function inHours(now: Date, zone: string, from: number, to: number): boolean {
  const { h } = wallClock(now, zone);
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/** The next time the notification hours open (now, if they're open). */
export function nextOpen(now: Date, zone: string, from: number, to: number): Date {
  if (inHours(now, zone, from, to)) return now;
  const w = wallClock(now, zone);
  const today = zonedTime(w.y, w.mo, w.d, from, 0, zone);
  return today > now ? today : tomorrowAt(now, zone, from);
}

export const hourLabel = (h: number) => (h === 0 || h === 24 ? "midnight" : h === 12 ? "noon" : `${h % 12} ${h < 12 ? "AM" : "PM"}`);
