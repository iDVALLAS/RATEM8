/**
 * lib/pricing/display.ts — which run a public pricing surface shows.
 *
 * 1. CONFIG.pricing.manual on and a fresh manual snapshot exists for the
 *    scenario's brokerage tenant → that snapshot ("Rate snapshot").
 * 2. Otherwise CONFIG.pricing.demoExamples on → the example run.
 * 3. Otherwise nothing.
 *
 * C13 (owner 2026-11-07: "make it so it's hidden if it's not available"):
 * with PRICING_MANUAL on, /rates lists only the daily scenarios that have a
 * fresh snapshot, and is hidden (404) when none does. The sample examples
 * show only while PRICING_MANUAL is off.
 *
 * Returns public data only: the run (anonymized) and, for snapshots, the
 * loan officer's notes already mapped to lender letters. Real lender
 * names never leave the server.
 */
import { CONFIG } from "@/lib/config";
import { manualProvider } from "./providers/manual";
import { exampleScenarios, mockProvider } from "./providers/mock";
import { dailyScenarios, pricingScenarios } from "./daily";
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

/** The scenarios /rates can show right now; empty means the page is hidden. */
export async function availableScenarios(): Promise<BandedScenario[]> {
  if (CONFIG.pricing.manual) {
    const fresh: BandedScenario[] = [];
    for (const s of dailyScenarios()) {
      const tenant = tenantForState(s.state);
      const run = tenant ? await manualProvider.priceScenario(tenant.id, s).catch(() => null) : null;
      if (run) fresh.push(s);
    }
    return fresh;
  }
  return CONFIG.pricing.demoExamples ? displayScenarios() : [];
}

export async function resolveDisplay(scenarioId: string): Promise<DisplayRun | null> {
  const scenario = pricingScenarios().find((s) => s.id === scenarioId);
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
