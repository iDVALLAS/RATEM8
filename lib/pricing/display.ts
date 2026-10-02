/**
 * lib/pricing/display.ts — which run a public pricing surface shows.
 *
 * 1. CONFIG.pricing.manual on and a fresh manual snapshot exists for the
 *    scenario's brokerage tenant → that snapshot ("Rate snapshot").
 * 2. Otherwise CONFIG.pricing.demoExamples on → the example run.
 * 3. Otherwise nothing.
 *
 * Returns public data only: the run (anonymized) and, for snapshots, the
 * loan officer's notes already mapped to lender letters. Real lender
 * names never leave the server.
 */
import { CONFIG } from "@/lib/config";
import { manualProvider } from "./providers/manual";
import { exampleScenarios, mockProvider } from "./providers/mock";
import { summarize } from "./playbook";
import { getStore } from "./store";
import { tenantForState } from "./tenants";
import type { BandedScenario, PricingRun } from "./types";

export type PublicNote = { lender: string; traits: string[]; note: string };

export type DisplayRun = {
  run: PricingRun;
  mode: "example" | "snapshot";
  notes: PublicNote[];
};

export function displayScenarios(): BandedScenario[] {
  return exampleScenarios();
}

export async function resolveDisplay(scenarioId: string): Promise<DisplayRun | null> {
  const scenario = displayScenarios().find((s) => s.id === scenarioId);
  if (!scenario) return null;

  if (CONFIG.pricing.manual) {
    const tenant = tenantForState(scenario.state);
    if (tenant) {
      const run = await manualProvider.priceScenario(tenant.id, scenario);
      if (run) {
        const snap = await getStore().latestSnapshot(tenant.id, scenario.id);
        const settings = await getStore().latestSettings(tenant.id);
        const notes: PublicNote[] = [];
        if (snap && settings) {
          for (const [label, key] of Object.entries(snap.mapping)) {
            const e = settings.playbook.find((p) => p.lenderKey === key);
            if (e && (e.note.trim() || summarize(e).length)) notes.push({ lender: label, traits: summarize(e), note: e.note.trim() });
          }
          notes.sort((a, b) => a.lender.localeCompare(b.lender));
        }
        return { run, mode: "snapshot", notes };
      }
    }
  }
  if (CONFIG.pricing.demoExamples) {
    const run = await mockProvider.priceScenario("example", scenario);
    if (run) return { run, mode: "example", notes: [] };
  }
  return null;
}
