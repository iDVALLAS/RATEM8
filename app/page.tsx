import type { Metadata } from "next";
import { cookies } from "next/headers";
import { TESTER_COOKIE, siteLockOn, validTesterCookie } from "@/lib/site-lock";
import ComingSoonHomePage from "@/components/ComingSoonHomePage";
import MarketingHomePage from "@/components/MarketingHomePage";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { routeFor } from "@/lib/site";

/**
 * Stealth gate: while NEXT_PUBLIC_STEALTH_MODE is anything but "false",
 * anonymous visitors (no `loanm8_demo_auth` cookie) get the quiet
 * coming-soon page and the route is not indexed. Set it to "false" and
 * everyone gets the marketing homepage.
 */
const STEALTH = process.env.NEXT_PUBLIC_STEALTH_MODE !== "false";

const home = routeFor("/");

export const metadata: Metadata = {
  title: { absolute: home?.title ?? `${CONFIG.brandName} — ${copy.brand.tagline}` },
  description: home?.description ?? copy.hero.sub,
  ...(STEALTH ? { robots: { index: false, follow: false } } : {}),
};

/**
 * C22: the cookie's value is checked against the current DEMO_PASSWORD
 * (lib/site-lock.ts); it used to be enough for the cookie to exist.
 * `cookies()` is async in Next 15, so this stays an async server
 * component.
 */
export default async function HomePage() {
  if (STEALTH || siteLockOn()) {
    const cookieStore = await cookies();
    const authed = await validTesterCookie(cookieStore.get(TESTER_COOKIE)?.value);
    if (!authed) return <ComingSoonHomePage />;
  }
  return <MarketingHomePage />;
}
