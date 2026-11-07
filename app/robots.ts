export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { STEALTH_PUBLIC_PAGES, stealthOn } from "@/lib/public-paths";

/**
 * robots.txt — generated, replaces the old static public/robots.txt.
 *
 * Two modes:
 *  - Stealth (NEXT_PUBLIC_STEALTH_MODE !== "false", the default): only the
 *    pages that are public in stealth (lib/public-paths.ts, C5: /, /chat,
 *    /licensing, /licensing/texas, /disclosures, /privacy, /terms, /ai),
 *    the state pages, /llms.txt and this file. Matches middleware.ts,
 *    which redirects everything else.
 *  - Live: everything is crawlable except /api/ (other than /api/agent/)
 *    and /demo. AI crawlers and search crawlers are listed by name so the
 *    policy is explicit and auditable.
 *
 * This policy can be tightened later (per bot, per path) without touching
 * any page. Keep the list in sync with COMPLIANCE.md / docs/ai-visibility-checklist.md.
 */

const AI_AND_SEARCH_BOTS = [
  "OAI-SearchBot",
  "GPTBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Googlebot",
  "Bingbot",
];

export default function robots(): MetadataRoute.Robots {
  if (stealthOn()) {
    // "/$" is the homepage only; every other page is listed exactly.
    const allow = [...STEALTH_PUBLIC_PAGES.map((p) => (p === "/" ? "/$" : `${p}$`)), "/states/", "/llms.txt", "/robots.txt", "/team/"];
    return {
      rules: [
        {
          userAgent: "*",
          allow,
          disallow: "/",
        },
      ],
      sitemap: absoluteUrl("/sitemap.xml"),
    };
  }

  const allow = ["/", "/api/agent/"];
  const disallow = ["/api/", "/demo"];

  return {
    rules: [
      { userAgent: "*", allow, disallow },
      ...AI_AND_SEARCH_BOTS.map((userAgent) => ({ userAgent, allow, disallow })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
