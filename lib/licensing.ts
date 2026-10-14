/**
 * lib/licensing.ts — compatibility layer over lib/config.ts.
 *
 * Earlier patches (v4–v11) made this file the source of truth for
 * regulatory data. The one-shot site build moved every fact into
 * `lib/config.ts` (CONFIG). This file now DERIVES its exports from
 * CONFIG so older imports keep working and there is exactly one place
 * to edit a license number.
 *
 * Do not add new facts here. Add them to lib/config.ts.
 */

import {
  CONFIG,
  ALL_MLOS,
  STATES,
  type Mlo,
  STATE_NAMES_LINE,
  STATE_CODES_LINE,
  NOT_A_COMMITMENT,
  type StateCode,
} from "./config";

export type { StateCode };

export type SponsoringEntity = {
  name: string;
  idLabel: string;
  idNumber: string;
};

export type StateLicense = {
  state: StateCode;
  fullName: string;
  sponsor: SponsoringEntity;
  individualLicense?: string;
};

export type LoanOfficer = {
  id: string;
  name: string;
  firstName: string;
  email: string;
  phone: string;
  title: string;
  nmls: string;
  operatingEntity: { legalName: string; tradeName: string };
  states: StateLicense[];
  calendlyBorrower?: string;
  calendlyAgent?: string;
  isAnchor: boolean;
};

export const FEATURES = {
  roundRobinEnabled: false,
  showAnchorLoPublicly: true,
} as const;

/** v15: one LoanOfficer per registry MLO, licensed only where their record says. */
function toLoanOfficer(m: Mlo): LoanOfficer {
  return {
    id: m.id,
    name: m.name,
    firstName: m.firstName,
    email: CONFIG.contactEmail,
    phone: "[(XXX) XXX-XXXX]",
    title: m.title,
    nmls: m.nmls,
    operatingEntity: {
      legalName: CONFIG.entityLegalName,
      tradeName: CONFIG.entityTradeName,
    },
    states: m.licenses.map((l) => ({
      state: l.state,
      fullName: STATES.find((s) => s.code === l.state)?.name ?? l.state,
      sponsor: l.sponsor,
      individualLicense: l.license,
    })),
    calendlyBorrower: m.calendly,
    calendlyAgent: CONFIG.calendly.agent,
    isAnchor: m.id === CONFIG.routing.operatorMloId,
  };
}

export const LOAN_OFFICERS: LoanOfficer[] = ALL_MLOS.map(toLoanOfficer);
const anchor: LoanOfficer = LOAN_OFFICERS.find((lo) => lo.isAnchor) ?? LOAN_OFFICERS[0];

export function getAnchorLo(): LoanOfficer {
  return anchor;
}

export function getEligibleLos(state: StateCode): LoanOfficer[] {
  return LOAN_OFFICERS.filter((lo) => lo.states.some((s) => s.state === state));
}

export function getActiveStates(): StateCode[] {
  return STATES.map((s) => s.code);
}

export function getStateListShort(): string {
  return STATE_CODES_LINE;
}

export function getStateListLong(): string {
  return STATE_NAMES_LINE;
}

export function getNmlsBadge(lo: LoanOfficer = anchor): string {
  return `NMLS #${lo.nmls} · ${lo.states.map((s) => s.state).join(" · ")}`;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

type SponsorGroup = { sponsor: SponsoringEntity; states: StateLicense[] };

/**
 * Sponsor sentences. With no argument: the platform view, every licensed
 * state grouped by each sponsor that has an MLO there (footer,
 * /disclosures). With a loan officer: that MLO's own licenses.
 */
export function groupBySponsor(lo?: LoanOfficer): SponsorGroup[] {
  const pairs: StateLicense[] = lo
    ? lo.states
    : STATES.flatMap((st) => st.sponsors.map((sp) => ({ state: st.code, fullName: st.name, sponsor: sp })));
  const map = new Map<string, SponsorGroup>();
  for (const s of pairs) {
    const key = `${s.sponsor.name}|${s.sponsor.idNumber}`;
    if (!map.has(key)) map.set(key, { sponsor: s.sponsor, states: [] });
    map.get(key)!.states.push(s);
  }
  return Array.from(map.values());
}

/** The legal footer paragraph. Counsel reviews the wording ([COUNSEL REVIEW]). */
export function buildDisclaimer(lo: LoanOfficer = anchor): string {
  const { tradeName, legalName } = lo.operatingEntity;
  const sponsorSentences = groupBySponsor(lo)
    .map(({ sponsor, states }) => {
      const stateList = formatList(states.map((s) => s.fullName));
      return `Loans in ${stateList} are originated through ${sponsor.name} (${sponsor.idLabel} #${sponsor.idNumber}).`;
    })
    .join(" ");

  return [
    `${tradeName} is a trade name of ${legalName}.`,
    `${lo.name} is an NMLS-licensed ${lo.title} (NMLS #${lo.nmls}).`,
    sponsorSentences,
    `Equal Housing Lender. ${NOT_A_COMMITMENT}`,
  ].join(" ");
}

export const ANCHOR_LO = anchor;
export const STATE_LIST_SHORT = STATE_CODES_LINE;
export const STATE_LIST_LONG = STATE_NAMES_LINE;
export const NMLS_BADGE = getNmlsBadge();
export const DISCLAIMER = buildDisclaimer();
export const PRIVACY_EMAIL = CONFIG.privacyEmail;
