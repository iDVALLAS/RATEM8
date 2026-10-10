/**
 * lib/state-colors.ts — one data-palette hue per licensed state (v24),
 * for state chips only. Design, not a fact, so it lives outside config.
 * A state missing here (a new one) gets the plain green chip until it is
 * given a hue; a test keeps every licensed state covered and distinct.
 */
import type { DataHue } from "./lenders";

export const STATE_HUE: Record<string, DataHue> = {
  WA: 1, // sky
  OR: 3, // orchid
  CA: 5, // amber
  AZ: 4, // coral
  TX: 2, // iris
};
