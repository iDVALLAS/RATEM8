import type { Metadata } from "next";
import MarketingHomePage from "@/components/MarketingHomePage";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { routeFor } from "@/lib/site";

/**
 * The homepage, for everyone (L3: the coming-soon page and the stealth
 * gate are gone).
 */
const home = routeFor("/");

export const metadata: Metadata = {
  title: { absolute: home?.title ?? `${CONFIG.brandName} — ${copy.brand.tagline}` },
  description: home?.description ?? copy.hero.sub,
};

export default function HomePage() {
  return <MarketingHomePage />;
}
