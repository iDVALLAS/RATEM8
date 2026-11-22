/**
 * lib/leads/sources.ts — D83: the Lead source picker's choices. SERVER-ONLY.
 *
 * Sources the loan officer already has (every lead event's source, so
 * delivered and imported leads alike), their connection-address labels as
 * suggestions (not the default ones like "Loan system" or "Lead vendor", nor
 * a loan system's or the dialer's), then "Past clients & sphere" and "Your
 * web form". The page adds "Other…".
 */
import { SYSTEMS } from "@/lib/connect/catalog";
import { pipelineStore } from "@/lib/pipeline/store";
import { leadEventStore, type LeadEvent } from "./events";
import { SPHERE_KEY, sourceKey, sourceLabel, VENDOR_FILE_KEY, WEB_FORM_KEY } from "./source-key";

/** Connection addresses that aren't lead sources, and default labels nobody chose. */
export const NOT_LEADS = ["Loan system", "Dialer", "Lead vendor", ...SYSTEMS.filter((s) => s.brings === "loans").map((s) => s.name)];

export type SourceOption = { key: string; label: string };

/** Pure: the choices from events, connection-address labels and extra keys (an entry's own), in a fixed order. */
export function sourceOptions(events: readonly Pick<LeadEvent, "sourceKey" | "sourceLabel">[], labels: readonly string[], extra: readonly (string | null | undefined)[] = []): SourceOption[] {
  const out = new Map<string, string>();
  const skip = new Set(NOT_LEADS.map((n) => n.toLowerCase()));
  for (const e of events) if (e.sourceKey && e.sourceKey !== VENDOR_FILE_KEY && !out.has(e.sourceKey)) out.set(e.sourceKey, sourceLabel(e.sourceKey, e.sourceLabel));
  for (const l of labels) {
    const t = l.trim();
    const k = sourceKey(t);
    if (t && k && !skip.has(t.toLowerCase()) && !out.has(k)) out.set(k, sourceLabel(k, t));
  }
  for (const k of extra) if (k && !out.has(k)) out.set(k, sourceLabel(k));
  out.delete(SPHERE_KEY);
  out.delete(WEB_FORM_KEY);
  const named = [...out.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  return [...named, { key: SPHERE_KEY, label: sourceLabel(SPHERE_KEY) }, { key: WEB_FORM_KEY, label: sourceLabel(WEB_FORM_KEY) }];
}

/** The loan officer's own choices (their events and connection addresses), plus `extra` keys already on their entries. */
export async function sourceOptionsFor(ownerUserId: string, extra: readonly (string | null | undefined)[] = []): Promise<SourceOption[]> {
  const [events, keys] = await Promise.all([leadEventStore().list(ownerUserId).catch(() => []), pipelineStore().keys(ownerUserId).catch(() => [])]);
  return sourceOptions(events, keys.map((k) => k.label), extra);
}
