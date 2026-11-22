/**
 * lib/leads/mode.ts — D82: example mode on Lead sources, decided per section. PURE.
 *
 * Until the loan officer has a real lead, Lead sources shows its full layout
 * filled from `lib/leads/examples.ts`. Each section switches to real data on
 * its own, as soon as it has some, and a section is always all example or
 * all real, never both.
 *
 * "A real lead" is (owner decisions, 2026-11-22):
 *  - a contact delivered to the lead address (`source` starts with "lead:");
 *  - an imported contact with a Lead source (decision 5, "count all, date
 *    right", which replaces D82's interim rule that only files marked as from
 *    a lead vendor counted), or from a file marked as from a lead vendor
 *    (provenance "lead_vendor") with no Lead source column. A past-client
 *    export's "Referral" goes to the "Past clients & sphere" row, dated by the
 *    file's own dates (lib/leads/backfill.ts), so a loan funded years ago is a
 *    lead from then, not from the day of the import;
 *  - a lead event (D83, lib/leads/events.ts): every delivery, repeats too.
 *
 * This module never imports the example fixture: it only says which one to
 * show, so the Concierge (D85) can read the mode without the examples.
 */

/** The few contact fields this needs (a `Contact` fits). */
export type LeadLike = {
  id: string;
  kind: "contact" | "agent";
  source: string;
  provenance?: string;
  leadSource?: string | null;
  createdAt: string;
};

/** The few consent-entry fields this needs (a `ConsentEntry` fits). */
export type ConsentLike = { contactId: string; channel: string; granted: boolean; actor: string; mergedFrom?: string | null };

export type SectionMode = "example" | "real" | "off";
export type SectionKey = "add" | "ask" | "scorecard" | "plan" | "monthly" | "recent";

export type LeadPageMode = {
  hasRealLeads: boolean;
  /** The question box (D85). It carries no numbers; in example mode the Concierge answers in general terms. */
  ask: SectionMode;
  scorecard: SectionMode;
  /** The lead plan card (D86): example until a plan is saved, whatever the leads. */
  plan: SectionMode;
  recent: SectionMode;
  /** D83: the monthly amount per source (the loan officer's own settings, never an example; no spend for assistants). */
  monthly: "real" | "off";
  /** Connecting a source is the first job: full and on top until real leads exist, then compact in section 4. */
  addCard: "top" | "compact";
  /** The sections in page order. */
  order: SectionKey[];
};

export type ModeInput = {
  contacts: readonly LeadLike[];
  /** D83: lead events on file for this loan officer (none are recorded before D83). */
  leadEvents?: number;
  /** D86: whether the loan officer has saved a lead plan (no plan store before D86). */
  savedPlan?: boolean;
  /** Assistants see the page as before D82: the add card and Recent leads, no spend, no examples. */
  assistant?: boolean;
};

const imported = (c: LeadLike) => c.source.startsWith("import:");

/** Is this contact a real lead? */
export function isRealLead(c: LeadLike): boolean {
  if (c.kind !== "contact") return false;
  if (c.source.startsWith("lead:")) return true;
  return imported(c) && (!!c.leadSource?.trim() || c.provenance === "lead_vendor");
}

export function hasRealLeads(input: Pick<ModeInput, "contacts" | "leadEvents">): boolean {
  return (input.leadEvents ?? 0) > 0 || input.contacts.some(isRealLead);
}

export function leadPageMode(input: ModeInput): LeadPageMode {
  const real = hasRealLeads(input);
  if (input.assistant) return { hasRealLeads: real, ask: "off", scorecard: "off", plan: "off", recent: "real", monthly: "off", addCard: "top", order: ["add", "recent"] };
  return {
    hasRealLeads: real,
    ask: real ? "real" : "example",
    scorecard: real ? "real" : "example",
    plan: input.savedPlan ? "real" : "example",
    recent: real ? "real" : "example",
    monthly: "real",
    addCard: real ? "compact" : "top",
    order: real ? ["ask", "scorecard", "plan", "add", "monthly", "recent"] : ["add", "ask", "scorecard", "plan", "monthly", "recent"],
  };
}

/** The few lead-event fields this needs (a `LeadEvent` fits). */
export type EventLike = { contactId: string; sourceKey: string; sourceLabel: string; at: string; duplicate: boolean; namesYou: boolean; datedBy: string };

/** An event with a date of its own (an import with no date counts as a lead, but in no period). */
export const dated = (e: EventLike) => e.datedBy !== "none";

/** Recent leads (D83): each person's newest dated lead event, newest first. A repeat delivery brings them back to the top. */
export function recentEvents<T extends EventLike>(events: readonly T[], max = 30): T[] {
  const last = new Map<string, T>();
  for (const e of events) {
    if (!dated(e)) continue;
    const o = last.get(e.contactId);
    if (!o || e.at > o.at) last.set(e.contactId, e);
  }
  return [...last.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}

/**
 * The form that delivered this lead named the loan officer or their company:
 * a granted text or call entry written by the lead intake (actor "lead:…").
 * D83's backfill sets `namesYou` on the events of `lead:` contacts from it
 * (decision 1), never from a later yes or a merged copy.
 */
export function leadNamedYou(contactId: string, entries: readonly ConsentLike[]): boolean {
  return entries.some((e) => e.contactId === contactId && e.granted && !e.mergedFrom && (e.channel === "text" || e.channel === "call") && e.actor.startsWith("lead:"));
}

export type SourceCount = { key: string; source: string; leads: number; canCall: number; repeats: number };

/**
 * The real scorecard before D84 adds spend and loans: per source, the lead
 * events of the last `days` days (every delivery is a lead), how many named
 * the loan officer (`namesYou`, frozen at delivery) and how many were
 * repeats (someone already in the book). Most leads first, then by name.
 */
export function eventCounts(events: readonly EventLike[], now: Date, days = 90): SourceCount[] {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = new Map<string, SourceCount>();
  for (const e of events) {
    if (!dated(e) || e.at < since || e.at > now.toISOString()) continue;
    const row = rows.get(e.sourceKey) ?? { key: e.sourceKey, source: e.sourceLabel, leads: 0, canCall: 0, repeats: 0 };
    row.leads++;
    if (e.namesYou) row.canCall++;
    if (e.duplicate) row.repeats++;
    rows.set(e.sourceKey, row);
  }
  return [...rows.values()].sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
}

/** A share as a whole percent (0 when there's nothing to divide). */
export const share = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

/**
 * The add card's "Zillow · on" chips: the loan officer's connection addresses
 * that aren't for a loan system or a dialer (those are made on Connections).
 */
export function connectedSourceLabels(labels: readonly string[], notLeads: readonly string[]): string[] {
  const skip = new Set(notLeads.map((n) => n.trim().toLowerCase()));
  const out = new Map<string, string>();
  for (const l of labels) {
    const t = l.trim();
    if (t && !skip.has(t.toLowerCase()) && !out.has(t.toLowerCase())) out.set(t.toLowerCase(), t);
  }
  return [...out.values()];
}
