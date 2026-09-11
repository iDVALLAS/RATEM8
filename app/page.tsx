import { cookies } from "next/headers";
import ComingSoonHomePage from "@/components/ComingSoonHomePage";
import MarketingHomePage from "@/components/MarketingHomePage";

export const metadata = {
  // Public metadata uses the coming-soon framing since anonymous
  // visitors (and search engines, which never carry the auth cookie)
  // see that version. Authenticated testers just don't see the tab
  // title change — it stays "LoanM8 — Coming soon" for them too, which
  // is fine.
  title: "LoanM8 — Coming soon",
  description:
    "LoanM8 Loan Intelligence is being built. Preview the M8 demo by invitation.",
  robots: { index: false, follow: false },
};

/**
 * Cookie-aware homepage selector (v11 Tier 2 follow-up).
 *
 * - Anonymous visitors (no `loanm8_demo_auth` cookie) see the
 *   ComingSoonHomePage — the quiet "M8 is being built." page with
 *   a link to /demo.
 * - Authenticated testers (cookie present, signed by the current
 *   DEMO_PASSWORD) see the full MarketingHomePage — the breathing
 *   VoiceOrb, TermField, eight principles, how-it-works, For Agents,
 *   About Jason. The site as it will be post-launch.
 *
 * The cookie check here is SHALLOW — we only verify the cookie
 * exists. The deep hash validation still happens in /demo/page.tsx
 * before chat content renders. So:
 *   - Stale-cookie visitors (after DEMO_PASSWORD rotation) still
 *     see the marketing homepage. Low risk — no confidential
 *     content on the marketing pages, and their /demo access is
 *     already gone.
 *   - Anonymous visitors are always blocked from the marketing
 *     homepage until they enter the password on /demo.
 *
 * When `NEXT_PUBLIC_STEALTH_MODE=false` (public launch), this file
 * can be simplified to always render MarketingHomePage — the cookie
 * check becomes irrelevant.
 *
 * `cookies()` is async in Next 15 App Router; this must be an
 * async server component.
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const authed = !!cookieStore.get("loanm8_demo_auth");

  if (authed) {
    return <MarketingHomePage />;
  }
  return <ComingSoonHomePage />;
}
