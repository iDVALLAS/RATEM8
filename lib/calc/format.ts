/**
 * lib/calc/format.ts — formatting helpers for calculator display.
 *
 * All formatters are pure and side-effect-free. Use them in results,
 * URL-param serialization, and share-links.
 */

/** "$1,234" — whole dollars, comma thousands, no cents. */
export function formatDollars(n: number): string {
  if (!isFinite(n)) return "—";
  const rounded = Math.round(n);
  return "$" + rounded.toLocaleString("en-US");
}

/** "$1,234.56" — dollars with cents. Use for precise breakdowns. */
export function formatDollarsCents(n: number): string {
  if (!isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "6.375%" — always three decimals for rate display. */
export function formatRate(pct: number): string {
  if (!isFinite(pct)) return "—";
  return pct.toFixed(3).replace(/\.?0+$/, "") + "%";
}

/** "78.4%" — one decimal, for LTV, DTI, etc. */
export function formatPercent1(pct: number): string {
  if (!isFinite(pct)) return "—";
  return pct.toFixed(1) + "%";
}

/**
 * "3 yrs 4 mo" — humanize a month count for payoff/breakeven displays.
 * Handles 0 mo, singular/plural, and stray fractional months.
 */
export function formatMonths(months: number): string {
  if (!isFinite(months) || months <= 0) return "0 mo";
  const total = Math.round(months);
  const yrs = Math.floor(total / 12);
  const mo = total % 12;
  if (yrs === 0) return `${mo} mo`;
  if (mo === 0) return `${yrs} yr${yrs === 1 ? "" : "s"}`;
  return `${yrs} yr${yrs === 1 ? "" : "s"} ${mo} mo`;
}
