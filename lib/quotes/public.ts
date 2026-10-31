/**
 * lib/quotes/public.ts — public, approved-only views of weekly pricing
 * (v37, L4). Used by M8 quote mode right after a request, by /rates, and
 * by the agent API. Anonymized lenders only; nothing unapproved.
 */
import { CONFIG } from "@/lib/config";
import { gridScenarios, gridShortLabel } from "@/lib/pricing/grid";
import { resolveGrid } from "@/lib/pricing/display";
import { currentPostedWeek, POSTED_PRODUCTS, type PostedWeek } from "@/lib/pricing/posted-rate";
import type { PricingRun } from "@/lib/pricing/types";
import type { Nearest } from "./nearest";

export type PublicOption = { option: "lowest_rate" | "lowest_rate_without_risky_features" | "lowest_points_and_origination"; lender: string; rate: number; apr: number; points_pct: number; monthly_payment: number | null };

export function optionsOf(run: PricingRun): PublicOption[] {
  const sel = run.selection;
  const out: PublicOption[] = [];
  const add = (option: PublicOption["option"], label: string | undefined) => {
    const q = label ? run.quotes.find((x) => x.lender === label) : undefined;
    if (q && q.noteRate !== null && q.apr !== null) out.push({ option, lender: q.lender, rate: q.noteRate, apr: q.apr, points_pct: q.pointsPct, monthly_payment: q.monthlyPayment });
  };
  add("lowest_rate", sel.lowestRate?.lender);
  add("lowest_rate_without_risky_features", sel.lowestRateWithoutRiskyFeatures?.lender);
  add("lowest_points_and_origination", sel.lowestPointsAndOrigination?.lender);
  return out;
}

export type NearestSummary = {
  label: string;
  href: string;
  priced_at: string;
  options: Array<{ label: string; rate: number; apr: number }>;
} | null;

const OPTION_LABEL: Record<PublicOption["option"], string> = {
  lowest_rate: "Lowest rate",
  lowest_rate_without_risky_features: "Lowest rate without risky features",
  lowest_points_and_origination: "Lowest points and origination",
};

export async function nearestSummary(n: Nearest, now = new Date()): Promise<NearestSummary> {
  if (n.kind === "posted") {
    if (!CONFIG.pricing.postedRates) return null;
    const w = await currentPostedWeek(now);
    const line = w?.lines.find((l) => l.product === n.product);
    if (!w || !line) return null;
    const p = POSTED_PRODUCTS.find((x) => x.product === n.product)!;
    return { label: `Posted rate · ${p.label}`, href: "/rates#posted", priced_at: w.confirmedAt, options: [{ label: "Zero points", rate: line.rate, apr: line.apr }] };
  }
  const d = await resolveGrid(n.scenarioId, now);
  const s = gridScenarios().find((x) => x.id === n.scenarioId);
  if (!d || !s) return null;
  return { label: gridShortLabel(s), href: `/rates?s=${s.id}`, priced_at: d.run.pricedAt, options: optionsOf(d.run).map((o) => ({ label: OPTION_LABEL[o.option], rate: o.rate, apr: o.apr })) };
}

/** Everything approved and showing this week, for AI assistants. */
export async function weeklyForAgents(now = new Date()): Promise<{ posted: PostedWeek | null; grid: Array<{ id: string; label: string; assumptions: string[]; priced_at: string; options: PublicOption[] }> }> {
  const posted = CONFIG.pricing.postedRates ? await currentPostedWeek(now) : null;
  const grid = [];
  for (const s of gridScenarios()) {
    const d = await resolveGrid(s.id, now);
    if (d) grid.push({ id: s.id, label: `${s.title} · ${gridShortLabel(s)}`, assumptions: s.assumptions, priced_at: d.run.pricedAt, options: optionsOf(d.run) });
  }
  return { posted, grid };
}
