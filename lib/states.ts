/**
 * lib/states.ts — state scope helpers, derived from lib/config.ts.
 *
 * LAUNCH_STATES = where LoanM8 markets. The one-shot build launches in
 * exactly four states (WA, AZ, CA, TX), so launch scope equals the
 * licensed footprint. Both derive from CONFIG.states — one edit, every
 * consumer regenerates.
 */

import { STATES, type StateCode } from "./config";

export type { StateCode };

export const LAUNCH_STATES: StateCode[] = STATES.map((s) => s.code);
export const LICENSED_STATES: StateCode[] = STATES.map((s) => s.code);

export const STATE_FULL_NAMES: Record<StateCode, string> = STATES.reduce(
  (acc, s) => {
    acc[s.code] = s.name;
    return acc;
  },
  {} as Record<StateCode, string>
);

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export const LAUNCH_STATES_SHORT = LAUNCH_STATES.join(" · ");
export const LAUNCH_STATES_LONG = formatList(LAUNCH_STATES.map((s) => STATE_FULL_NAMES[s]));
export const LICENSED_STATES_SHORT = LICENSED_STATES.join(" · ");
export const LICENSED_STATES_LONG = formatList(LICENSED_STATES.map((s) => STATE_FULL_NAMES[s]));

export function isLaunchState(code: string): boolean {
  return (LAUNCH_STATES as string[]).includes(code);
}

export function isLicensedState(code: string): boolean {
  return (LICENSED_STATES as string[]).includes(code);
}
