/**
 * lib/journey/timing.ts — the federal clocks in a loan file (D17). Pure.
 *
 * Reg Z has two meanings of "business day" (12 CFR 1026.2(a)(6)):
 *  - general: a day the creditor's offices are open for business. We use
 *    Monday to Friday, with federal holidays counted as open, so the
 *    Loan Estimate deadline comes out no later than the real one.
 *  - specific (waiting periods, such as the Closing Disclosure's 3 days):
 *    every day except Sundays and federal public holidays. We treat both
 *    the actual holiday and its observed weekday as closed, so the
 *    earliest signing date comes out no earlier than the real one.
 * The loan officer's compliance team confirms; every date here is shown
 * as "by our count".
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12));
const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
  const first = utc(y, m, 1);
  return utc(y, m, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
};
const lastWeekday = (y: number, m: number, weekday: number) => {
  const last = utc(y, m + 1, 0);
  return utc(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
};

/** Federal public holidays for a year (5 U.S.C. 6103(a)), actual dates and their observed weekdays. */
export function federalHolidays(y: number): Set<string> {
  const fixed = [utc(y, 0, 1), utc(y, 5, 19), utc(y, 6, 4), utc(y, 10, 11), utc(y, 11, 25)];
  const floating = [nthWeekday(y, 0, 1, 3), nthWeekday(y, 1, 1, 3), lastWeekday(y, 4, 1), nthWeekday(y, 8, 1, 1), nthWeekday(y, 9, 1, 2), nthWeekday(y, 10, 4, 4)];
  const out = new Set<string>();
  for (const d of [...fixed, ...floating]) out.add(iso(d));
  for (const d of fixed) {
    if (d.getUTCDay() === 6) out.add(iso(new Date(d.getTime() - 86_400_000)));
    if (d.getUTCDay() === 0) out.add(iso(new Date(d.getTime() + 86_400_000)));
  }
  return out;
}

const day = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`);
const isHoliday = (d: Date) => federalHolidays(d.getUTCFullYear()).has(iso(d));

/** Adds n business days. "general": Mon–Fri. "specific": Mon–Sat, no federal holidays. */
export function addBusinessDays(from: string, n: number, kind: "general" | "specific"): string {
  let d = day(from);
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() + 86_400_000);
    const wd = d.getUTCDay();
    const open = kind === "general" ? wd !== 0 && wd !== 6 : wd !== 0 && !isHoliday(d);
    if (open) left--;
  }
  return iso(d);
}

/** Business days between two dates (exclusive of `from`). */
export function businessDaysBetween(from: string, to: string, kind: "general" | "specific"): number {
  let n = 0;
  let d = day(from);
  const end = day(to);
  while (d < end) {
    d = new Date(d.getTime() + 86_400_000);
    const wd = d.getUTCDay();
    if (kind === "general" ? wd !== 0 && wd !== 6 : wd !== 0 && !isHoliday(d)) n++;
  }
  return n;
}

export type Clock = { key: "le_due" | "fee_hold" | "cd_wait" | "voe"; level: "ok" | "warn" | "stop"; text: string };

export type ClockInput = {
  today: string;
  applicationOn: string | null;
  leSentOn: string | null;
  intentToProceedOn: string | null;
  cdSentOn: string | null;
  signingOn: string | null;
  voeOn: string | null;
};

/** The clocks that matter right now, worst first. */
export function clocks(x: ClockInput): Clock[] {
  const out: Clock[] = [];
  if (x.applicationOn && !x.leSentOn) {
    const due = addBusinessDays(x.applicationOn, 3, "general");
    out.push({ key: "le_due", level: x.today > due ? "stop" : x.today >= addBusinessDays(x.applicationOn, 2, "general") ? "warn" : "ok", text: x.today > due ? `The Loan Estimate was due by ${due} (3 business days after the application on ${x.applicationOn}), by our count. Send it now and check with compliance.` : `Loan Estimate due by ${due}, by our count (3 business days after the application on ${x.applicationOn}).` });
  }
  if (!x.intentToProceedOn) out.push({ key: "fee_hold", level: "warn", text: "No appraisal fee (or any fee besides the credit report) until they've received the Loan Estimate and told you they intend to proceed. Record it when they do." });
  if (x.cdSentOn) {
    const earliest = addBusinessDays(x.cdSentOn, 3, "specific");
    const tooSoon = !!x.signingOn && x.signingOn < earliest;
    out.push({ key: "cd_wait", level: tooSoon ? "stop" : "ok", text: tooSoon ? `Signing on ${x.signingOn} is too soon: the Closing Disclosure went out ${x.cdSentOn}, so the earliest signing is ${earliest} by our count (3 business days, Sundays and federal holidays don't count). Move the signing or check with compliance.` : `Earliest signing: ${earliest}, by our count (3 business days after the Closing Disclosure on ${x.cdSentOn}; this assumes they received it that day).` });
  } else if (x.signingOn) {
    out.push({ key: "cd_wait", level: "warn", text: `Signing is set for ${x.signingOn}, but no Closing Disclosure is recorded yet. They need it at least 3 business days before signing.` });
  }
  if (x.voeOn && x.signingOn && businessDaysBetween(x.voeOn, x.signingOn, "general") > 10) {
    out.push({ key: "voe", level: "warn", text: `The employment re-verification on ${x.voeOn} is more than 10 business days before the signing on ${x.signingOn}. Most investors need it within 10 business days of the note date; redo it.` });
  }
  const rank = { stop: 0, warn: 1, ok: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
