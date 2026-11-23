/**
 * lib/leads/catalog.ts — D86: the Business Finder's catalog of source types for the planner's test slot. PURE.
 *
 * Six curated types (the owner's brief, D86 item 6), each with setup steps and a note on getting permission; the
 * words live in lib/content/lead-plan.ts. No prices anywhere: a marketplace's cost "comes from your own spend once
 * you test it." Suggestions for the test slot are the types the loan officer isn't running yet, in catalog order
 * (past clients & sphere is never one: it's funded first, rule 1).
 */
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { SPHERE_KEY, WEB_FORM_KEY, sourceKey } from "./source-key";

export type CatalogType = {
  id: "web-form-ads" | "meta" | "google-business" | "open-houses" | "sphere-campaigns" | "marketplaces";
  /** Source keys that mean the loan officer already runs this type. */
  keys: readonly string[];
  /** Where it's set up in Command Center. */
  href: string;
  /** Only marketplaces carry the cost line (no invented prices). */
  marketplace: boolean;
};

export const CATALOG: readonly CatalogType[] = [
  { id: "web-form-ads", keys: [WEB_FORM_KEY, "google-ads"], href: "/mlo/connections#zapier", marketplace: false },
  { id: "meta", keys: ["meta"], href: "/mlo/connections#zapier", marketplace: false },
  { id: "google-business", keys: ["google-business-profile", "google-business", "google-my-business", "gbp"], href: "/mlo/leads#add", marketplace: false },
  { id: "open-houses", keys: ["open-house", "open-houses"], href: "/mlo/contacts", marketplace: false },
  { id: "sphere-campaigns", keys: [SPHERE_KEY], href: "/mlo/campaigns", marketplace: false },
  { id: "marketplaces", keys: ["zillow", "lendingtree", "bankrate", "lowermybills"], href: "/mlo/leads#add", marketplace: true },
];

/** A type's words. */
export const catalogWords = (t: Pick<CatalogType, "id">) => LEAD_PLAN.catalog.types[t.id];

/**
 * The Business Finder's suggestions for the test slot: up to `max` types not already in use (a scorecard row with
 * leads or spend under one of its keys, or a connection named after it), in catalog order, never the sphere.
 */
export function testCandidates(rows: readonly { key: string; leads: number; spendCents: number }[], connected: readonly string[] = [], max = 2): CatalogType[] {
  const inUse = new Set([...rows.filter((r) => r.leads > 0 || r.spendCents > 0).map((r) => r.key), ...connected.map((c) => sourceKey(c)).filter(Boolean)]);
  return CATALOG.filter((t) => t.id !== "sphere-campaigns" && !t.keys.some((k) => inUse.has(k))).slice(0, max);
}
