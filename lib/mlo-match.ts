/**
 * lib/mlo-match.ts — when may the site name an individual loan officer?
 * (v14, Edit 6b). Pure and dependency-free so client components can use
 * it without pulling config into the browser bundle.
 *
 * The rule:
 *   - `source: "none"` → generic copy everywhere, no name.
 *   - `source: "borrower_stated"` (they gave a region or ZIP) or
 *     `"chosen"` (they picked an MLO) → name the matched MLO.
 *   - `source: "ip"` → name the MLO only when the state is known to be
 *     an assign state (`borrowerChooses === false`). In borrower-choose
 *     states, or when it is unknown, IP alone never shows a name; a name
 *     appears only after the borrower picks.
 *
 * Whenever a name renders, that MLO's NMLS number renders on the same
 * page (the footer's MloFooterLine does it for every page).
 *
 * v15 (Patch B) fills it per request from lib/routing.ts when
 * MLO_ROUTING is on; with the flag off every visitor gets `NO_MLO`.
 */

import type { Mlo, MloLicense, StateCode } from "./config";

export type MloSource = "none" | "ip" | "borrower_stated" | "chosen";

/**
 * Where routing landed (v15, Patch B; lib/routing.ts):
 *   off        — MLO_ROUTING is off; generic everywhere (v14 behaviour)
 *   unknown    — no state yet; ask "Where's the property?"
 *   matched    — one MLO for this visitor (assign state, or chosen)
 *   choose     — a choose state; the borrower picks, nothing pre-selected
 *   unlicensed — no licensed MLO in the resolved state; say so honestly
 */
export type RouteStatus = "off" | "unknown" | "matched" | "choose" | "unlicensed";

export interface MloContextValue {
  mlo: Mlo | null;
  source: MloSource;
  /** The licensed state the match is for, when known. */
  state?: StateCode | null;
  /**
   * True when the borrower picks their MLO in this state (more than one
   * serves it). Unknown is treated as true: IP never names on a guess.
   */
  borrowerChooses?: boolean;
  status?: RouteStatus;
  /** Resolved US state (licensed or not) and its name. */
  stateCode?: string | null;
  stateName?: string | null;
  /** The matched MLO's license in that state (number + sponsor), atomically with `mlo`. */
  license?: MloLicense | null;
  /** Choose mode: every licensed MLO for the state, random order, none pre-selected. */
  candidates?: Mlo[];
  /** Inputs, for the beacon and M8: property state wins over IP. */
  ipState?: string | null;
  propertyState?: string | null;
  /** Property state and IP state differ (the mover case). */
  moved?: boolean;
}

export const NO_MLO: MloContextValue = { mlo: null, source: "none", status: "off" };

/** The MLO the page may name, or null for generic copy. */
export function nameableMlo(v: MloContextValue): Mlo | null {
  if (!v.mlo || v.source === "none") return null;
  if (v.source === "ip" && v.borrowerChooses !== false) return null;
  return v.mlo;
}

/** Fills `{first}` and `{name}` in a copy template. */
export function fillMlo(template: string, mlo: Pick<Mlo, "firstName" | "name">): string {
  return template.replaceAll("{first}", mlo.firstName).replaceAll("{name}", mlo.name);
}
