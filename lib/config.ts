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
 * C2: every licensing fact (platform, sponsor, sponsor state licenses,
 * MLO names and NMLS numbers, which MLO each state routes to) now comes
 * from config/licensing.ts. This file derives its records from there.
 */

import { PLATFORM, SPONSOR, SPONSOR_DISPLAY_NAME, MLOS, STATE_MLO, DEFAULT_MLO, TX_COMPLAINT_NOTICE, type SponsorStateCode } from "@/config/licensing";

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
  /**
   * The MLO's own secure application (POS / 1003) link, e.g. their ARIVE
   * borrower portal (v18). Only an https URL renders "Start your
   * application"; a placeholder hides it. Never falls back to another MLO.
   * Editable in the MLO backend once logins exist.
   */
  applicationUrl: string;
  licenses: MloLicense[];
};

/**
 * C2: the one sponsoring company (config/licensing.ts SPONSOR). Every MLO
 * license on this site is under it, so every state is an `assign` state.
 */
const SPONSOR_RECORD: Sponsor = {
  name: SPONSOR_DISPLAY_NAME,
  idLabel: "NMLS",
  idNumber: SPONSOR.nmls,
};

/** The sponsor shown with the LoanM8 name on the coming-soon page (Texas team-name rule). */
export const COMING_SOON_SPONSOR = { dba: SPONSOR.dba, nmls: SPONSOR.nmls } as const;

/**
 * An MLO's license identifier in a state: the state-issued number when
 * config/licensing.ts lists one (CA-DFPI), otherwise the NMLS ID.
 */
function mloLicenseIn(key: keyof typeof MLOS, state: StateCode): string {
  const m = MLOS[key];
  const own = "stateLicenses" in m ? (m.stateLicenses as Partial<Record<StateCode, string>>)[state] : undefined;
  return own ?? `NMLS ID ${m.nmls}`;
}

/** The MLO key each state routes to (STATE_MLO, else DEFAULT_MLO). */
function mloKeyFor(state: StateCode): keyof typeof MLOS {
  return STATE_MLO[state] ?? DEFAULT_MLO;
}

const MLO_IDS: Record<keyof typeof MLOS, string> = { jason: "mlo-001", ryder: "mlo-002" };

/** The states each MLO serves, from the routing map: everything else is the default MLO's. */
const SERVED: StateCode[] = ["WA", "OR", "AZ", "CA", "TX"];
function licensesFor(key: keyof typeof MLOS): MloLicense[] {
  return SERVED.filter((st) => mloKeyFor(st) === key).map((st) => ({
    state: st,
    license: mloLicenseIn(key, st),
    sponsor: SPONSOR_RECORD,
    sponsorSince: key === "ryder" && st === "OR" ? "2021-08-06" : "[SPONSOR EFFECTIVE DATE]",
  }));
}

/** First name for copy templates ({first}); the full name stays in config/licensing.ts. */
const firstOf = (name: string) => name.split(/\s+/)[0]!;

/** Sponsor state-license facts as the state records show them. */
function sponsorLicense(code: SponsorStateCode) {
  const l = SPONSOR.stateLicenses[code];
  return { entityLicense: `${l.type} #${l.id}`, regulatorName: l.regulator };
}

export const CONFIG = {
  brandName: "LoanM8",
  brandSubname: "Loan Intelligence",
  domain: "loanm8.com",
  siteUrl: env("NEXT_PUBLIC_SITE_URL") ?? "https://loanm8.com",
  tagline: "Loan intelligence. Free for the people.",

  /** Legal operating entity. */
  /** C2: the platform. It holds no NMLS license; loans are originated under the sponsor's. */
  entityLegalName: PLATFORM.legalName,
  entityTradeName: PLATFORM.tradeName,
  /** C2: the originating company (config/licensing.ts SPONSOR). */
  sponsor: SPONSOR,
  sponsorDisplayName: SPONSOR_DISPLAY_NAME,

  /**
   * The platform operator's MLO (LoanM8 is owned by this loan officer).
   * Routing's "same sponsoring entity" rule compares every MLO against the
   * sponsors this record holds. Also the first entry in ALL_MLOS.
   */
  principalMlo: {
    id: "mlo-001",
    name: MLOS.jason.name,
    firstName: firstOf(MLOS.jason.name),
    nmls: MLOS.jason.nmls,
    title: "Mortgage Loan Originator",
    bioShort: "[BIO — two or three plain sentences. No years-in-business or volume claims unless verifiable.]",
    nmlsConsumerAccessUrl:
      `https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/${MLOS.jason.nmls}`,
    // C1 (owner-supplied headshot, 2026-11-01): 512×512, transparent corners.
    photo: MLOS.jason.photo,
    calendly: env("NEXT_PUBLIC_CALENDLY_BORROWER") ?? "",
    applicationUrl: env("APPLICATION_URL_MLO_001") ?? "[APPLICATION URL — POS / 1003 link]",
    licenses: licensesFor("jason"),
  } satisfies Mlo,

  /** Additional MLOs. Add records here as MLOs onboard (v15: Ryder Fasse, Oregon). */
  team: [
    {
      id: "mlo-002",
      name: MLOS.ryder.name,
      firstName: firstOf(MLOS.ryder.name),
      nmls: MLOS.ryder.nmls,
      title: "Mortgage Loan Originator",
      bioShort: "[BIO — two or three plain sentences. No years-in-business or volume claims unless verifiable.]",
      nmlsConsumerAccessUrl: `https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/${MLOS.ryder.nmls}`,
      // Listed before the file exists: MloAvatar falls back to initials until it does.
      photo: MLOS.ryder.photo,
      calendly: env("NEXT_PUBLIC_CALENDLY_RYDER") ?? "",
      applicationUrl: env("APPLICATION_URL_MLO_002") ?? "[APPLICATION URL — POS / 1003 link]",
      // Owner 2026-10-01: Oregon only on this site. NMLS Consumer Access
      // (owner screenshot 2026-10-01): Oregon MLO license under his NMLS ID,
      // authorized to represent the sponsor since 08/06/2021.
      licenses: licensesFor("ryder"),
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
    /** C2: from config/licensing.ts STATE_MLO (Oregon → Ryder, everything else → the default MLO). */
    stateAssignments: Object.fromEntries(SERVED.map((st) => [st, MLO_IDS[mloKeyFor(st)]])) as Partial<Record<StateCode, string>>,
    routingModeOverride: {} as Partial<Record<StateCode, "assign" | "choose">>,
    /**
     * v29 (owner 2026-10-14): when no state can be resolved (no property
     * cookie, no choice, no usable Vercel geo header, or a missing/garbled
     * routing header), route as if the visitor were here, so the match bar
     * still renders. Marked source "default" and shown as "(default)".
     * Must be an `assign` state (validateRouting). null = ask instead.
     */
    fallbackState: "WA" as StateCode | null,
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
   * Lender counts (v21, owner 2026-10-10). Copy never states a fixed panel
   * size: it says "Up to {lenderCountMax} lenders". No option set renders
   * with fewer than `lenderCountMin` lenders, and "N more lenders shopped"
   * renders only when a scenario carries its own real shopped count.
   * NOTE: lib/pricing/lenders.ts lists the operator's lenders; keep
   * lenderCountMax no higher than the panel actually on file.
   */
  lenderCountMax: 14,
  lenderCountMin: 3,

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
      // C2: the sponsor's WA license and regulator (config/licensing.ts).
      ...sponsorLicense("WA"),
      regulatorUrl: "[WA regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      twoPartyConsent: true,
    },
    {
      slug: "oregon",
      code: "OR",
      name: "Oregon",
      serviceArea: "Oregon",
      // C2: the sponsor's OR license and regulator (config/licensing.ts).
      ...sponsorLicense("OR"),
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
      // C2: the sponsor's AZ license and regulator (config/licensing.ts).
      ...sponsorLicense("AZ"),
      regulatorUrl: "[AZ regulator URL]",
      requiredDisclosure: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
      twoPartyConsent: false,
    },
    {
      slug: "california",
      code: "CA",
      name: "California",
      serviceArea: "California",
      // C2: the sponsor's CA license and regulator (config/licensing.ts).
      ...sponsorLicense("CA"),
      regulatorUrl: "[CA regulator URL]",
      // C2: the CA licensing language from the owner's footer text.
      requiredDisclosure: `Licensed by the ${SPONSOR.stateLicenses.CA.regulator} under the California Financing Law, License #${SPONSOR.stateLicenses.CA.id}.`,
      twoPartyConsent: true,
    },
    {
      slug: "texas",
      code: "TX",
      name: "Texas",
      serviceArea: "Texas",
      // C2: the sponsor's TX license and regulator (config/licensing.ts).
      ...sponsorLicense("TX"),
      regulatorUrl: "[TX regulator URL]",
      // C2: the current SML complaint notice for mortgage companies (7 TAC §56.200(c)).
      requiredDisclosure: TX_COMPLAINT_NOTICE.text,
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
    /**
     * C1 (owner 2026-11-01, counsel approved): the live M8 chat is the
     * public chat at /chat, open to everyone. M8_LIVE_CHAT="false" is the
     * kill switch (no redeploy of code needed, only of the env). It also
     * needs ANTHROPIC_API_KEY; without it /api/m8-chat fails closed (503).
     */
    liveChat: env("M8_LIVE_CHAT") !== "false",
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
    /**
     * v19 (Round 3, Item 3b): the dated example-vs-benchmark comparison
     * (components/pricing/RateVsAverage.tsx). OFF unless
     * SHOW_NATIONAL_AVG_COMPARISON is exactly "true", and pending counsel
     * review of every surface listed in the v19 patch log entry.
     *
     * The benchmark is entered by hand from the published release for the
     * SAME week as `examplesAsOf` and the same product as the scenario.
     * Bracketed placeholders render nothing (lib/pricing/benchmark.ts);
     * never fill them from memory or another source.
     */
    benchmarkComparison: {
      enabled: env("SHOW_NATIONAL_AVG_COMPARISON") === "true",
      /** The example scenario compared (purchase, 80% LTV, 30-year fixed). */
      scenarioId: "wa-first-purchase",
      /** Which of the three anti-steering options is the example's side. */
      option: "lowestRateWithoutRiskyFeatures" as const,
      benchmark: {
        source: "Freddie Mac Primary Mortgage Market Survey (PMMS)",
        sourceUrl: "https://www.freddiemac.com/pmms",
        product: "30yr_fixed" as const,
        productLabel: "30-year fixed",
        weekOf: "[PMMS WEEK — release date, YYYY-MM-DD, same week as examplesAsOf]",
        rate: "[PMMS 30-YEAR FIXED AVERAGE RATE — percent]",
        feesAndPoints: "[PMMS 30-YEAR FIXED AVERAGE FEES AND POINTS — percent of loan]",
        basis: "[PMMS BASIS — quote the release's stated assumptions]",
      },
    },
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
/**
 * v21 (owner 2026-10-10, attorney-cleared for the demo and /sample-brief):
 * the persistent label on every rate card that shows illustrative pricing.
 */
export const EXAMPLE_PRICING_LABEL = "Example — illustrative pricing, not an offer";

/** AI disclosure — said before any interaction on every M8 surface. */
export const AI_DISCLOSURE = "I'm an AI, not a person.";

/** Not a credit pull — at every intake point. */
export const NOT_A_CREDIT_PULL = "This is not a credit pull.";

/** Whether an MLO's application link is a real https URL (placeholders hide the button). */
export function hasApplicationUrl(m: Pick<Mlo, "applicationUrl"> | null | undefined): boolean {
  return !!m && /^https:\/\/[^\s\[\]]+$/.test(m.applicationUrl.trim());
}

/** Whether a Calendly link is usable. */
export function hasBooking(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** Whether the value is still a bracketed placeholder. */
export function isPlaceholder(v: string | null | undefined): boolean {
  return !v || /^\[.*\]$/.test(v.trim());
}
