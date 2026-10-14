/**
 * lib/pricing/providers/manual.ts — pricing a licensed person pulled from
 * the sponsoring brokerage's pricing engine and entered by hand.
 *
 * Each snapshot carries its entry timestamp and goes stale after
 * CONFIG.pricing.manualStaleHours; a stale snapshot is never returned.
 * No credentials, no automation: the person is the connector.
 */
import { CONFIG } from "@/lib/config";
import { LENDERS } from "../lenders";
import { getStore } from "../store";
import type { BandedScenario, PricingProvider, PricingRun } from "../types";

export function isFresh(pricedAt: string, now: Date = new Date(), staleHours = CONFIG.pricing.manualStaleHours): boolean {
  const t = Date.parse(pricedAt);
  return Number.isFinite(t) && now.getTime() - t <= staleHours * 3600_000 && t <= now.getTime() + 60_000;
}

export const manualProvider: PricingProvider = {
  id: "manual",
  async listApprovedLenders() {
    return LENDERS.map(({ key, name, manual }) => ({ key, name, manual }));
  },
  async priceScenario(tenantId: string, scenario: BandedScenario): Promise<PricingRun | null> {
    const snap = await getStore().latestSnapshot(tenantId, scenario.id);
    if (!snap || !isFresh(snap.run.pricedAt)) return null;
    return snap.run;
  },
  async health(tenantId: string) {
    const store = getStore();
    if (!store.writable) return { ok: false, detail: store.reason ?? "Store is read-only." };
    const audit = (await store.audit()).filter((e) => e.tenantId === tenantId && e.action === "snapshot.publish");
    const last = audit[audit.length - 1];
    return { ok: true, detail: last ? `Last snapshot ${last.at}` : "No snapshots yet." };
  },
};
