/**
 * lib/loa/dates.ts — business days and the federal clocks the LOA keeps
 * (D62). Pure; dates are "YYYY-MM-DD".
 *
 *  - TRID's specific business day (12 CFR 1026.2(a)(6)): every calendar day
 *    except Sundays and the federal holidays in 5 U.S.C. 6103(a). Used for
 *    the Closing Disclosure's 3 days, and (the earlier, safer count) for
 *    the Loan Estimate's 3 days after application.
 *  - Weekdays (Monday to Friday, less federal holidays): the Selling Guide's
 *    10 business days for a verbal re-verification of employment
 *    (B3-3.1-07).
 */

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const ymd = (x: Date) => x.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const x = d(s);
  x.setUTCDate(x.getUTCDate() + n);
  return ymd(x);
};

/** The nth weekday (0=Sun) of a month, or the last one when n is -1. */
function nth(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1, 12));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return ymd(new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7, 12)));
  }
  const last = new Date(Date.UTC(year, month + 1, 0, 12));
  const back = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(new Date(Date.UTC(year, month + 1, -back, 12)));
}

/** Federal holidays as observed (a Saturday holiday on Friday, a Sunday one on Monday). */
export function federalHolidays(year: number): Set<string> {
  const fixed = (m: number, day: number) => {
    const x = new Date(Date.UTC(year, m, day, 12));
    if (x.getUTCDay() === 6) x.setUTCDate(day - 1);
    if (x.getUTCDay() === 0) x.setUTCDate(day + 1);
    return ymd(x);
  };
  return new Set([
    fixed(0, 1), nth(year, 0, 1, 3), nth(year, 1, 1, 3), nth(year, 4, 1, -1), fixed(5, 19), fixed(6, 4),
    nth(year, 8, 1, 1), nth(year, 9, 1, 2), fixed(10, 11), nth(year, 10, 4, 4), fixed(11, 25),
    // New Year's Day of next year observed on Dec 31 when it falls on a Saturday.
    ...(new Date(Date.UTC(year + 1, 0, 1)).getUTCDay() === 6 ? [`${year}-12-31`] : []),
  ]);
}

const holiday = (s: string) => federalHolidays(Number(s.slice(0, 4))).has(s);
export const isTridBusinessDay = (s: string) => d(s).getUTCDay() !== 0 && !holiday(s);
export const isWeekday = (s: string) => ![0, 6].includes(d(s).getUTCDay()) && !holiday(s);

/** Moves n business days from a date (negative goes back), by the given rule. */
export function addBusinessDays(s: string, n: number, rule: (x: string) => boolean): string {
  let x = s;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    x = addDays(x, step);
    if (rule(x)) left--;
  }
  return x;
}

/** The Loan Estimate must be delivered or mailed by this date (3 business days after application). */
export const leDueBy = (application: string) => addBusinessDays(application, 3, isTridBusinessDay);
/** The Closing Disclosure must be received by this date (3 business days before consummation). */
export const cdReceivedBy = (signing: string) => addBusinessDays(signing, -3, isTridBusinessDay);
/** Sent by mail or e-mail without confirmed receipt, it's presumed received 3 business days later: send by this date. */
export const cdSendBy = (signing: string) => addBusinessDays(signing, -6, isTridBusinessDay);
/** The earliest date a verbal re-verification of employment counts (10 business days before the note date). */
export const voeWindowOpens = (noteDate: string) => addBusinessDays(noteDate, -10, isWeekday);

export const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const daysUntil = (s: string, today: string) => Math.round((d(s).getTime() - d(today).getTime()) / 86_400_000);
