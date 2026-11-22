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
 *  - a contact imported from a lead vendor's file (decision 4): an import
 *    (`source` starts with "import:") that the loan officer marked as from a
 *    lead vendor (provenance "lead_vendor"); its Lead source column
 *    (`leadSource`) names the source. A Lead source column alone doesn't make
 *    a lead: CRM and past-client exports carry one too ("Referral", "Zillow"
 *    on a loan funded years ago), and their people aren't new leads;
 *  - a lead event, once D83 records them (`leadEvents`, 0 until then).
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
export type SectionKey = "add" | "ask" | "scorecard" | "plan" | "recent";

export type LeadPageMode = {
  hasRealLeads: boolean;
  /** The question box (D85). It carries no numbers; in example mode the Concierge answers in general terms. */
  ask: SectionMode;
  scorecard: SectionMode;
  /** The lead plan card (D86): example until a plan is saved, whatever the leads. */
  plan: SectionMode;
  recent: SectionMode;
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
  return imported(c) && c.provenance === "lead_vendor";
}

/** Where a real lead came from, as the loan officer named it ("Zillow"); `fallback` for a vendor file with no Lead source column. */
export function leadSourceLabel(c: LeadLike, fallback: string): string {
  if (c.source.startsWith("lead:")) return c.source.slice(5).trim() || fallback;
  return c.leadSource?.trim() || fallback;
}

export function hasRealLeads(input: Pick<ModeInput, "contacts" | "leadEvents">): boolean {
  return (input.leadEvents ?? 0) > 0 || input.contacts.some(isRealLead);
}

export function leadPageMode(input: ModeInput): LeadPageMode {
  const real = hasRealLeads(input);
  if (input.assistant) return { hasRealLeads: real, ask: "off", scorecard: "off", plan: "off", recent: "real", addCard: "top", order: ["add", "recent"] };
  return {
    hasRealLeads: real,
    ask: real ? "real" : "example",
    scorecard: real ? "real" : "example",
    plan: input.savedPlan ? "real" : "example",
    recent: real ? "real" : "example",
    addCard: real ? "compact" : "top",
    order: real ? ["ask", "scorecard", "plan", "add", "recent"] : ["add", "ask", "scorecard", "plan", "recent"],
  };
}

/** Recent leads: the newest real leads first. */
export function recentLeads<T extends LeadLike>(contacts: readonly T[], max = 30): T[] {
  return contacts.filter(isRealLead).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, max);
}

/**
 * The form that delivered this lead named the loan officer or their company:
 * a granted text or call entry written by the lead intake (actor "lead:…"), the
 * same rule D83's backfill uses for `namesYou`. An imported lead counts only
 * with such an entry too (else false, decision 4), never from a later yes.
 */
export function leadNamedYou(contactId: string, entries: readonly ConsentLike[]): boolean {
  return entries.some((e) => e.contactId === contactId && e.granted && !e.mergedFrom && (e.channel === "text" || e.channel === "call") && e.actor.startsWith("lead:"));
}

export type SourceCount = { source: string; leads: number; canCall: number };

/**
 * The real scorecard before D83–D84 add spend and loans: per source, the real
 * leads that arrived in the last `days` days and how many of their forms
 * named the loan officer. Most leads first, then by name.
 */
export function sourceCounts(contacts: readonly LeadLike[], entries: readonly ConsentLike[], now: Date, fallback: string, days = 90): SourceCount[] {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = new Map<string, SourceCount>();
  for (const c of contacts) {
    if (!isRealLead(c) || c.createdAt < since) continue;
    const label = leadSourceLabel(c, fallback);
    const k = label.toLowerCase();
    const row = rows.get(k) ?? { source: label, leads: 0, canCall: 0 };
    row.leads++;
    if (leadNamedYou(c.id, entries)) row.canCall++;
    rows.set(k, row);
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
