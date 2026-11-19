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
  /**
   * D13: any marketing call or text needs prior express written consent,
   * with an exception only for an existing customer of the current company
   * (CT CGS 42-288a).
   */
  salesNeedWritten?: boolean;
  /** D13: after a "no", no more sales calls for a year (WA RCW 80.36.390). */
  noCallYearAfterNo?: boolean;
  /** D13: what to say in the first seconds of a sales call. */
  opening?: string;
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
  CT: { salesNeedWritten: true, opening: "Within the first 10 seconds: your name, your company, and why you're calling. If they say stop, end the call (CGS 42-288a).", note: "Connecticut (CGS 42-288a): 9 AM–8 PM; any sales call or text needs written permission naming the method and number, except to an existing customer." },
  VA: { opening: "At the start, say your first and last name and your company (Va. Code 59.1-512).", note: "Virginia (59.1-510 to -515): 8 AM–9 PM (our default is stricter); texts count; a stop lasts 10 years." },
  TX: { sunday: { start: 12, end: 20 }, note: "Texas: telephone solicitation on Sunday only from noon; texts are covered since 2025." },
  LA: { sunday: null, note: "Louisiana: no telephone solicitation on Sundays or state holidays." },
  ME: { sunday: null, note: "Maine: conservative default, no Sunday marketing contact." },
  RI: { sunday: null, note: "Rhode Island: no telephone solicitation on Sundays or holidays." },
  WA: { noCallYearAfterNo: true, opening: "Say your name and company at the start; if they say no, end the call politely (RCW 80.36.390).", note: "Washington: marketing texts need clear advance consent, with no past-client exception (RCW 19.190.060); calls 8 AM–8 PM; after a no, no sales calls for a year (RCW 80.36.390)." },
};

export function ruleFor(state: string | null): StateRule {
  const s = state ?? "";
  return { ...DEFAULT_RULE, ...(OVERRIDES[s] ?? {}), allPartyRecording: ALL_PARTY.includes(s) };
}

/**
 * D13 (ledger §B): a person can be covered by more than one state's law (the
 * property's state and their phone's area code, which CT, FL and others use
 * to presume residence). The strictest of every state applies.
 */
export function ruleForStates(states: (string | null)[]): StateRule {
  const list = [...new Set(states.filter((s): s is string => !!s))];
  if (list.length <= 1) return ruleFor(list[0] ?? null);
  const rules = list.map(ruleFor);
  const sundays = rules.map((r) => r.sunday);
  const sunday = sundays.some((x) => x === null) ? null : sundays.some((x) => x) ? { start: Math.max(...sundays.map((x) => x?.start ?? 0)), end: Math.min(...sundays.map((x) => x?.end ?? 24)) } : undefined;
  return {
    start: Math.max(...rules.map((r) => r.start)),
    end: Math.min(...rules.map((r) => r.end)),
    ...(sunday !== undefined ? { sunday } : {}),
    callsPerDay: Math.min(...rules.map((r) => r.callsPerDay)),
    textsPerDay: Math.min(...rules.map((r) => r.textsPerDay)),
    textsPerWeek: Math.min(...rules.map((r) => r.textsPerWeek)),
    allPartyRecording: rules.some((r) => r.allPartyRecording),
    salesNeedWritten: rules.some((r) => r.salesNeedWritten),
    noCallYearAfterNo: rules.some((r) => r.noCallYearAfterNo),
    opening: rules.map((r) => r.opening).filter(Boolean).join(" ") || undefined,
    note: rules.map((r) => r.note).filter(Boolean).join(" ") || undefined,
  };
}

/**
 * Area codes of the states with special rules (and our five), so a number's
 * state can be presumed. Not every US area code: an unknown one adds no state.
 */
const AREA: Record<string, string> = {};
const add = (st: string, codes: string) => codes.split(" ").forEach((c) => (AREA[c] = st));
add("WA", "206 253 360 425 509 564");
add("OR", "458 503 541 971");
add("AZ", "480 520 602 623 928");
add("CA", "209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951");
add("TX", "210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979");
add("CT", "203 475 860 959");
add("VA", "276 434 540 571 703 757 804 826 948");
add("FL", "239 305 321 324 352 386 407 448 561 645 656 727 754 772 786 813 850 863 904 941 954");
add("OK", "405 539 572 580 918");
add("MD", "227 240 301 410 443 667");
add("LA", "225 318 337 504 985");
add("ME", "207");
add("RI", "401");

/** The state an E.164 US number's area code points to, if it's one we track. */
export function areaCodeState(phone: string | null | undefined): string | null {
  const m = (phone ?? "").match(/^\+1(\d{3})\d{7}$/);
  return m ? (AREA[m[1]] ?? null) : null;
}

export const ALL_PARTY_STATES = ALL_PARTY;
