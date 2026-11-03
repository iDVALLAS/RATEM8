export const dynamic = "force-dynamic";
import type { MetadataRoute } from "next";
import { ROUTES, absoluteUrl } from "@/lib/site";
import { STEALTH_PUBLIC_PAGES, stealthOn } from "@/lib/public-paths";

/**
 * sitemap.xml — every route in the registry (lib/site.ts) plus the
 * /tools pages, which predate the registry. Add a route to ROUTES and it
 * appears here; nothing is listed by hand except the tools slugs.
 */

const LAST_MODIFIED = new Date("2026-09-29");

const TOOL_SLUGS = [
  "monthly-payment",
  "dti",
  "rent-vs-buy",
  "closing-costs",
  "escrow",
  "refi-breakeven",
  "points",
  "bi-weekly",
  "payoff-acceleration",
  "amortization",
  "va-funding-fee",
  "pmi-drop",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const registry: MetadataRoute.Sitemap = ROUTES.filter((r) => !r.noindex).map((r) => ({
    url: absoluteUrl(r.path),
    lastModified: LAST_MODIFIED,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const tools: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/tools"), lastModified: LAST_MODIFIED, changeFrequency: "monthly", priority: 0.7 },
    ...TOOL_SLUGS.map((slug) => ({
      url: absoluteUrl(`/tools/${slug}`),
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  // C5: in stealth, list only what anonymous visitors can actually reach.
  const reachable = (url: string) => {
    if (!stealthOn()) return true;
    const path = new URL(url).pathname;
    return (STEALTH_PUBLIC_PAGES as readonly string[]).includes(path) || path.startsWith("/states/");
  };
  const seen = new Set<string>();
  return [...registry, ...tools].filter((e) => {
    if (!reachable(e.url)) return false;
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
