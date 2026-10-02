/**
 * lib/pricing/summary.ts — the example pricing as plain text for M8's
 * system prompt. Numbers are formatted from computed runs, never typed.
 * M8 may describe these only as dated examples.
 */
import { CONFIG } from "@/lib/config";
import { buildPricingRun } from "./build";
import { exampleInputs, exampleScenarios } from "./providers/mock";

export function exampleSummaryText(): string {
  const lines: string[] = [
    "## EXAMPLE PRICING (fictional, dated; not quotes)",
    `As of ${CONFIG.pricing.examplesAsOf}. Fictional lenders shown by letter. Every figure is an example, not an offer, a quote, or a commitment to lend.`,
  ];
  for (const s of exampleScenarios()) {
    const { run } = buildPricingRun(exampleInputs(s.id)!);
    const find = (label?: string) => run.quotes.find((q) => q.lender === label);
    const fmt = (title: string, label?: string) => {
      const q = find(label);
      return q ? `- ${title}: ${q.lender}, ${q.noteRate!.toFixed(3)}% rate, ${q.apr!.toFixed(3)}% APR, points ${q.pointsPct.toFixed(3)}, origination $${q.originationFee}, lender fees $${q.lenderFees}, ${q.lockDays}-day lock${q.hasRiskyFeature ? ", has a risky feature (interest-only)" : ""}.` : `- ${title}: none.`;
    };
    lines.push("", `### ${s.title} · ${s.location}`, ...s.assumptions.slice(0, 3).map((a) => `- ${a}`), "- Fictional lenders and figures.");
    lines.push(fmt("Lowest rate", run.selection.lowestRate?.lender));
    lines.push(fmt("Lowest rate without risky features", run.selection.lowestRateWithoutRiskyFeatures?.lender));
    lines.push(fmt("Lowest points and origination fees", run.selection.lowestPointsAndOrigination?.lender));
  }
  return lines.join("\n");
}
