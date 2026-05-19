/**
 * ─── LICENSING & COMPLIANCE CONFIG ──────────────────────────────
 *
 * Single source of truth for everything regulatory.
 *
 * EDIT THIS FILE WHEN:
 *   • a license number changes
 *   • a new state is added
 *   • a sponsoring entity is changed
 *   • Jason's contact info changes
 *   • a new subscribing LO is onboarded (see "Adding an LO" below)
 *
 * Everything else (footer, disclaimer, about page, contact page)
 * reads from these values. The disclaimer is built dynamically
 * from the active LO's record.
 *
 * ─────────────────────────────────────────────────────────────
 * MULTI-LO ROADMAP
 * ─────────────────────────────────────────────────────────────
 *
 * V1 (now): Single LO. Jason is the only active LO. The public
 *           site shows Jason's NMLS, license states, and his
 *           sponsoring entities. All borrowers route to Jason.
 *
 * V2 (later, after compliance attorney signs off and 25–50 closed
 *           loans through Jason): Multiple LOs subscribe. Round-
 *           robin distribution routes inbound leads to LOs eligible
 *           for the borrower's state. Each LO has their own NMLS,
 *           sponsoring entities, and subscription tier. Public-facing
 *           disclosures dynamically reflect whichever LO is about
 *           to close the loan.
 *
 * Adding an LO (when V2 is ready):
 *   1. Compliance attorney drafts subscription agreement (RESPA-safe
 *      flat monthly fee, NOT per-lead)
 *   2. Verify LO's NMLS status on nmlsconsumeraccess.org
 *   3. Verify each state license is current
 *   4. Add a new LoanOfficer record to LOAN_OFFICERS below
 *   5. Set `subscriptionStatus: "active"` and `roundRobinEligible: true`
 *   6. Confirm `FEATURES.roundRobinEnabled = true` in this file
 *
 * Verify all NMLS / state license numbers on:
 * https://www.nmlsconsumeraccess.org/
 */

/* ─── Types ─────────────────────────────────────────────────── */

export type StateCode = "WA" | "AZ" | "CA" | "TX";

export type SponsoringEntity = {
  /** Legal name as registered with NMLS — must match Consumer Access record */
  name: string;
  /** Identifier label: "NMLS", "AZ License", "CA DFPI", etc. */
  idLabel: string;
  /** The identifier number */
  idNumber: string;
};

export type StateLicense = {
  state: StateCode;
  fullName: string;
  /** Sponsoring entity that originates loans in this state */
  sponsor: SponsoringEntity;
  /** LO's individual license in this state, if different from primary NMLS */
  individualLicense?: string;
};

export type SubscriptionTier = "founder" | "solo" | "team" | "enterprise";

export type LoanOfficer = {
  /** Stable internal ID — used in URLs, routing, billing */
  id: string;

  /** Display info */
  name: string;
  firstName: string;
  email: string;
  phone: string;
  title: string;

  /** Primary NMLS individual ID */
  nmls: string;

  /** Operating entity (LLC or DBA) the LO does business as */
  operatingEntity: {
    legalName: string;
    /** What appears as trade name on the LO's pages */
    tradeName: string;
  };

  /** Per-state licensing detail */
  states: StateLicense[];

  /** Subscription / routing status */
  subscriptionStatus: "active" | "paused" | "trial" | "founder";
  subscriptionTier: SubscriptionTier;
  /** Whether this LO accepts round-robin routed leads */
  roundRobinEligible: boolean;
  /** Daily lead cap for this LO (round-robin respects it) */
  dailyLeadCap?: number;

  /** Marketing / Calendly */
  calendlyBorrower?: string;
  calendlyAgent?: string;

  /** Used to mark Jason or any other LO as the "face" of the platform.
   *  Exactly one LO should have this true at any time. */
  isAnchor: boolean;
};

/* ─── Feature flags ─────────────────────────────────────────── */

export const FEATURES = {
  /** When false, all leads route to the anchor LO. Flip to true ONLY
   *  after compliance attorney approves multi-LO subscription model
   *  AND at least one non-anchor LO is onboarded. */
  roundRobinEnabled: false,

  /** When true, public marketing pages (homepage, /about) show the
   *  anchor LO's info. When false, /agents page becomes the LO
   *  recruitment surface and lead pages show "you'll be routed to
   *  the best-fit LO for your state". */
  showAnchorLoPublicly: true,
} as const;

/* ─── Sponsoring entities ───────────────────────────────────── */

const HOME_TRUST_LOANS: SponsoringEntity = {
  name: "Home Trust Loans",
  idLabel: "NMLS",
  idNumber: "1761573", // VERIFY on Consumer Access
};

const HOME_FINANCIAL_AZ: SponsoringEntity = {
  name: "Home Financial",
  idLabel: "AZ License",
  idNumber: "1037722", // VERIFY on Consumer Access
};

/* ─── Loan Officers ─────────────────────────────────────────── */
/*
 * To add a new LO, append a new object to this array following the
 * LoanOfficer type. Compliance attorney must approve before
 * activating (subscriptionStatus: "active" + roundRobinEligible: true).
 */

export const LOAN_OFFICERS: LoanOfficer[] = [
  {
    id: "jason-shapiro",
    name: "Jason Shapiro",
    firstName: "Jason",
    email: "jason@ratem8.com",
    phone: "[(XXX) XXX-XXXX]", // Replace before publishing
    title: "Mortgage Loan Originator",
    nmls: "1844143",
    operatingEntity: {
      legalName: "Shapiro Home Loans LLC",
      tradeName: "RateM8 Loan Intelligence",
    },
    states: [
      { state: "WA", fullName: "Washington", sponsor: HOME_TRUST_LOANS },
      { state: "AZ", fullName: "Arizona", sponsor: HOME_FINANCIAL_AZ },
      { state: "CA", fullName: "California", sponsor: HOME_TRUST_LOANS },
      { state: "TX", fullName: "Texas", sponsor: HOME_TRUST_LOANS },
    ],
    subscriptionStatus: "founder",
    subscriptionTier: "founder",
    roundRobinEligible: true,
    calendlyBorrower:
      process.env.NEXT_PUBLIC_CALENDLY_BORROWER ||
      "https://calendly.com/jason-ratem8/talk-to-jason",
    calendlyAgent:
      process.env.NEXT_PUBLIC_CALENDLY_AGENT ||
      "https://calendly.com/jason-ratem8/agent-partnership",
    isAnchor: true,
  },
  // Add subscribing LOs here when V2 ships.
];

/* ─── Helpers / Derived Values ──────────────────────────────── */

/** The "anchor" LO whose info shows on public marketing pages today. */
export function getAnchorLo(): LoanOfficer {
  const anchor = LOAN_OFFICERS.find((lo) => lo.isAnchor);
  if (!anchor) {
    throw new Error(
      "No anchor LO found. Exactly one LO must have isAnchor: true."
    );
  }
  return anchor;
}

/** All LOs eligible to receive routed leads for a given state.
 *  Used by the (future) round-robin router. Today returns just Jason. */
export function getEligibleLos(state: StateCode): LoanOfficer[] {
  return LOAN_OFFICERS.filter(
    (lo) =>
      lo.subscriptionStatus === "active" ||
      lo.subscriptionStatus === "founder"
  )
    .filter(
      (lo) =>
        FEATURES.roundRobinEnabled ? lo.roundRobinEligible : lo.isAnchor
    )
    .filter((lo) => lo.states.some((s) => s.state === state));
}

/** Active state codes from the anchor LO's licenses. */
export function getActiveStates(): StateCode[] {
  return getAnchorLo().states.map((s) => s.state);
}

/** "WA · AZ · CA · TX" */
export function getStateListShort(): string {
  return getActiveStates().join(" · ");
}

/** "Washington, Arizona, California, and Texas" */
export function getStateListLong(): string {
  return formatList(getAnchorLo().states.map((s) => s.fullName));
}

/** NMLS badge string for compliance display. */
export function getNmlsBadge(lo: LoanOfficer = getAnchorLo()): string {
  return `NMLS #${lo.nmls} · ${lo.states.map((s) => s.state).join(" · ")}`;
}

/* ─── Disclaimer generator ──────────────────────────────────── */

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

type SponsorGroup = {
  sponsor: SponsoringEntity;
  states: StateLicense[];
};

function groupBySponsor(lo: LoanOfficer): SponsorGroup[] {
  const map = new Map<string, SponsorGroup>();
  for (const s of lo.states) {
    const key = `${s.sponsor.name}|${s.sponsor.idNumber}`;
    if (!map.has(key)) {
      map.set(key, { sponsor: s.sponsor, states: [] });
    }
    map.get(key)!.states.push(s);
  }
  return Array.from(map.values());
}

/** Build the legal footer paragraph for a specific LO.
 *  Defaults to the anchor LO. When V2 ships, lead-completion pages
 *  can call this with the routed LO so disclosures match the
 *  closing officer. */
export function buildDisclaimer(lo: LoanOfficer = getAnchorLo()): string {
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
    "Equal Housing Lender. This is not a commitment to lend. Rates, terms, and program availability subject to change. Approval subject to verification of income, assets, and credit.",
  ].join(" ");
}

/* ─── Top-level convenience exports ─────────────────────────── */

export const ANCHOR_LO = getAnchorLo();
export const STATE_LIST_SHORT = getStateListShort();
export const STATE_LIST_LONG = getStateListLong();
export const NMLS_BADGE = getNmlsBadge();
export const DISCLAIMER = buildDisclaimer();
export const PRIVACY_EMAIL = "privacy@ratem8.com";
