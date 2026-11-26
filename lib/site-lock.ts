/**
 * lib/site-lock.ts — the pre-launch lock (C22; owner 2026-11-18: "gate the
 * production app until I dig into all of the aspects, with the same
 * password"). Edge-safe: used by middleware.ts.
 *
 * ON in production unless SITE_LOCK is exactly "false"; SITE_LOCK="true"
 * turns it on anywhere. Vercel previews are left to Vercel's own login (and
 * the remote red team runs there). While on, only a visitor with a
 * VALID tester cookie (set by /demo with DEMO_PASSWORD) gets past the
 * password page; everyone else is sent to /demo, and API calls get 401.
 * The cookie's value is checked against the current password's hash, so
 * changing DEMO_PASSWORD signs everyone out. Without DEMO_PASSWORD nobody
 * gets in (fails closed).
 *
 * Always open while locked: the password page and its API, the
 * coming-soon homepage, the legally required pages (licensing,
 * disclosures, privacy, terms), the uptime check, robots.txt, static
 * files, and /mlo (it has its own login).
 */

export const TESTER_COOKIE = "loanm8_demo_auth";

export function siteLockOn(): boolean {
  const v = process.env.SITE_LOCK;
  if (v === "false") return false;
  return v === "true" || process.env.VERCEL_ENV === "production";
}

const OPEN_EXACT = new Set([
  "/",
  "/demo",
  "/api/demo-auth",
  "/api/health",
  "/licensing",
  "/licensing/texas",
  "/disclosures",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/favicon.ico",
  "/favicon.png",
  // D1: Command Center sign-in has its own checks.
  "/sign-in",
  // D34: the code step after the emailed link.
  "/sign-in/code",
  // D47: the emailed link lands here.
  "/sign-in/link",
  // D94: Face ID setup right after signing in (the page itself needs a sign-in).
  "/sign-in/face-id",
  // D45: loan officer sign-up has its own checks.
  "/sign-up",
  "/sign-up/confirm",
  "/api/cc/verify",
  "/api/cc/signout",
  "/api/cc/dev-login",
  // D94: Face ID sign-in and setup check their own challenges and sign-in.
  "/api/cc/passkey/signin-options",
  "/api/cc/passkey/signin",
  "/api/cc/passkey/register-options",
  "/api/cc/passkey/register",
  // D8: the scheduled Concierge run checks CRON_SECRET.
  "/api/cc/concierge/sweep",
  // D51: the campaign run checks CRON_SECRET.
  "/api/cc/campaigns/tick",
]);
// D4: Twilio webhooks are verified by signature, so they stay reachable while locked.
// D6: the loan intake checks its own per-loan-officer key.
const OPEN_PREFIXES = ["/my/", "/api/cc/expenses/", "/api/cc/mail/", "/api/cc/cards/", "/api/cc/videos/", "/api/cc/voicemail/", "/api/cc/loa/", "/v/", "/api/cc/export", "/api/cc/override/", "/api/pipeline/", "/api/leads/", "/api/zapier/", "/api/twilio/", "/demo/", "/_next/", "/fonts/", "/images/", "/brand/", "/team/", "/lenders/", "/mlo/", "/.well-known/"];

/** Reachable without the password while the lock is on. */
export function openWhileLocked(pathname: string): boolean {
  return OPEN_EXACT.has(pathname) || pathname === "/mlo" || OPEN_PREFIXES.some((p) => pathname.startsWith(p));
}

/** The cookie value /api/demo-auth sets: SHA-256 of "loanm8:" + password, as hex. */
export async function testerHash(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("loanm8:" + password));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let cached: { pw: string; hash: string } | null = null;

/** True when the cookie matches the current DEMO_PASSWORD. */
export async function validTesterCookie(value: string | undefined): Promise<boolean> {
  const pw = process.env.DEMO_PASSWORD;
  if (!pw || !value) return false;
  if (!cached || cached.pw !== pw) cached = { pw, hash: await testerHash(pw) };
  const a = value;
  const b = cached.hash;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
