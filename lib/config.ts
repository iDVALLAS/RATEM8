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

/**
 * MLO_ROUTING (v17): "true" → on, "false" → off. Unset → on for Vercel
 * PREVIEW deployments only (owner 2026-10-01: "turn on MLO_ROUTING for
 * the preview"), off everywhere else, production included. middleware.ts
 * calls this with static process.env reads.
 */
export function mloRoutingOn(flag: string | undefined, vercelEnv: string | undefined): boolean {
  const v = flag?.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return vercelEnv === "preview";
}

const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

export type StateSlug = "washington" | "oregon" | "arizona" | "california" | "texas";
export type StateCode = "WA" | "OR" | "AZ" | "CA" | "TX";

export type Sponsor = { name: string; idLabel: string; idNumber: string };

/** The per-state facts typed into CONFIG.states. */
export type StateBase = {
  slug: StateSlug;
  code: StateCode;
  name: string;
  /** Where LoanM8 actually serves borrowers in this state. */
  serviceArea: string;
  /** Entity-level license identifier for this state. */
  entityLicense: string;
  /** Regulator display name. */
  regulatorName: string;
  /** Regulator URL (consumer complaint / license lookup). */
  regulatorUrl: string;
  /**
   * Any state-mandated disclosure language. Rendered verbatim on the
   * state page and /disclosures when non-empty. Counsel fills this in.
   */
  requiredDisclosure: string;
  /** Two-party recording consent state (affects chat/voice consent copy). */
  twoPartyConsent: boolean;
};

/**
 * A state as consumers see it: the typed facts plus what is DERIVED from
 * the MLO registry (v15, Patch B). Sponsorship lives on each MLO's
 * per-state license, so a sponsor change is one edit in MLO_REGISTRY.
 */
export type StateConfig = StateBase & {
  /** Sponsoring entity of the MLO assigned to this state (or the first serving MLO). */
  sponsor: Sponsor;
  /** Every sponsoring entity with an MLO serving this state. */
  sponsors: Sponsor[];
  /** Individual MLO license number(s) for this state, from the registry. */
  mloLicense: string;
};

/**
 * One state license held by an MLO. Sponsorship is per MLO, per state,
 * and changes often: edit `sponsor` and `sponsorSince` here (or ask the
 * agent to). Routing re-derives everything from this list.
 */
export type MloLicense = {
  state: StateCode;
  /** Individual license number for this state (NMLS-issued states may reuse the NMLS ID). */
  license: string;
  /** The brokerage that sponsors this MLO's license in this state. */
  sponsor: Sponsor;
  /** When the current sponsorship took effect (ISO date) or a placeholder. */
  sponsorSince: string;
};

export type Mlo = {
  /** Stable, neutral id used by routing and the borrower's choice cookie (never a name). */
  id: string;
  name: string;
  firstName: string;
  nmls: string;
  title: string;
  bioShort: string;
  /** Link to the MLO's NMLS Consumer Access record. */
  nmlsConsumerAccessUrl: string;
  /** Headshot path under /public, or a placeholder (not rendered while bracketed). */
  photo: string;
  /** Borrower booking link. Empty → "coming soon". */
  calendly: string;
  licenses: MloLicense[];
};

const SPONSOR_HOME_TRUST: Sponsor = {
  name: "Home Trust Loans",
  idLabel: "NMLS",
  idNumber: "1761573", // carried over — VERIFY on nmlsconsumeraccess.org
};

const SPONSOR_HOME_FINANCIAL_AZ: Sponsor = {
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
   * The platform operator's MLO (LoanM8 is owned by this loan officer).
   * Routing's "same sponsoring entity" rule compares every MLO against the
   * sponsors this record holds. Also the first entry in ALL_MLOS.
   */
  principalMlo: {
    id: "mlo-001",
    name: "Jason Shapiro", // carried over — VERIFY
    firstName: "Jason", // carried over
    nmls: "1844143", // carried over — VERIFY on nmlsconsumeraccess.org
    title: "Mortgage Loan Originator",
    bioShort: "[BIO — two or three plain sentences. No years-in-business or volume claims unless verifiable.]",
    nmlsConsumerAccessUrl:
      "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/1844143", // carried over — VERIFY
    photo: "[PHOTO]",
    calendly: env("NEXT_PUBLIC_CALENDLY_BORROWER") ?? "",
    licenses: [
      { state: "WA", license: "[WA MLO LICENSE #]", sponsor: SPONSOR_HOME_TRUST, sponsorSince: "[SPONSOR EFFECTIVE DATE]" },
      { state: "AZ", license: "[AZ MLO LICENSE #]", sponsor: SPONSOR_HOME_FINANCIAL_AZ, sponsorSince: "[SPONSOR EFFECTIVE DATE]" },
      { state: "CA", license: "[CA MLO LICENSE #]", sponsor: SPONSOR_HOME_TRUST, sponsorSince: "[SPONSOR EFFECTIVE DATE]" },
      { state: "TX", license: "[TX MLO LICENSE #]", sponsor: SPONSOR_HOME_TRUST, sponsorSince: "[SPONSOR EFFECTIVE DATE]" },
    ],
  } satisfies Mlo,

  /** Additional MLOs. Add records here as MLOs onboard (v15: Ryder Fasse, Oregon). */
  team: [
    {
      id: "mlo-002",
      name: "Ryder Fasse", // owner-supplied 2026-10-01 — VERIFY
      firstName: "Ryder",
      nmls: "119822", // owner-supplied — VERIFY on nmlsconsumeraccess.org
      title: "Mortgage Loan Originator",
      bioShort: "[BIO — two or three plain sentences. No years-in-business or volume claims unless verifiable.]",
      nmlsConsumerAccessUrl: "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/119822", // VERIFY
      photo: "[PHOTO]",
      calendly: env("NEXT_PUBLIC_CALENDLY_RYDER") ?? "",
      licenses: [
        // Owner 2026-10-01: Oregon only on this site (his NMLS record also
        // lists WA and AZ licenses; the owner is the site's WA loan officer).
        // NMLS Consumer Access (owner screenshot 2026-10-01): Oregon MLO
        // license, "Lic/Reg #: None" (Oregon uses the NMLS ID), Approved,
        // renewed through 2026; authorized to represent NMLS 1761573 since
        // 08/06/2021.
        { state: "OR", license: "NMLS ID 119822", sponsor: SPONSOR_HOME_TRUST, sponsorSince: "2021-08-06" },
      ],
    },
  ] as Mlo[],

  /**
   * State routing (v15, Patch B). Behind MLO_ROUTING (default OFF).
   * - stateAssignments: which MLO an `assign` state routes to.
   * - routingModeOverride: force a state to `choose`. Forcing `assign` on a
   *   state that must be `choose` fails the build (lib/routing.ts).
   * A state is `assign` only when every MLO serving it is sponsored by one
   * of the operator's sponsoring companies; otherwise it is `choose`.
   */
  routing: {
    operatorMloId: "mlo-001",
    stateAssignments: {
      WA: "mlo-001",
      OR: "mlo-002",
      AZ: "mlo-001",
      CA: "mlo-001",
      TX: "mlo-001",
    } as Partial<Record<StateCode, string>>,
    routingModeOverride: {} as Partial<Record<StateCode, "assign" | "choose">>,
  },

  contactEmail: env("NEXT_PUBLIC_CONTACT_EMAIL") ?? "[EMAIL]",
  privacyEmail: "privacy@loanm8.com",
  /** Where testers ask for the /demo password (shown on the gate). */
  demoContactEmail: env("NEXT_PUBLIC_DEMO_CONTACT_EMAIL") ?? "info@loanm8.com",

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
      regulatorName: "[WA regulator name — e.g. Washington State Department of Financial Institutions]",
      regulatorUrl: "[WA regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      twoPartyConsent: true,
    },
    {
      slug: "oregon",
      code: "OR",
      name: "Oregon",
      serviceArea: "Oregon",
      entityLicense: "[OR ENTITY LICENSE #]",
      regulatorName: "[OR regulator name — e.g. Oregon Division of Financial Regulation]",
      regulatorUrl: "[OR regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      // Recording consent: counsel to confirm for phone/online chat (ORS 165.540).
      twoPartyConsent: false,
    },
    {
      slug: "arizona",
      code: "AZ",
      name: "Arizona",
      serviceArea: "Arizona",
      entityLicense: "[AZ ENTITY LICENSE #]",
      regulatorName: "[AZ regulator name — e.g. Arizona Department of Insurance and Financial Institutions]",
      regulatorUrl: "[AZ regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      twoPartyConsent: false,
    },
    {
      slug: "california",
      code: "CA",
      name: "California",
      serviceArea: "California",
      entityLicense: "[CA ENTITY LICENSE #]",
      regulatorName: "[CA regulator name — e.g. California Department of Financial Protection and Innovation]",
      regulatorUrl: "[CA regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel: CA licensing language]",
      twoPartyConsent: true,
    },
    {
      slug: "texas",
      code: "TX",
      name: "Texas",
      serviceArea: "Texas",
      entityLicense: "[TX ENTITY LICENSE #]",
      regulatorName: "[TX regulator name — e.g. Texas Department of Savings and Mortgage Lending]",
      regulatorUrl: "[TX regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel: TX recovery-fund / complaint notice]",
      twoPartyConsent: false,
    },
  ] as StateBase[],

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
    mloRouting: mloRoutingOn(env("MLO_ROUTING"), env("VERCEL_ENV")),
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

/** All MLOs, principal (the operator) first. */
export const ALL_MLOS: Mlo[] = [CONFIG.principalMlo, ...CONFIG.team];

export function mloById(id: string | null | undefined): Mlo | undefined {
  return id ? ALL_MLOS.find((m) => m.id === id) : undefined;
}

/** The MLOs holding a license in this state. */
export function mlosServing(code: string): Mlo[] {
  return ALL_MLOS.filter((m) => m.licenses.some((l) => l.state === code));
}

export function licenseIn(m: Mlo, code: string): MloLicense | undefined {
  return m.licenses.find((l) => l.state === code);
}

const sponsorKey = (sp: Sponsor) => `${sp.name}|${sp.idNumber}`;

function deriveState(base: StateBase): StateConfig {
  const serving = mlosServing(base.code);
  const assigned = mloById(CONFIG.routing.stateAssignments[base.code]);
  const ordered = assigned ? [assigned, ...serving.filter((m) => m.id !== assigned.id)] : serving;
  const lic = ordered.map((m) => licenseIn(m, base.code)!).filter(Boolean);
  const seen = new Set<string>();
  const sponsors = lic.map((l) => l.sponsor).filter((sp) => (seen.has(sponsorKey(sp)) ? false : (seen.add(sponsorKey(sp)), true)));
  return {
    ...base,
    sponsor: sponsors[0] ?? { name: "[SPONSOR]", idLabel: "NMLS", idNumber: "[#]" },
    sponsors,
    mloLicense: lic.length ? lic.map((l) => l.license).join(", ") : "[NO MLO LICENSED]",
  };
}

/** Every licensed state, with sponsors and MLO licenses derived from the registry. */
export const STATES: StateConfig[] = CONFIG.states.map(deriveState);

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

/** "WA · OR · AZ · CA · TX" */
export const STATE_CODES_LINE = STATES.map((s) => s.code).join(" · ");

/** "WA, OR, AZ, CA, and TX" */
export const STATE_CODES_LIST = formatList(STATES.map((s) => s.code));

/** "Five" — the licensed-state count as a capitalised word (for headings). */
export const STATE_COUNT_WORD =
  ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"][STATES.length] ?? String(STATES.length);

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
