export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * robots.txt — generated. L3: the site is public, so everything is
 * crawlable except /api/ (other than /api/agent/), the loan officer admin
 * (/mlo) and the living style guide (/design). AI crawlers and search
 * crawlers are listed by name so the policy is explicit and auditable.
 * Keep in sync with COMPLIANCE.md / docs/ai-visibility-checklist.md.
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
  const allow = ["/", "/api/agent/"];
  const disallow = ["/api/", "/mlo", "/design"];

  return {
    rules: [
      { userAgent: "*", allow, disallow },
      ...AI_AND_SEARCH_BOTS.map((userAgent) => ({ userAgent, allow, disallow })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
