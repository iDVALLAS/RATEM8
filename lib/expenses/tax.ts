/**
 * lib/expenses/tax.ts — the published figures the expense tracker uses
 * (D37). Pure. Each has its source; when the IRS changes one, change it
 * here and nowhere else.
 */

/** Business standard mileage rate, cents per mile, by the date the trip was taken. */
export const MILEAGE_RATES: { from: string; cents: number; source: string }[] = [
  { from: "2025-01-01", cents: 70, source: "IRS Notice 2025-5" },
  { from: "2026-01-01", cents: 72.5, source: "IRS IR-2025-128 (Notice 2026-10)" },
  // The mid-year change for fuel prices, July 1 to December 31, 2026 (confirmed by the owner, 2026-11-19).
  { from: "2026-07-01", cents: 76, source: "IRS mid-year change, from July 1, 2026" },
];

/** Miles driven for a charity, cents per mile: set by statute (26 U.S.C. 170(i)), unchanged for years. A Schedule A item, not business. */
export const CHARITY_CENTS_PER_MILE = 14;

export function mileageRate(date: string): { cents: number; source: string } | null {
  const r = [...MILEAGE_RATES].reverse().find((x) => date >= x.from);
  return r ? { cents: r.cents, source: r.source } : null;
}

/** Simplified home office method (Rev. Proc. 2013-13; IRS Publication 587): $5 a square foot, up to 300. */
export const HOME_OFFICE = { centsPerSqFt: 500, maxSqFt: 300 } as const;
export const homeOfficeCents = (sqft: number) => Math.round(Math.max(0, Math.min(sqft, HOME_OFFICE.maxSqFt)) * HOME_OFFICE.centsPerSqFt);

/** Business meals are 50% deductible (IRC 274(n)). */
export const MEALS_SHARE = 0.5;
/** Business gifts: $25 per recipient per year (IRC 274(b)). */
export const GIFT_CAP_CENTS = 2500;

/** The four estimated-tax dates for a tax year (Form 1040-ES), moved to the next weekday when one falls on a weekend. */
export function estimatedTaxDates(year: number): string[] {
  const roll = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  return [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`].map(roll);
}

/** The next estimated-tax date on or after today. */
export function nextEstimatedDate(todayIso: string): string {
  const y = Number(todayIso.slice(0, 4));
  return [...estimatedTaxDates(y - 1), ...estimatedTaxDates(y)].find((d) => d >= todayIso) ?? estimatedTaxDates(y + 1)[0];
}
