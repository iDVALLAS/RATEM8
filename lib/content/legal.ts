/**
 * lib/content/legal.ts — long-form content for /privacy, /terms, and
 * /disclosures.
 *
 * Every FACT (entity names, emails, states, retention, feature flags)
 * is read from lib/config.ts. Nothing here is final legal language:
 * each counsel-dependent block is rendered inside <CounselReview>, and
 * its `note` says what counsel must decide. Bracketed values are
 * pre-launch placeholders listed in PLACEHOLDERS.md.
 */

import { CONFIG, STATES, stateByCode, AI_DISCLOSURE, CALC_DISCLAIMER, type StateCode } from "@/lib/config";
import { copy } from "@/lib/copy";

const flags = CONFIG.featureFlags;

/** Names of the two-party recording-consent states, from config. */
export const TWO_PARTY_STATE_NAMES = STATES.filter((s) => s.twoPartyConsent).map((s) => s.name);

/** Shared status pill under each h1. */
export const LEGAL_STATUS = "draft · pending counsel review";

/* ───────────────────────── /privacy ───────────────────────── */

export const privacyContent = {
  path: "/privacy",
  crumbName: "Privacy",
  eyebrow: "// privacy",
  title: "Privacy",
  metaTitle: "Privacy",
  metaDescription: "What LoanM8 collects, how it is used, who it is shared with (never sold), how long it is kept, and how to export or delete it.",
  intro: copy.privacy.intro,

  sections: [
    { id: "summary", title: "Summary" },
    { id: "collect", title: "Data we collect" },
    { id: "use", title: "How we use it" },
    { id: "sharing", title: "Sharing" },
    { id: "vendors", title: "Vendors" },
    { id: "retention", title: "Retention" },
    { id: "rights", title: "Your rights" },
    { id: "ai", title: "AI disclosure" },
    { id: "recording", title: "Recording" },
    { id: "state-notices", title: "State notices" },
    { id: "children", title: "Children" },
    { id: "changes", title: "Changes" },
    { id: "contact", title: "Contact" },
  ],

  summary: {
    note: "Summary carried over from the v1 statement. Confirm each point matches launch behavior; the credit-pull point applies only after a borrower chooses to apply.",
    points: copy.privacy.points,
  },

  collect: {
    lead: "This page describes what the site does today, not what a full platform might do later. Each item below names where the data goes.",
    items: [
      {
        label: "Visiting the site",
        body: "LoanM8 sets no cookies for tracking. Hosting analytics (Vercel Analytics) records page-level usage in aggregate; we do not see who you are. Your theme choice (Night, Dim, or Paper) is stored in your browser's local storage and is never sent to us.",
      },
      {
        label: "Booking a call",
        body: "Booking runs on Calendly, a third-party scheduling vendor. Whatever you type into the booking form (name, email, notes) is collected by Calendly under its own privacy policy and shared with us so we can hold the call.",
      },
      {
        label: "Second Look sample",
        body: "The sample walkthrough uses a fictional Loan Estimate. Nothing is uploaded and nothing about you is collected.",
      },
      {
        label: "Second Look live upload",
        status: flags.secondLookLiveUpload ? "currently on" : "currently off",
        body: `A real-document upload exists behind a feature flag. When it is on, redaction happens in your browser before anything is sent, so only the masked document data reaches us. Retention: ${CONFIG.secondLookRetention}.`,
      },
      {
        label: "Chat and voice",
        status: flags.chatLiveAi || flags.voice ? "currently on" : "not live",
        body: "Chat is a scripted demo today and stores nothing. Voice is off. When live chat opens, transcripts may be recorded for compliance review; see Recording below.",
      },
      {
        label: "Email",
        body: "If you email us, we keep the message so we can answer it.",
      },
    ],
    counselNote: "Confirm the live-upload and chat descriptions before either flag is turned on.",
  },

  use: {
    items: [
      "To run the site and keep it working.",
      "To hold the call you booked and prepare for it.",
      "To explain a document you chose to upload, once that feature is on.",
      "To keep the records a licensed mortgage business is required to keep.",
    ],
    never: "We do not use your data for advertising, and we do not build profiles of visitors.",
  },

  sharing: {
    lead: "We do not sell your data. We do not sell leads. We do not share your data with third-party marketers.",
    items: [
      "Service vendors that host the site, schedule calls, or run AI features, listed below, and only for that purpose.",
      "When you choose to apply, the sponsoring entity that originates loans in your state receives your application. See Disclosures for which entity that is.",
      "When the law requires it, or to protect the rights and safety of borrowers and the business.",
    ],
    counselNote: "Confirm the sponsor-sharing sentence and the legal-process sentence.",
  },

  vendors: {
    lead: "Factual list of the vendors the site uses today. No logos, no endorsements.",
    items: [
      { name: "Vercel", role: "Hosting and aggregate analytics." },
      { name: "Calendly", role: "Scheduling. Collects what you enter when you book." },
      { name: "Anthropic (Claude API)", role: "Powers AI features when they are enabled. Chat and live upload are off today." },
    ],
  },

  retention: {
    lead: "How long each kind of data is kept. Bracketed values are placeholders until counsel sets the retention schedule.",
    items: [
      { label: "Analytics", value: "Aggregate only; held by Vercel under its retention policy." },
      { label: "Booking details", value: "Held by Calendly under its policy; our copy kept for the life of the relationship." },
      { label: "Second Look uploads", value: CONFIG.secondLookRetention },
      { label: "Chat transcripts", value: CONFIG.secondLookRetention },
      { label: "Email", value: "[RETENTION — confirm with counsel]" },
    ],
    counselNote: "Set each retention period. Mortgage record-keeping rules may set minimums.",
  },

  rights: {
    lead: "You can ask for any of these by email. We reply from a human, not a bot.",
    items: [
      { label: "Access", value: "See what we hold about you." },
      { label: "Export", value: "Get a copy in a readable format." },
      { label: "Delete", value: "Have it deleted, except records the law requires us to keep." },
    ],
    email: CONFIG.privacyEmail,
    counselNote: "Confirm the rights list, the exceptions, and the response window.",
  },

  ai: {
    line: AI_DISCLOSURE,
    body: "M8 is an AI. It explains, drafts, and organizes. A licensed loan officer verifies every deal and makes every decision that matters. M8 does not give advice of record and does not decide whether you qualify.",
  },

  recording: {
    body: "When live chat or voice is on, conversations may be recorded and stored for compliance review. You can ask for a transcript at any time. Each of those surfaces asks for consent before the first message.",
    twoPartyLead: "Two-party consent states we serve:",
    twoPartyStates: TWO_PARTY_STATE_NAMES,
    twoPartyBody: "In these states, continuing past the consent screen means every party to the conversation has agreed to the recording.",
    counselNote: "Confirm the consent flow and wording per state before chat or voice goes live.",
  },

  stateNotices: {
    lead: "Some states require specific privacy notices. Counsel drops the applicable text into each block below. Nothing here is final.",
    order: ["CA", "TX", "WA", "AZ"] as StateCode[],
    notices: {
      CA: {
        note: "California privacy rights notice. Confirm which California consumer-privacy and financial-privacy notices apply to LoanM8 and insert them here.",
        placeholder: "California residents may have rights to know, delete, and limit the use of their personal information under California privacy law. The applicable notice will appear here.",
      },
      TX: {
        note: "Texas privacy notice. Confirm which Texas consumer-privacy requirements apply and whether any Texas mortgage complaint notice belongs on this page as well as on Disclosures.",
        placeholder: "Texas residents may have rights under Texas privacy law. The applicable notice will appear here.",
      },
      WA: {
        note: "Washington privacy notice. Confirm which Washington privacy laws apply to LoanM8 and insert the required notice.",
        placeholder: "Washington residents may have rights under Washington privacy law. The applicable notice will appear here.",
      },
      AZ: {
        note: "Arizona privacy notice. Confirm whether an Arizona-specific notice is required.",
        placeholder: "Arizona residents may have rights under Arizona privacy law. The applicable notice will appear here.",
      },
    } as Record<StateCode, { note: string; placeholder: string }>,
    federalNote: "Confirm whether a federal financial-privacy notice is required once applications are taken, and where it is delivered.",
    federalPlaceholder: "A federal financial-privacy notice may be required when you apply for a loan. If so, it will be provided at that time.",
  },

  children: {
    body: "This site is not directed to anyone under 18, and we do not knowingly collect data from anyone under 18. If you believe a minor has sent us data, email us and we will delete it.",
  },

  changes: {
    body: "When this page changes, the date at the bottom changes with it. Material changes will be called out at the top of the page.",
  },

  contact: {
    privacyLabel: "Privacy requests",
    privacyEmail: CONFIG.privacyEmail,
    generalLabel: "Everything else",
    generalEmail: CONFIG.contactEmail,
    entity: `${CONFIG.entityTradeName}, a trade name of ${CONFIG.entityLegalName}`,
  },
} as const;

/* ───────────────────────── /terms ───────────────────────── */

export type TermsSection = {
  id: string;
  title: string;
  /** What counsel must decide for this block. */
  note: string;
  /** Placeholder paragraphs. Drafts, not final. */
  paragraphs: string[];
  /** Optional in-page link rendered after the paragraphs. */
  link?: { href: string; label: string };
};

export const termsContent = {
  path: "/terms",
  crumbName: "Terms",
  eyebrow: "// terms",
  title: "Terms of use",
  metaTitle: "Terms of use",
  metaDescription: "Terms of use for the LoanM8 website: what the service is and is not, that M8 is an AI, that calculators are educational, and the states LoanM8 serves.",
  intro: "This is a skeleton. Every section is a placeholder header with draft language for counsel to replace. Nothing on this page is in force until counsel signs off and this notice is removed.",

  sections: [
    {
      id: "acceptance",
      title: "Acceptance",
      note: "Confirm the acceptance mechanism (use of the site) and whether a separate agreement governs booked calls or applications.",
      paragraphs: ["By using this site you agree to these terms. If you do not agree, do not use the site."],
    },
    {
      id: "what-loanm8-is",
      title: "What LoanM8 is",
      note: "Confirm the service description and the relationship between the trade name, the legal entity, and the sponsoring entities.",
      paragraphs: [
        `${CONFIG.entityTradeName} is an information and rate-shopping service operated by ${CONFIG.entityLegalName}. It explains mortgage documents, runs educational calculators, and connects you with a licensed loan officer.`,
        "Nothing on this site is a commitment to lend, a loan offer, or a rate quote.",
      ],
    },
    {
      id: "m8-is-an-ai",
      title: "M8 is an AI",
      note: "Confirm the AI-disclosure language and the advice-of-record disclaimer.",
      paragraphs: [
        `${AI_DISCLOSURE} M8 explains and organizes. It does not give advice of record, does not decide whether you qualify, and does not originate loans. A licensed human loan officer verifies every deal.`,
      ],
    },
    {
      id: "calculators",
      title: "Calculators are educational",
      note: "Confirm the calculator disclaimer wording (locked text from config) and whether an additional accuracy disclaimer is needed.",
      paragraphs: [CALC_DISCLAIMER, "Results depend entirely on the numbers you enter. Check them against your own Loan Estimate."],
    },
    {
      id: "no-offers",
      title: "No offers or quotes online",
      note: "Confirm that no page of the site can be read as an offer, quote, or pre-qualification.",
      paragraphs: [
        "This site displays no interest rates and makes no offers. Any figure you see in a demo is a labeled sample. Pricing, eligibility, and terms are discussed only with a licensed loan officer, and only after verification.",
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility and licensed states",
      note: "Confirm the licensed-state list against active licenses on launch day, and the age requirement.",
      paragraphs: [
        `LoanM8 serves borrowers in ${STATES.map((s) => (s.serviceArea && s.serviceArea !== s.name ? `${s.name} (${s.serviceArea})` : s.name)).join(", ")}. We cannot originate loans for property outside these states.`,
        "You must be 18 or older to book a call or use any intake feature.",
      ],
      link: { href: "/disclosures", label: "Licenses and disclosures" },
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      note: "Confirm the acceptable-use list and the terms that apply to the agent API endpoints.",
      paragraphs: [
        "Do not scrape, harvest, or attempt to extract personal data from this site. Do not use the site to send spam, probe security, or impersonate LoanM8.",
        "AI assistants and other automated agents may read the public pages and the agent endpoints. The terms for those endpoints are on the page for AI assistants.",
      ],
      link: { href: "/ai", label: "For AI assistants" },
    },
    {
      id: "intellectual-property",
      title: "Intellectual property",
      note: "Confirm ownership of the site content, the M8 name and orb, and the license granted to visitors.",
      paragraphs: [`The site, its text, and its design belong to ${CONFIG.entityLegalName} or its licensors. You may read and share pages for personal, non-commercial use.`],
    },
    {
      id: "disclaimers",
      title: "Disclaimers and limitation of liability",
      note: "Draft the warranty disclaimer and liability limitation for the governing jurisdiction, including any state-specific carve-outs.",
      paragraphs: ["The site is provided as is. To the extent the law allows, LoanM8 disclaims warranties and limits liability for use of the site. Counsel supplies the operative language."],
    },
    {
      id: "governing-law",
      title: "Governing law",
      note: "Choose the governing law and venue. Placeholder until counsel decides.",
      paragraphs: ["[GOVERNING LAW AND VENUE — confirm with counsel]"],
    },
    {
      id: "changes",
      title: "Changes",
      note: "Confirm how changes are announced and when they take effect.",
      paragraphs: ["When these terms change, the date at the bottom of this page changes with them. Continued use after a change means you accept the new terms."],
    },
    {
      id: "contact",
      title: "Contact",
      note: "Confirm the contact address for legal notices.",
      paragraphs: [`Questions about these terms: ${CONFIG.contactEmail}. Privacy requests: ${CONFIG.privacyEmail}.`],
    },
  ] as TermsSection[],
} as const;

/* ───────────────────────── /disclosures ───────────────────────── */

export const disclosuresContent = {
  path: "/disclosures",
  crumbName: "Disclosures",
  eyebrow: "// licenses & disclosures",
  title: "Licenses and disclosures",
  metaTitle: "Licenses and disclosures",
  metaDescription: `NMLS identifiers, per-state licenses and regulators for ${STATES.map((s) => s.code).join(", ")}, Equal Housing Lender, the AI disclosure, and the not-a-commitment-to-lend statement.`,
  intro: "Every fact on this page comes from one configuration file, so the footer, the state pages, and this page always agree. Bracketed values are pre-launch placeholders.",

  sections: [
    { id: "nmls", title: "NMLS" },
    { id: "licenses", title: "Licenses by state" },
    { id: "equal-housing", title: "Equal Housing Lender" },
    { id: "ai", title: "AI disclosure" },
    { id: "not-a-commitment", title: "Not a commitment to lend" },
    { id: "disclaimer", title: "Full disclaimer" },
    { id: "complaints", title: "Complaints and regulators" },
    { id: "trade-name", title: "Trade name" },
  ],

  nmls: {
    lead: "The Nationwide Multistate Licensing System (NMLS) identifier for the entity and for each licensed loan officer. Consumer Access links open the public NMLS record.",
    entityLabel: "Entity",
    consumerAccessLabel: "NMLS Consumer Access",
    consumerAccessPending: "Consumer Access link pending",
  },

  licenses: {
    lead: "One row per state. Loans are originated through the sponsoring entity named in each row; LoanM8 is the trade name you deal with.",
    columns: { state: "State", serviceArea: "Service area", entityLicense: "Entity license", mloLicense: "MLO license", regulator: "Regulator", sponsor: "Sponsor" },
    disclosureLead: "State-specific disclosure language, rendered verbatim from config when counsel fills it in:",
    sponsorLead: "Sponsoring entities, grouped:",
  },

  equalHousing: {
    label: copy.footer.equalHousing,
    srLabel: "Equal Housing Lender logo",
    body: "LoanM8 and its loan officers follow federal and state fair lending law. We do not discriminate on the basis of race, color, religion, national origin, sex, familial status, disability, or any other basis protected by law.",
    counselNote: "Confirm the fair-lending sentence and whether the official Equal Housing Lender logo must appear on this page as well as in the footer.",
  },

  ai: {
    line: AI_DISCLOSURE,
    verifies: "A licensed loan officer verifies every deal.",
    recording: "Chats may be recorded for compliance review when live chat is on. Transcripts are available on request.",
    builtOn: CONFIG.builtOn,
  },

  disclaimer: {
    counselNote: "Generated footer disclaimer (lib/licensing.ts buildDisclaimer). Confirm the wording, the sponsor sentences, and the order.",
  },

  complaints: {
    lead: "If you have a complaint about a loan officer or about LoanM8, you can contact the regulator for your state. You can also contact us first; we would rather fix it.",
    placeholderNote: "Regulator names and links are placeholders until filled in config. Each will link to the regulator's consumer complaint or license-lookup page.",
    counselNote: "Confirm each regulator, the complaint URL, and any state-mandated complaint-notice wording that must appear here verbatim.",
  },

  tradeName: {
    body: `${CONFIG.entityTradeName} is a trade name of ${CONFIG.entityLegalName}.`,
    counselNote: `Confirm trade-name registration in each state (${STATES.map((s) => s.code).join(", ")}).`,
  },

  placeholderNote: "// All bracketed values on this page are pre-launch placeholders. The full list, with file paths, is in PLACEHOLDERS.md.",
} as const;

/** Ordered state configs for the privacy state notices, from config. */
export function privacyNoticeStates() {
  return privacyContent.stateNotices.order.map((code) => stateByCode(code)).filter((s): s is NonNullable<typeof s> => Boolean(s));
}
