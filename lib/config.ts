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
  /** Where testers ask for the /demo password (shown on the gate). */
  demoContactEmail: env("NEXT_PUBLIC_DEMO_CONTACT_EMAIL") ?? "jason@ratem8.com",

  /**
   * Where the /investors "Reach out" button goes. A mailto today; swap in
   * a booking link (any https URL) without touching the page.
   */
  investorContactHref: env("NEXT_PUBLIC_INVESTOR_CONTACT_HREF") ?? "mailto:investors@loanm8.com",

  /** Public license lookup (for generic "verify a license" links). */
  nmlsConsumerAccessHome: "https://www.nmlsconsumeraccess.org/",

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
      serviceArea: "Washington",
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

  /**
   * Pricing display (Patch A, manual path). Server-side env vars only.
   * - demoExamples: counsel-approved example pricing; ON unless set "false".
   * - manual: show the latest manual snapshot (pulled by a licensed person
   *   in the sponsoring brokerage's pricing engine) when one is fresh.
   * - live / ratesheet / mloRouting: OFF. No surface may say "live" while
   *   `live` is false.
   */
  pricing: {
    demoExamples: env("PRICING_DEMO_EXAMPLES") !== "false",
    manual: env("PRICING_MANUAL") === "true",
    live: env("PRICING_LIVE") === "true",
    ratesheet: env("PRICING_RATESHEET") === "true",
    mloRouting: env("MLO_ROUTING") === "true",
    /** The date printed on example pricing. Update with the fixtures. */
    examplesAsOf: "2026-10-01",
    /** A manual snapshot older than this many hours is never shown. */
    manualStaleHours: Number(env("PRICING_MANUAL_STALE_HOURS") ?? 24),
  },

  /**
   * MLO recruiting scope. LoanM8 vets licensed originators in every state
   * (ahead of expansion), one originator per service area. Borrower work
   * happens only where LoanM8 is licensed (`states` above).
   */
  recruiting: {
    nationwide: true,
    oneOriginatorPerArea: true,
  },

  /** Data retention statement for Second Look uploads. Counsel confirms. */
  secondLookRetention: "[RETENTION — confirm with counsel]",

  /**
   * The one-line description of the AI, rendered in the footer, on
   * /disclosures, and in the tester preview. Replaces the earlier
   * "Built on Claude" label at the owner's request. Vendor disclosure
   * (Anthropic Claude API) stays on /privacy as a factual vendor entry.
   */
  aiLine: "AI built for mortgages, not borrowed from a chatbot.",

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

/** "Washington (serving <area>)" when the service area is narrower than the state, else just "Arizona". */
export function stateDisplay(s: StateConfig): string {
  return s.serviceArea && s.serviceArea !== s.name
    ? `${s.name} (serving ${s.serviceArea})`
    : s.name;
}

/** Short chip label: "WA", "AZ", "CA", "TX". */
export function stateChip(s: StateConfig): string {
  return s.code;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** "Washington, Arizona, California, and Texas" (with "(serving …)" for any narrower service area) */
export const LICENSED_IN_LINE = formatList(STATES.map(stateDisplay));

/** "Washington, Arizona, California, and Texas" */
export const STATE_NAMES_LINE = formatList(STATES.map((s) => s.name));

/** "WA · AZ · CA · TX" */
export const STATE_CODES_LINE = STATES.map((s) => s.code).join(" · ");

/** True when more than one MLO is configured. */
export const HAS_TEAM = CONFIG.team.length > 0;

/**
 * How copy refers to the closer. Always generic since v14 (Edit 6): an
 * individual is named only for a matched visitor, client-side, through
 * MloContext (lib/mlo-match.ts), with their NMLS number on the same page.
 */
export const MLO_REF = "your licensed loan officer";
export const MLO_REF_CAP = "Your licensed loan officer";
export const MLO_REF_FULL = "a licensed, vetted loan officer";

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
