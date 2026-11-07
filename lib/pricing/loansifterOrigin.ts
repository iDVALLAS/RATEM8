/**
 * lib/pricing/loansifterOrigin.ts — which web pages may hand LoanSifter
 * captures to LoanM8's receive page (C11).
 *
 * The Send to LoanM8 button opens /mlo/pricing/receive and passes each
 * capture with window.postMessage. The receive page publishes as the
 * logged-in admin, so it must ignore messages from any other site: a
 * different page that opened it could otherwise publish made-up prices.
 *
 * Allowed: https://loansifter.com and its subdomains, plus any exact
 * origins in LOANSIFTER_ORIGINS (comma-separated; https, or http on
 * localhost for testing), read on the server and
 * passed to the page. Kept separate from loansifter.ts so the browser
 * bundle never carries the lender list.
 */
const DEFAULT = /^https:\/\/([a-z0-9-]+\.)*loansifter\.com$/i;

export function isLoanSifterOrigin(origin: string, extra: readonly string[] = []): boolean {
  if (extra.includes(origin)) return true;
  return DEFAULT.test(origin);
}

/** Extra exact origins from LOANSIFTER_ORIGINS (server only). */
export function extraLoanSifterOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    // https anywhere; plain http only for this computer (local testing).
    .filter((s) => /^https:\/\/[^/\s]+$/i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(s));
}
