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
import { lenderByKey, offers, publishable, LENDERS } from "./lenders";
import { emptyEntry, screenNote, type PlaybookEntry } from "./playbook";
import { pricingScenarios } from "./daily";
import { getStore, type TenantSettings } from "./store";
import { tenantById } from "./tenants";
import { checkRule, normalizeRule, quotesFromGrids, type CompRule } from "./compRule";
import { matchScenario, parseCapture, productsFromCapture, scenarioMismatch, type Skipped } from "./loansifter";
import { noteAmount } from "./mi";
import type { QuoteInput } from "./types";

export const MIN_ACTIVE_LENDERS = 3;
export const MAX_ACTIVE_LENDERS = 10;
export const SOURCE_MAX_BYTES = 5 * 1024 * 1024;
export const SOURCE_TYPES = ["image/png", "image/jpeg", "application/pdf"];
/** A LoanSifter capture is its own source record (the exact rows read). */
export const CAPTURE_MIME = "application/json";

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
  const scenario = pricingScenarios().find((s) => s.id === req.scenarioId);
  if (!scenario) return { ok: false, errors: ["Unknown scenario."] };
  if (!tenant.states.includes(scenario.state)) return { ok: false, errors: [`This brokerage does not price ${scenario.state} scenarios.`] };

  const errors: string[] = [];
  if (!req.source) errors.push("Attach the screenshot or export the prices came from.");
  else {
    if (![...SOURCE_TYPES, CAPTURE_MIME].includes(req.source.mime)) errors.push("Source must be a PNG, JPEG or PDF.");
    if (req.source.bytes.length > SOURCE_MAX_BYTES) errors.push("Source file is larger than 5 MB.");
  }
  if (req.quotes.length === 0) errors.push("Enter at least one lender result.");

  const settings = await store.latestSettings(tenant.id);
  const active = new Set(settings?.activeLenderKeys ?? []);
  for (const q of req.quotes) {
    const l = lenderByKey(q.lenderKey);
    if (!l) errors.push(`Unknown lender "${q.lenderKey}".`);
    else if (!active.has(q.lenderKey)) errors.push(`${l.name} is not one of this brokerage's active lenders.`);
    // v27: every current scenario is a first mortgage; HELOC-only programs can't price it.
    else if (!offers(q.lenderKey, "first_mortgage")) errors.push(`${l.name} offers HELOCs only, so it can't be priced in a first-mortgage scenario.`);
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

export type ImportRequest = {
  tenantId: string;
  /** The text the Send to LoanM8 button copied. */
  captureText: string;
  /** PMI scenarios: borrower-paid monthly PMI from the MI quote. */
  monthlyPmi?: number;
  actor: string;
  now?: Date;
};

export type ImportResult =
  | { ok: true; runId: string; inputsHash: string; scenarioId: string; lenders: string[]; skipped: Skipped[]; withoutGrid: number }
  | { ok: false; errors: string[]; scenarioId?: string; skipped?: Skipped[] };

/** Captures older than this are refused: LoanSifter prices move during the day. */
export const CAPTURE_MAX_AGE_HOURS = 6;

/**
 * Publishes a snapshot from a LoanSifter capture: finds the daily scenario
 * it was run for, keeps the tenant's active, showable first-mortgage
 * lenders, applies the tenant's rate rule, and stores the capture itself
 * as the source record. Priced at the capture time.
 */
export async function importLoanSifter(req: ImportRequest): Promise<ImportResult> {
  const parsed = parseCapture(req.captureText);
  if (!parsed.ok) return parsed;
  const c = parsed.capture;
  const tenant = tenantById(req.tenantId);
  if (!tenant) return { ok: false, errors: ["Unknown brokerage tenant."] };
  const scenarios = pricingScenarios().filter((s) => tenant.states.includes(s.state));
  const scenario = matchScenario(c, scenarios);
  if (!scenario) {
    const near = scenarios[0] ? scenarioMismatch(c, scenarios[0]) : [];
    return { ok: false, errors: [`This search doesn't match any daily scenario${near.length ? ` (for example: ${near.join(", ")})` : ""}. Run one of the saved daily scenarios in LoanSifter.`] };
  }
  const now = req.now ?? new Date();
  const at = new Date(c.capturedAt);
  const ageH = (now.getTime() - at.getTime()) / 3_600_000;
  if (ageH > CAPTURE_MAX_AGE_HOURS) return { ok: false, scenarioId: scenario.id, errors: [`This capture is ${Math.floor(ageH)} hours old. Run the button again on a fresh search.`] };
  if (ageH < -0.1) return { ok: false, scenarioId: scenario.id, errors: ["This capture's time is in the future. Check the computer's clock and run it again."] };
  if (scenario.mi?.kind === "pmi" && !(req.monthlyPmi !== undefined && req.monthlyPmi > 0)) {
    return { ok: false, scenarioId: scenario.id, errors: ["This scenario has mortgage insurance. Enter the monthly PMI from the MI quote."] };
  }

  const settings = await getStore().latestSettings(tenant.id);
  const active = new Set(settings?.activeLenderKeys ?? []);
  const allow = (key: string): string | null => {
    const l = lenderByKey(key);
    if (!l) return "not on your lender panel";
    if (!active.has(key)) return "not one of your go-to lenders (Setup)";
    if (!offers(key, "first_mortgage")) return "HELOC only";
    if (!publishable(key)) return l.termsReviewed ? "its terms restrict showing pricing to consumers" : "its terms haven't been reviewed yet";
    return null;
  };
  const { products, skipped, withoutGrid } = productsFromCapture(c, allow);
  const rule = normalizeRule(settings?.comp);
  const quotes = quotesFromGrids(products, noteAmount(scenario), rule).map((q) => (scenario.mi?.kind === "pmi" ? { ...q, monthlyPmi: req.monthlyPmi } : q));
  const lenders = Array.from(new Set(quotes.map((q) => q.lenderKey)));
  if (lenders.length < MIN_ACTIVE_LENDERS) {
    return {
      ok: false,
      scenarioId: scenario.id,
      skipped,
      errors: [
        `Only ${lenders.length} of your lenders had a rate inside your rule (needs ${MIN_ACTIVE_LENDERS} for the three-option comparison).`,
        ...(withoutGrid ? [`${withoutGrid} product(s) had only one rate because their grid wasn't open. Let the button finish opening every grid, then copy.`] : []),
      ],
    };
  }
  const res = await publishSnapshot({
    tenantId: tenant.id,
    scenarioId: scenario.id,
    quotes,
    source: { bytes: new TextEncoder().encode(req.captureText.trim()), mime: CAPTURE_MIME },
    actor: req.actor,
    now: at,
  });
  if (!res.ok) return { ...res, scenarioId: scenario.id, skipped };
  return { ...res, scenarioId: scenario.id, lenders, skipped, withoutGrid };
}

export type SettingsRequest = {
  tenantId: string;
  activeLenderKeys: string[];
  playbook: PlaybookEntry[];
  /** C8: the rate rule. Omitted keeps the previous one (or the default). */
  comp?: CompRule;
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
  if (req.comp) errors.push(...checkRule(req.comp));
  if (errors.length) return { ok: false, errors };
  const warnings: string[] = [];
  const publishableCount = keys.filter(publishable).length;
  if (publishableCount < MIN_ACTIVE_LENDERS) {
    warnings.push(`Only ${publishableCount} active lender(s) can be shown to consumers. Keep at least ${MIN_ACTIVE_LENDERS} so the three-option comparison is possible.`);
  }
  const playbook = keys.map((k) => req.playbook.find((p) => p.lenderKey === k) ?? emptyEntry(k));
  const prev = await store.latestSettings(req.tenantId);
  const comp = req.comp ?? normalizeRule(prev?.comp);
  const settings = await store.putSettings({ tenantId: req.tenantId, activeLenderKeys: keys, playbook, comp, updatedBy: req.actor, updatedAt: (req.now ?? new Date()).toISOString() });
  return { ok: true, settings, warnings };
}

export function allLenderOptions() {
  return LENDERS.map((l) => ({ key: l.key, name: l.name, publishable: publishable(l.key), helocOnly: !l.products.includes("first_mortgage") }));
}
