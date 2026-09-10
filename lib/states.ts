/**
 * lib/states.ts — Launch-scope and licensed-scope state configuration.
 *
 * Two distinct concepts:
 *
 *   LAUNCH_STATES  — where LoanM8 actively markets, publishes local pages,
 *                    and encourages borrower/agent inquiries.
 *   LICENSED_STATES — where the anchor MLO holds a current license and can
 *                    legally originate loans. Superset of LAUNCH_STATES.
 *
 * WHY THIS EXISTS:
 *   The MLO's legal license footprint (LICENSED_STATES) and the site's
 *   go-to-market scope (LAUNCH_STATES) are different decisions and change
 *   at different cadences. The MLO can be licensed in 50 states while the
 *   site only markets in 2. Baking either concept into copy strings makes
 *   both changes hurt.
 *
 * WHERE THESE FLOW:
 *   - Marketing copy ("Available in ...") reads from LAUNCH_STATES.
 *   - Legal license disclosure (footer, /about) reads from LICENSED_STATES.
 *   - Local market pages (/markets/[city]) are generated per LAUNCH_STATES.
 *
 * WHEN LAUNCH_STATES CHANGES:
 *   Just add/remove entries here. The Footer, homepage, /agents, and
 *   /markets pages regenerate automatically.
 *
 * WHEN LICENSED_STATES CHANGES:
 *   The v9 licensing.ts model tracks sponsoring entities per state. That
 *   file is still the authoritative source for legal compliance data —
 *   this file derives LICENSED_STATES from it so we don't have two
 *   sources of truth for the state list. As new state licenses are added
 *   with their sponsors, they land in licensing.ts and appear here
 *   automatically.
 *
 * COMPLIANCE NOTE:
 *   The prompt says the anchor MLO is now "licensed in all states." That
 *   is a legal fact separate from the site's per-state sponsoring-entity
 *   data. Until each state's sponsor is added to lib/licensing.ts, the
 *   disclosure only names states with known sponsors. Do not claim a
 *   state on the footer unless the sponsor for that state is in
 *   licensing.ts — an audited disclosure with a wrong sponsor is worse
 *   than a shorter disclosure with correct ones.
 */

import { ANCHOR_LO, type StateCode } from "./licensing";

/**
 * States with active marketing / local-content focus.
 *
 * V11 launch scope: WA + AZ (best demographics for real estate and
 * purchases per the master build prompt). Add entries here to expand
 * marketing footprint — every marketing-copy consumer regenerates.
 */
export const LAUNCH_STATES: StateCode[] = ["WA", "AZ"];

/**
 * All states where the anchor MLO holds a current license.
 * Derived from lib/licensing.ts so we don't duplicate the sponsor-per-state
 * source of truth. Currently: WA, AZ, CA, TX.
 */
export const LICENSED_STATES: StateCode[] = ANCHOR_LO.states.map((s) => s.state);

/** Human-readable full state names, keyed by code. */
export const STATE_FULL_NAMES: Record<StateCode, string> = ANCHOR_LO.states.reduce(
  (acc, s) => {
    acc[s.state] = s.fullName;
    return acc;
  },
  {} as Record<StateCode, string>
);

/** Format a list of state codes into "X, Y, and Z" prose. */
function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** "WA · AZ" — for eyebrow / mono-cap contexts. */
export const LAUNCH_STATES_SHORT = LAUNCH_STATES.join(" · ");

/** "Washington and Arizona" — for prose marketing copy. */
export const LAUNCH_STATES_LONG = formatList(
  LAUNCH_STATES.map((s) => STATE_FULL_NAMES[s] ?? s)
);

/** "WA · AZ · CA · TX" — for footer compliance eyebrow. */
export const LICENSED_STATES_SHORT = LICENSED_STATES.join(" · ");

/** "Washington, Arizona, California, and Texas" — for prose legal disclosure. */
export const LICENSED_STATES_LONG = formatList(
  LICENSED_STATES.map((s) => STATE_FULL_NAMES[s] ?? s)
);

/** Convenience: is this state one where LoanM8 currently markets? */
export function isLaunchState(code: StateCode | string): boolean {
  return (LAUNCH_STATES as string[]).includes(code);
}

/** Convenience: is this state one where the MLO is licensed? */
export function isLicensedState(code: StateCode | string): boolean {
  return (LICENSED_STATES as string[]).includes(code);
}
