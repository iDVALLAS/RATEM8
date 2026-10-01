/**
 * lib/pricing/publish.ts — manual snapshot publishing and tenant settings.
 *
 * Called by the /mlo admin server actions; plain functions so the rules
 * are unit-tested. A snapshot is rejected (nothing stored) when:
 *  - the store is read-only, or no source file is attached;
 *  - a lender is not active for the tenant, or its terms restrict consumer
 *    display and no written consent is on file;
 *  - any input fails validation (buildPricingRun throws).
 */
import { buildPricingRun } from "./build";
import { lenderByKey, publishable, LENDERS } from "./lenders";
import { emptyEntry, screenNote, type PlaybookEntry } from "./playbook";
import { exampleScenarios } from "./providers/mock";
import { getStore, type TenantSettings } from "./store";
import { tenantById } from "./tenants";
import type { QuoteInput } from "./types";

export const MIN_ACTIVE_LENDERS = 3;
export const MAX_ACTIVE_LENDERS = 10;
export const SOURCE_MAX_BYTES = 5 * 1024 * 1024;
export const SOURCE_TYPES = ["image/png", "image/jpeg", "application/pdf"];

export type PublishRequest = {
  tenantId: string;
  scenarioId: string;
  quotes: QuoteInput[];
  source: { bytes: Uint8Array; mime: string } | null;
  actor: string;
  now?: Date;
};

export type PublishResult = { ok: true; runId: string; inputsHash: string } | { ok: false; errors: string[] };

export async function publishSnapshot(req: PublishRequest): Promise<PublishResult> {
  const store = getStore();
  if (!store.writable) return { ok: false, errors: [store.reason ?? "Snapshot storage is read-only."] };
  const tenant = tenantById(req.tenantId);
  if (!tenant) return { ok: false, errors: ["Unknown brokerage tenant."] };
  const scenario = exampleScenarios().find((s) => s.id === req.scenarioId);
  if (!scenario) return { ok: false, errors: ["Unknown scenario."] };
  if (!tenant.states.includes(scenario.state)) return { ok: false, errors: [`This brokerage does not price ${scenario.state} scenarios.`] };

  const errors: string[] = [];
  if (!req.source) errors.push("Attach the screenshot or export the prices came from.");
  else {
    if (!SOURCE_TYPES.includes(req.source.mime)) errors.push("Source must be a PNG, JPEG or PDF.");
    if (req.source.bytes.length > SOURCE_MAX_BYTES) errors.push("Source file is larger than 5 MB.");
  }
  if (req.quotes.length === 0) errors.push("Enter at least one lender result.");

  const settings = await store.latestSettings(tenant.id);
  const active = new Set(settings?.activeLenderKeys ?? []);
  for (const q of req.quotes) {
    const l = lenderByKey(q.lenderKey);
    if (!l) errors.push(`Unknown lender "${q.lenderKey}".`);
    else if (!active.has(q.lenderKey)) errors.push(`${l.name} is not one of this brokerage's active lenders.`);
    else if (!publishable(q.lenderKey)) errors.push(`${l.name}'s terms restrict showing its pricing to consumers. Record written consent before including it.`);
  }
  if (errors.length) return { ok: false, errors };

  const now = req.now ?? new Date();
  const pricedAt = now.toISOString();
  const inputs = {
    runId: `snap-${tenant.id}-${scenario.id}-${pricedAt}`,
    tenantId: tenant.id,
    provider: "manual" as const,
    mode: "snapshot" as const,
    scenario,
    pricedAt,
    quotes: req.quotes,
  };
  let built;
  try {
    built = buildPricingRun(inputs);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const sourceSha256 = await store.putSource(req.source!.bytes, req.source!.mime, req.actor, tenant.id);
  await store.putSnapshot({ run: built.run, inputs, mapping: built.mapping, sourceSha256, sourceMime: req.source!.mime, enteredBy: req.actor, enteredAt: pricedAt });
  return { ok: true, runId: built.run.runId, inputsHash: built.run.inputsHash };
}

export type SettingsRequest = {
  tenantId: string;
  activeLenderKeys: string[];
  playbook: PlaybookEntry[];
  actor: string;
  now?: Date;
};

export type SettingsResult =
  | { ok: true; settings: TenantSettings; warnings: string[] }
  | { ok: false; errors: string[] };

export async function saveSettings(req: SettingsRequest): Promise<SettingsResult> {
  const store = getStore();
  if (!store.writable) return { ok: false, errors: [store.reason ?? "Settings storage is read-only."] };
  if (!tenantById(req.tenantId)) return { ok: false, errors: ["Unknown brokerage tenant."] };
  const errors: string[] = [];
  const keys = Array.from(new Set(req.activeLenderKeys));
  for (const k of keys) if (!lenderByKey(k)) errors.push(`Unknown lender "${k}".`);
  if (keys.length > MAX_ACTIVE_LENDERS) errors.push(`Choose at most ${MAX_ACTIVE_LENDERS} go-to lenders.`);
  for (const e of req.playbook) {
    const s = screenNote(e.note);
    if (!s.ok) errors.push(...s.reasons.map((r) => `${lenderByKey(e.lenderKey)?.name ?? e.lenderKey}: ${r}`));
  }
  if (errors.length) return { ok: false, errors };
  const warnings: string[] = [];
  const publishableCount = keys.filter(publishable).length;
  if (publishableCount < MIN_ACTIVE_LENDERS) {
    warnings.push(`Only ${publishableCount} active lender(s) can be shown to consumers. Keep at least ${MIN_ACTIVE_LENDERS} so the three-option comparison is possible.`);
  }
  const playbook = keys.map((k) => req.playbook.find((p) => p.lenderKey === k) ?? emptyEntry(k));
  const settings = await store.putSettings({ tenantId: req.tenantId, activeLenderKeys: keys, playbook, updatedBy: req.actor, updatedAt: (req.now ?? new Date()).toISOString() });
  return { ok: true, settings, warnings };
}

export function allLenderOptions() {
  return LENDERS.map((l) => ({ key: l.key, name: l.name, publishable: publishable(l.key) }));
}
