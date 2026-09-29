/**
 * lib/config.ts — the single source of truth for every FACT the site states.
 *
 * Nothing in this file may be hardcoded in a component. If a page says
 * "licensed in", "NMLS #", a name, an email, or a Calendly link, it
 * renders from here.
 *
 * Bracketed values ("[LIKE THIS]") are placeholders that MUST be filled
 * before launch. See PLACEHOLDERS.md for the full list with file paths.
 *
 * Values that were already present in the repo (lib/licensing.ts, entered
 * by the site owner in earlier patches) are carried over and marked
 * `// carried over — VERIFY`. They were not invented for this build, but
 * every one of them still needs verification on nmlsconsumeraccess.org
 * before the stealth gate lifts.
 */

const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

export type StateSlug = "washington" | "arizona" | "california" | "texas";
export type StateCode = "WA" | "AZ" | "CA" | "TX";

export type StateConfig = {
  slug: StateSlug;
  code: StateCode;
  name: string;
  /** Where LoanM8 actually serves borrowers in this state. */
  serviceArea: string;
  /** Entity-level license identifier for this state. */
  entityLicense: string;
  /** The principal MLO's individual license identifier for this state. */
  mloLicense: string;
  /** Regulator display name. */
  regulatorName: string;
  /** Regulator URL (consumer complaint / license lookup). */
  regulatorUrl: string;
  /** Sponsoring entity that originates loans in this state (carried over). */
  sponsor: { name: string; idLabel: string; idNumber: string };
  /**
   * Any state-mandated disclosure language. Rendered verbatim on the
   * state page and /disclosures when non-empty. Counsel fills this in.
   */
  requiredDisclosure: string;
  /** Two-party recording consent state (affects chat/voice consent copy). */
  twoPartyConsent: boolean;
};

export type Mlo = {
  name: string;
  firstName: string;
  nmls: string;
  title: string;
  bioShort: string;
  /** Link to the MLO's NMLS Consumer Access record. */
  nmlsConsumerAccessUrl: string;
};

const SPONSOR_HOME_TRUST = {
  name: "Home Trust Loans",
  idLabel: "NMLS",
  idNumber: "1761573", // carried over — VERIFY on nmlsconsumeraccess.org
};

const SPONSOR_HOME_FINANCIAL_AZ = {
  name: "Home Financial",
  idLabel: "AZ License",
  idNumber: "1037722", // carried over — VERIFY on nmlsconsumeraccess.org
};

export const CONFIG = {
  brandName: "LoanM8",
  brandSubname: "Loan Intelligence",
  domain: "loanm8.com",
  siteUrl: env("NEXT_PUBLIC_SITE_URL") ?? "https://loanm8.com",
  tagline: "Loan intelligence. Free for the people.",

  /** Legal operating entity. */
  entityLegalName: "Shapiro Home Loans LLC", // carried over — VERIFY
  entityTradeName: "LoanM8 Loan Intelligence", // carried over — VERIFY trade-name registration per state
  entityNmls: "[ENTITY NMLS #]",

  /**
   * The principal MLO. When `team.length > 0`, public copy switches to
   * "your licensed loan officer" and the About section renders as a team.
   */
  principalMlo: {
    name: "Jason Shapiro", // carried over — VERIFY
    firstName: "Jason", // carried over
    nmls: "1844143", // carried over — VERIFY on nmlsconsumeraccess.org
    title: "Mortgage Loan Originator",
    bioShort: "[BIO — two or three plain sentences. No years-in-business or volume claims unless verifiable.]",
    nmlsConsumerAccessUrl:
      "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/1844143", // carried over — VERIFY
  } satisfies Mlo,

  /** Additional MLOs. Empty at launch. Add records here as MLOs onboard. */
  team: [] as Mlo[],

  contactEmail: env("NEXT_PUBLIC_CONTACT_EMAIL") ?? "[EMAIL]",
  privacyEmail: "privacy@loanm8.com",

  /**
   * Show "N wholesale lenders" ONLY when this is a verified, current number.
   * null = never render a lender count anywhere.
   */
  lenderCountDisplay: null as number | null,

  /**
   * Gates every rate-display UI and every "live pricing" mention beyond
   * Principle 2 itself. Nothing on the site shows a rate while false.
   */
  liveRatesEnabled: false,

  states: [
    {
      slug: "washington",
      code: "WA",
      name: "Washington",
      serviceArea: "Western Washington",
      entityLicense: "[WA ENTITY LICENSE #]",
      mloLicense: "[WA MLO LICENSE #]",
      regulatorName: "[WA regulator name — e.g. Washington State Department of Financial Institutions]",
      regulatorUrl: "[WA regulator URL]",
      sponsor: SPONSOR_HOME_TRUST,
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      twoPartyConsent: true,
    },
    {
      slug: "arizona",
      code: "AZ",
      name: "Arizona",
      serviceArea: "Arizona",
      entityLicense: "[AZ ENTITY LICENSE #]",
      mloLicense: "[AZ MLO LICENSE #]",
      regulatorName: "[AZ regulator name — e.g. Arizona Department of Insurance and Financial Institutions]",
      regulatorUrl: "[AZ regulator URL]",
      sponsor: SPONSOR_HOME_FINANCIAL_AZ,
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      twoPartyConsent: false,
    },
    {
      slug: "california",
      code: "CA",
      name: "California",
      serviceArea: "California",
      entityLicense: "[CA ENTITY LICENSE #]",
      mloLicense: "[CA MLO LICENSE #]",
      regulatorName: "[CA regulator name — e.g. California Department of Financial Protection and Innovation]",
      regulatorUrl: "[CA regulator URL]",
      sponsor: SPONSOR_HOME_TRUST,
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel: CA licensing language]",
      twoPartyConsent: true,
    },
    {
      slug: "texas",
      code: "TX",
      name: "Texas",
      serviceArea: "Texas",
      entityLicense: "[TX ENTITY LICENSE #]",
      mloLicense: "[TX MLO LICENSE #]",
      regulatorName: "[TX regulator name — e.g. Texas Department of Savings and Mortgage Lending]",
      regulatorUrl: "[TX regulator URL]",
      sponsor: SPONSOR_HOME_TRUST,
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel: TX recovery-fund / complaint notice]",
      twoPartyConsent: false,
    },
  ] as StateConfig[],

  /**
   * Calendly links. Every consumer CTA on the site is one of these.
   * Empty string → the CTA renders as "coming soon" instead of a dead link.
   */
  calendly: {
    borrower: env("NEXT_PUBLIC_CALENDLY_BORROWER") ?? "",
    agent: env("NEXT_PUBLIC_CALENDLY_AGENT") ?? "",
    mlo: env("NEXT_PUBLIC_CALENDLY_MLO") ?? "",
    secondLook: env("NEXT_PUBLIC_CALENDLY_SECOND_LOOK") ?? "",
  },

  featureFlags: {
    /** Real Loan Estimate upload + AI decode. OFF until counsel + retention policy are set. */
    secondLookLiveUpload: env("SECOND_LOOK_LIVE") === "true",
    /** Public /chat talks to the Claude API. OFF until the M8 system prompt is reviewed. */
    chatLiveAi: false,
    /** Voice mode. OFF. */
    voice: false,
    /** /api/agent/* endpoints. */
    agentApi: true,
  },

  /** Data retention statement for Second Look uploads. Counsel confirms. */
  secondLookRetention: "[RETENTION — confirm with counsel]",

  /** "Built on Claude" label — factual, small, mono. No logos. */
  builtOn: "Built on Claude",

  /** Provenance defaults for content pages. */
  provenance: {
    author: "LoanM8 editorial",
    reviewedBy: "a licensed MLO",
    howMade: "AI-assisted draft, reviewed by a licensed MLO before publishing.",
  },
} as const;

/* ─── Derived helpers ───────────────────────────────────────── */

export type Config = typeof CONFIG;

export const STATES = CONFIG.states;

export function stateBySlug(slug: string): StateConfig | undefined {
  return STATES.find((s) => s.slug === slug);
}

export function stateByCode(code: string): StateConfig | undefined {
  return STATES.find((s) => s.code === code);
}

/** "Washington (serving Western Washington)" or just "Arizona". */
export function stateDisplay(s: StateConfig): string {
  return s.serviceArea && s.serviceArea !== s.name
    ? `${s.name} (serving ${s.serviceArea})`
    : s.name;
}

/** Short chip label: "Western WA", "AZ", "CA", "TX". */
export function stateChip(s: StateConfig): string {
  if (s.code === "WA") return "Western WA";
  return s.code;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** "Washington (serving Western Washington), Arizona, California, and Texas" */
export const LICENSED_IN_LINE = formatList(STATES.map(stateDisplay));

/** "Washington, Arizona, California, and Texas" */
export const STATE_NAMES_LINE = formatList(STATES.map((s) => s.name));

/** "WA · AZ · CA · TX" */
export const STATE_CODES_LINE = STATES.map((s) => s.code).join(" · ");

/** True when more than one MLO is configured. */
export const HAS_TEAM = CONFIG.team.length > 0;

/**
 * How copy refers to the closer. Principle 1 ("one loan officer, start to
 * close") holds per borrower; a single named person is only promised when
 * there is exactly one MLO.
 */
export const MLO_REF = HAS_TEAM ? "your licensed loan officer" : CONFIG.principalMlo.firstName;
export const MLO_REF_CAP = HAS_TEAM ? "Your licensed loan officer" : CONFIG.principalMlo.firstName;
export const MLO_REF_FULL = HAS_TEAM
  ? "a licensed loan officer"
  : `${CONFIG.principalMlo.name}, NMLS #${CONFIG.principalMlo.nmls}`;

/** All MLOs, principal first. */
export const ALL_MLOS: Mlo[] = [CONFIG.principalMlo, ...CONFIG.team];

/** The standard footer sentence — rendered on every page. Locked text. */
export const NOT_A_COMMITMENT =
  "This is not a commitment to lend. Rates, terms, and program availability subject to change. Approval subject to verification of income, assets, and credit.";

/** Calculator disclaimer — rendered on every calculator page and API response. */
export const CALC_DISCLAIMER =
  "Estimates for education only. Not a loan offer, rate quote, or commitment to lend. Enter your own rate; LoanM8 does not display rates on this page.";

/** Sample-data badge text. */
export const SAMPLE_LABEL = "SAMPLE — ILLUSTRATIVE ONLY";
export const SAMPLE_SENTENCE = "Sample — illustrative only, not an offer.";

/** AI disclosure — said before any interaction on every M8 surface. */
export const AI_DISCLOSURE = "I'm an AI, not a person.";

/** Not a credit pull — at every intake point. */
export const NOT_A_CREDIT_PULL = "This is not a credit pull.";

/** Whether a Calendly link is usable. */
export function hasBooking(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** Whether the value is still a bracketed placeholder. */
export function isPlaceholder(v: string | null | undefined): boolean {
  return !v || /^\[.*\]$/.test(v.trim());
}
