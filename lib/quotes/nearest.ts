/**
 * lib/quotes/nearest.ts — the closest published scenario to a request.
 *
 * Shown to the borrower (and an AI assistant) right after a request, so
 * they have something now while their own estimate is priced. It is the
 * published scenario as priced, never adjusted to their numbers; the
 * differences are stated.
 */
import { gridScenarios } from "@/lib/pricing/grid";
import { CONFIG } from "@/lib/config";
import { bandFloor, type QuoteScenario } from "./scenario";

export type Nearest = { kind: "grid"; scenarioId: string } | { kind: "posted"; product: "30yr_fixed" | "15yr_fixed" };

export function nearestScenario(s: QuoteScenario): Nearest {
  const grid = gridScenarios();
  const id = (pred: (g: (typeof grid)[number]) => boolean) => grid.find(pred)!.id;
  if (s.purpose !== "purchase") return { kind: "grid", scenarioId: id((g) => g.purpose === "rate_term_refi") };
  if (s.loanType === "fha") return { kind: "grid", scenarioId: id((g) => g.program === "fha") };
  if (s.loanType === "va") return { kind: "grid", scenarioId: id((g) => g.program === "va") };
  const downPct = ((s.down ?? 0) / s.price) * 100;
  const p = CONFIG.pricing.postedProfile;
  if (bandFloor(s.creditBand) >= p.creditFloor && downPct >= p.minDownPct) {
    return { kind: "posted", product: s.term === "15" ? "15yr_fixed" : "30yr_fixed" };
  }
  const conv = grid.filter((g) => g.program === "conventional" && g.purpose === "purchase").sort((a, b) => (b.downPct ?? 0) - (a.downPct ?? 0));
  const pick = conv.find((g) => downPct >= (g.downPct ?? 0)) ?? conv[conv.length - 1];
  return { kind: "grid", scenarioId: pick.id };
}
