/**
 * lib/send-gate/rules.ts — the per-state contact rules (D3). Client-safe.
 *
 * Every value here is a conservative default for counsel to confirm (build
 * prompt §2.1: "default to the strictest window"). Changing a value is a
 * one-line edit, and every send decision says which rule applied.
 */

/** Time zones a state spans. A send must be inside the window in every one of them. */
export const STATE_ZONES: Record<string, string[]> = {
  AL: ["America/Chicago"], AK: ["America/Anchorage", "America/Adak"], AZ: ["America/Phoenix"], AR: ["America/Chicago"],
  CA: ["America/Los_Angeles"], CO: ["America/Denver"], CT: ["America/New_York"], DE: ["America/New_York"], DC: ["America/New_York"],
  FL: ["America/New_York", "America/Chicago"], GA: ["America/New_York"], HI: ["Pacific/Honolulu"], ID: ["America/Boise", "America/Los_Angeles"],
  IL: ["America/Chicago"], IN: ["America/Indiana/Indianapolis", "America/Chicago"], IA: ["America/Chicago"], KS: ["America/Chicago", "America/Denver"],
  KY: ["America/New_York", "America/Chicago"], LA: ["America/Chicago"], ME: ["America/New_York"], MD: ["America/New_York"], MA: ["America/New_York"],
  MI: ["America/Detroit", "America/Chicago"], MN: ["America/Chicago"], MS: ["America/Chicago"], MO: ["America/Chicago"], MT: ["America/Denver"],
  NE: ["America/Chicago", "America/Denver"], NV: ["America/Los_Angeles"], NH: ["America/New_York"], NJ: ["America/New_York"], NM: ["America/Denver"],
  NY: ["America/New_York"], NC: ["America/New_York"], ND: ["America/Chicago", "America/Denver"], OH: ["America/New_York"], OK: ["America/Chicago"],
  OR: ["America/Los_Angeles", "America/Boise"], PA: ["America/New_York"], RI: ["America/New_York"], SC: ["America/New_York"], SD: ["America/Chicago", "America/Denver"],
  TN: ["America/Chicago", "America/New_York"], TX: ["America/Chicago", "America/Denver"], UT: ["America/Denver"], VT: ["America/New_York"], VA: ["America/New_York"],
  WA: ["America/Los_Angeles"], WV: ["America/New_York"], WI: ["America/Chicago"], WY: ["America/Denver"], PR: ["America/Puerto_Rico"],
};

export type StateRule = {
  /** Calls and texts only inside [start, end) local hours. */
  start: number;
  end: number;
  /** Optional narrower Sunday window, or null for no Sunday sends. */
  sunday?: { start: number; end: number } | null;
  /** Marketing calls (any kind) to one person per 24 hours. */
  callsPerDay: number;
  /** Marketing texts to one person per 24 hours and per 7 days. */
  textsPerDay: number;
  textsPerWeek: number;
  /** Two-party (all-party) consent to record a call. */
  allPartyRecording: boolean;
  note?: string;
};

/**
 * Default: 9 AM to 8 PM local, the strictest window the build prompt calls
 * for (D6; Connecticut is reported at 9 to 8 for sales calls and texts),
 * 3 calls a day, 1 text a day and 3 a week.
 */
export const DEFAULT_RULE: StateRule = { start: 9, end: 20, callsPerDay: 3, textsPerDay: 1, textsPerWeek: 3, allPartyRecording: false };

/** All-party recording states (counsel to confirm; some apply only to private or in-person conversations). */
const ALL_PARTY = ["CA", "CT", "DE", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA"];

const OVERRIDES: Record<string, Partial<StateRule>> = {
  FL: { note: "Florida Telephone Solicitation Act: 8 AM–8 PM, no more than 3 calls in 24 hours on the same subject (our default is stricter)." },
  OK: { note: "Oklahoma Telephone Solicitation Act: 8 AM–8 PM, no more than 3 calls in 24 hours (our default is stricter)." },
  MD: { note: "Maryland Stop the Spam Calls Act: 8 AM–8 PM, no more than 3 calls in 24 hours (our default is stricter)." },
  CT: { note: "Connecticut: 9 AM–8 PM for sales calls and texts (reported; counsel to confirm)." },
  TX: { sunday: { start: 12, end: 20 }, note: "Texas: telephone solicitation on Sunday only from noon; texts are covered since 2025." },
  LA: { sunday: null, note: "Louisiana: no telephone solicitation on Sundays or state holidays." },
  ME: { sunday: null, note: "Maine: conservative default, no Sunday marketing contact." },
  RI: { sunday: null, note: "Rhode Island: no telephone solicitation on Sundays or holidays." },
  WA: { note: "Washington: commercial texts need consent; calls 8 AM–8 PM." },
};

export function ruleFor(state: string | null): StateRule {
  const s = state ?? "";
  return { ...DEFAULT_RULE, ...(OVERRIDES[s] ?? {}), allPartyRecording: ALL_PARTY.includes(s) };
}

export const ALL_PARTY_STATES = ALL_PARTY;
