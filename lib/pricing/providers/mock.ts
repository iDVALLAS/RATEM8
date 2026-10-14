/**
 * lib/pricing/providers/mock.ts — example pricing from versioned fixtures
 * (fixtures/pricing/examples.v1.json). Same pipeline as every other
 * provider: inputs → buildPricingRun → display. Going live later is a
 * provider switch, not a rebuild.
 */
import fixture from "@/fixtures/pricing/examples.v1.json";
import { buildPricingRun } from "../build";
import { EXAMPLE_TENANT_ID } from "../tenants";
import type { BandedScenario, LenderRef, PricingProvider, PricingRun, QuoteInput, RunInputs } from "../types";

type FixtureFile = {
  version: number;
  asOf: string;
  pricedAt: string;
  scenarios: { scenario: BandedScenario; quotes: QuoteInput[] }[];
};

const data = fixture as unknown as FixtureFile;

export const EXAMPLE_FIXTURE_VERSION = data.version;

export function exampleScenarios(): BandedScenario[] {
  return data.scenarios.map((s) => s.scenario);
}

export function exampleInputs(scenarioId: string): RunInputs | null {
  const entry = data.scenarios.find((s) => s.scenario.id === scenarioId);
  if (!entry) return null;
  return {
    runId: `example-v${data.version}-${scenarioId}`,
    tenantId: EXAMPLE_TENANT_ID,
    provider: "mock",
    mode: "example",
    scenario: entry.scenario,
    pricedAt: data.pricedAt,
    quotes: entry.quotes,
  };
}

export const mockProvider: PricingProvider = {
  id: "mock",
  async listApprovedLenders(): Promise<LenderRef[]> {
    const keys = new Set(data.scenarios.flatMap((s) => s.quotes.map((q) => q.lenderKey)));
    return Array.from(keys).sort().map((key) => ({ key, name: `Example lender ${key}`, manual: false }));
  },
  async priceScenario(_tenantId: string, scenario: BandedScenario): Promise<PricingRun | null> {
    const inputs = exampleInputs(scenario.id);
    return inputs ? buildPricingRun(inputs).run : null;
  },
  async health() {
    return { ok: true, detail: `Example fixtures v${data.version} as of ${data.asOf}` };
  },
};
