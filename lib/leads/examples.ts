/**
 * lib/leads/examples.ts — D82: the example numbers on Lead sources. One fixed
 * fixture: the sample rows from the owner's "page once built" mockup (and
 * Options B and C), with the real vendor names the owner chose to keep
 * (decision 2, 2026-11-22) under a visible EXAMPLE label.
 *
 * Display only. Never written to a store, never exported, never counted in a
 * report, never sent to the AI or the agents. Only the Lead sources page may
 * import this file (a test in lib/leads/examples.test.ts holds every other
 * module to that).
 */

export type ExampleBadge = "best" | "scale" | "watch" | "fix" | "pause";

export type ExampleSource = {
  name: string;
  /** Dollars spent in the period. */
  spent: number;
  leads: number;
  /** Leads whose form named the loan officer. */
  canCall: number;
  loans: number;
  badge: ExampleBadge;
  /** The line under a phone card (Option B). */
  note: string;
};

export type ExampleLead = { name: string; source: string; at: string; permission: boolean };

export type Examples = {
  readonly example: true;
  readonly period: "90 days";
  /** The Business Manager's line above the scorecard (after "Business Manager:"). */
  readonly banner: string;
  readonly sources: readonly ExampleSource[];
  readonly plan: { readonly monthly: number; readonly day: number; readonly of: number; readonly split: readonly { label: string; dollars: number }[]; readonly nextCheckIn: string };
  readonly recent: readonly ExampleLead[];
};

const freeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as object)) freeze(v);
    Object.freeze(o);
  }
  return o;
};

export const EXAMPLES: Examples = freeze({
  example: true,
  period: "90 days",
  banner: "your web form makes loans at a third of Zillow’s cost. Move Bankrate’s budget there for 60 days?",
  sources: [
    { name: "Past clients & sphere", spent: 120, leads: 18, canCall: 18, loans: 2, badge: "best", note: "Cards & campaigns" },
    { name: "Your web form", spent: 1800, leads: 60, canCall: 60, loans: 3, badge: "scale", note: "Google Ads → Zapier" },
    { name: "Zillow", spent: 3600, leads: 40, canCall: 40, loans: 2, badge: "watch", note: "Highest cost per lead" },
    { name: "LendingTree", spent: 2700, leads: 90, canCall: 18, loans: 1, badge: "fix", note: "$150 per lead you can call" },
    { name: "Bankrate", spent: 1500, leads: 25, canCall: 10, loans: 0, badge: "pause", note: "90 days, 0 closings" },
  ],
  plan: {
    monthly: 1500,
    day: 34,
    of: 90,
    split: [
      { label: "Past clients", dollars: 150 },
      { label: "Web form ads", dollars: 900 },
      { label: "Zillow", dollars: 450 },
    ],
    nextCheckIn: "Dec 22",
  },
  recent: [
    { name: "Maria Lopez", source: "Zillow", at: "Nov 21, 9:14 AM", permission: true },
    { name: "Dana Nguyen", source: "LendingTree", at: "Nov 21, 8:02 AM", permission: false },
    { name: "Sam Patel", source: "Your web form", at: "Nov 20, 6:40 PM", permission: true },
  ],
} as const satisfies Examples);

/** The numbers each example row shows, worked out from its raw figures (rounded to whole dollars and percents). */
export function exampleRow(s: ExampleSource) {
  return {
    perLead: Math.round(s.spent / s.leads),
    canCallShare: Math.round((100 * s.canCall) / s.leads),
    perLoan: s.loans ? Math.round(s.spent / s.loans) : null,
    perCallable: s.canCall ? Math.round(s.spent / s.canCall) : null,
  };
}
