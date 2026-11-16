/**
 * lib/call-hours.ts — when "Call {first} now" shows in M8 chat (C19).
 * Owner, 2026-11-16: tap to call from 9 to 6; otherwise "Have {first} call
 * me", with "Book a time" always third. Pacific time, every day (change
 * CALL_HOURS.days to drop weekends). Client-safe.
 */
export const CALL_HOURS = {
  timeZone: "America/Los_Angeles",
  startHour: 9,
  endHour: 18,
  /** 0 = Sunday … 6 = Saturday. */
  days: [0, 1, 2, 3, 4, 5, 6] as number[],
  label: "9 AM–6 PM Pacific",
};

function pacificParts(now: Date): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CALL_HOURS.timeZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function inCallHours(now: Date = new Date()): boolean {
  const { day, hour } = pacificParts(now);
  return CALL_HOURS.days.includes(day) && hour >= CALL_HOURS.startHour && hour < CALL_HOURS.endHour;
}

/** "Sunday 8:14 PM" in Pacific time, for M8's prompt. */
export function pacificNow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CALL_HOURS.timeZone, weekday: "long", hour: "numeric", minute: "2-digit" }).format(now);
}

/** "206-234-2734" → "tel:+12062342734"; null if it isn't a 10-digit US number. */
export function telHref(phone: string | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return /^\d{10}$/.test(d) ? `tel:+1${d}` : null;
}
