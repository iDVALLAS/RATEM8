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
import { allScenarios, gridScenarios, isGridScenario } from "./grid";
import { isFresh, manualProvider } from "./providers/manual";
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

/** v37: /rates shows the weekly grid; the v13 examples only in QA (PRICING_DEMO_EXAMPLES). */
export function displayScenarios(): BandedScenario[] {
  return CONFIG.pricing.demoExamples ? [...gridScenarios(), ...exampleScenarios()] : gridScenarios();
}

async function notesFor(tenantId: string, mapping: Record<string, string>): Promise<PublicNote[]> {
  const settings = await getStore().latestSettings(tenantId);
  const notes: PublicNote[] = [];
  if (!settings) return notes;
  for (const [label, key] of Object.entries(mapping)) {
    const e = settings.playbook.find((p) => p.lenderKey === key);
    if (e && (e.note.trim() || summarize(e).length)) notes.push({ lender: label, traits: summarize(e), note: e.note.trim() });
  }
  return notes.sort((a, b) => a.lender.localeCompare(b.lender));
}

/** The latest weekly-grid snapshot, if it is inside the one-week window. */
export async function resolveGrid(scenarioId: string, now: Date = new Date()): Promise<DisplayRun | null> {
  if (!CONFIG.pricing.weekly || !isGridScenario(scenarioId)) return null;
  const scenario = gridScenarios().find((s) => s.id === scenarioId)!;
  const tenant = tenantForState(scenario.state);
  if (!tenant) return null;
  const snap = await getStore().latestSnapshot(tenant.id, scenario.id);
  if (!snap || !isFresh(snap.run.pricedAt, now, CONFIG.pricing.weeklyStaleHours)) return null;
  return { run: snap.run, mode: "snapshot", notes: await notesFor(tenant.id, snap.mapping) };
}

export async function resolveDisplay(scenarioId: string): Promise<DisplayRun | null> {
  const scenario = allScenarios().find((s) => s.id === scenarioId);
  if (!scenario) return null;
  if (isGridScenario(scenarioId)) return resolveGrid(scenarioId);

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
