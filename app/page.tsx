import type { Metadata } from "next";
import { cookies } from "next/headers";
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
 * The cookie check is SHALLOW — only presence. The deep hash
 * validation happens in /demo before any gated content renders.
 * `cookies()` is async in Next 15, so this stays an async server
 * component.
 */
export default async function HomePage() {
  if (STEALTH) {
    const cookieStore = await cookies();
    const authed = !!cookieStore.get("loanm8_demo_auth");
    if (!authed) return <ComingSoonHomePage />;
  }
  return <MarketingHomePage />;
}
