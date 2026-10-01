/**
 * lib/content/states.ts — long-form content for /states/[slug].
 *
 * Three short "local context" sections per state. Written generally
 * and accurately: no statistics, no rate claims, no invented facts, no
 * numbers that could go stale. Anything state-specific that needs a
 * lawyer's eye stays in `requiredDisclosure` in lib/config.ts and is
 * rendered as a visibly marked placeholder, not here.
 *
 * Facts (service area, regulator name, recording-consent rule) come from
 * `StateConfig`; this file only turns them into sentences.
 */

import type { StateConfig, StateSlug } from "@/lib/config";

export type StateSection = {
  eyebrow: string;
  title: string;
  paragraphs: string[];
};

export type StateContent = {
  /** Italic accent line under the h1, e.g. "serving Washington". */
  accentLine: string;
  metaDescription: string;
  sections: StateSection[];
};

/** Shared headings the page adds around the config-driven facts. */
export const statePageContent = {
  licenseHeading: "Licensing in this state",
  licenseSub: "Every number here renders from the site's configuration. Bracketed values are placeholders until they are verified.",
  entityLabel: "Entity license",
  mloLabel: "MLO license",
  regulatorLabel: "State regulator",
  nmlsLabel: "NMLS",
  originatorsLabel: "Loan originators",
  /** v14: shown until MloContext has a match; then the matched MLO and NMLS #. */
  originatorsGeneric: "Licensed, vetted loan officers, matched by state. Your loan officer's name and NMLS number appear here once you are matched.",
  originatorsLookup: "Look up a license on NMLS Consumer Access",
  disclosureMarker: "[STATE-SPECIFIC DISCLOSURE — confirm with counsel]",
  disclosureNote: "This block is a placeholder. Counsel replaces it with the disclosure language this state requires, if any, before launch.",
  contextEyebrow: "// local context",
  contextHeading: "What is different here",
  calculatorsSub: "Deterministic math, nothing collected. You enter the rate; the calculators never supply one.",
  ctaEyebrow: "// next step",
  ctaHeading: "Talk it through with a person.",
  ctaSub: "A short call with a licensed loan officer. Bring a Loan Estimate if you already have one.",
  otherStatesLabel: "Also licensed in",
} as const;

/** Recording-consent sentence, driven by the config flag. */
function recordingParagraph(s: StateConfig): string {
  return s.twoPartyConsent
    ? `${s.name} is a state where every party on a call has to agree before it is recorded. That is why M8 asks for consent before any recorded conversation starts, and why you can decline recording and still get help.`
    : `Wherever you are, M8 asks for consent before any recorded conversation starts. You can decline recording and still get help, and you can ask for a transcript of what was recorded.`;
}

function regulatorParagraph(s: StateConfig): string {
  return `Mortgage lending in ${s.name} is overseen by the state regulator listed above. Its site is where you can look up a license, read consumer guidance, and file a complaint. LoanM8 links to it here so you do not have to take our word for anything.`;
}

const byState: Record<StateSlug, (s: StateConfig) => StateContent> = {
  washington: (s) => ({
    accentLine: `serving ${s.serviceArea}`,
    metaDescription: `LoanM8 in ${s.name}, serving ${s.serviceArea}: the license line, the state regulator, what is different about buying and refinancing here, and calculators you can run yourself.`,
    sections: [
      {
        eyebrow: "// service area",
        title: `Serving ${s.serviceArea}`,
        paragraphs: [
          `LoanM8 is licensed in ${s.name} and works with borrowers buying or refinancing anywhere in the state.`,
          "Tell us where the property is on the first call. You will get a straight answer about whether this is the right fit, and a plain referral if it is not.",
        ],
      },
      {
        eyebrow: "// costs that vary by county",
        title: "Taxes, title, and escrow are local",
        paragraphs: [
          "Property tax rates, how taxes are billed, and the customs around title insurance and escrow differ from county to county. None of that is set by the lender, and none of it is hidden: every one of those costs appears on your Loan Estimate, in the sections for taxes, prepaids, and services you can shop for.",
          "Your licensed loan officer walks through those lines with you and tells you which ones are estimates, which ones you can shop, and which ones the seller may be paying by local custom.",
        ],
      },
      {
        eyebrow: "// your rights",
        title: "Recording consent and the regulator",
        paragraphs: [recordingParagraph(s), regulatorParagraph(s)],
      },
    ],
  }),

  arizona: (s) => ({
    accentLine: `serving ${s.serviceArea}`,
    metaDescription: `LoanM8 in ${s.name}: the license line, the state regulator, what to know about purchases, refinances, and HOA communities here, and calculators you can run yourself.`,
    sections: [
      {
        eyebrow: "// purchase and refinance",
        title: "Same process, same math",
        paragraphs: [
          `Whether you are buying or refinancing in ${s.name}, the process is the same one LoanM8 runs everywhere: a conversation, a Rate Strategy Brief that documents the options, and one licensed loan officer from the first call to closing.`,
          "The Loan Estimate you receive follows the same federal form in every state, so the guide on this site applies here without translation.",
        ],
      },
      {
        eyebrow: "// homeowners associations",
        title: "HOA dues are part of the payment",
        paragraphs: [
          `Many ${s.name} neighborhoods and condominium buildings are governed by a homeowners association. HOA dues are a real monthly cost, and lenders count them when they look at what you can afford. They show up in the projected-payments section of the Loan Estimate.`,
          "Before you write an offer, ask for the association's dues, any pending special assessments, and its governing documents. Your licensed loan officer needs the same information to price the loan accurately.",
        ],
      },
      {
        eyebrow: "// your rights",
        title: "Recording consent and the regulator",
        paragraphs: [recordingParagraph(s), regulatorParagraph(s)],
      },
    ],
  }),

  california: (s) => ({
    accentLine: `serving ${s.serviceArea}`,
    metaDescription: `LoanM8 in ${s.name}: the license line, the state regulator, what conforming loan limits mean in higher-cost areas, and calculators you can run yourself.`,
    sections: [
      {
        eyebrow: "// loan limits",
        title: "Conforming limits are higher in some areas",
        paragraphs: [
          `Conforming loan limits, the maximum loan size that can be sold to the government-sponsored mortgage entities, are set each year and are higher in designated high-cost areas. Several ${s.name} counties fall into that category. The limit for a specific county is published by the federal housing agencies, and it changes, so LoanM8 does not print a number here.`,
          "Whether your loan falls under the conforming limit affects which programs are available and how the loan is priced. Your licensed loan officer checks the current limit for the county you are buying in and explains what it means for your options.",
        ],
      },
      {
        eyebrow: "// consumer resources",
        title: "The state publishes its own guidance",
        paragraphs: [
          regulatorParagraph(s),
          "It is a good habit to look up any lender or loan originator there, and on NMLS Consumer Access, before you share documents. That includes us.",
        ],
      },
      {
        eyebrow: "// your rights",
        title: "Recording consent",
        paragraphs: [
          recordingParagraph(s),
          "Nothing about a call, a chat, or an uploaded document is a credit pull. A hard inquiry happens only when you decide to apply, and only with your consent.",
        ],
      },
    ],
  }),

  texas: (s) => ({
    accentLine: `serving ${s.serviceArea}`,
    metaDescription: `LoanM8 in ${s.name}: the license line, the state regulator, why home-equity and cash-out refinances work differently here, and calculators you can run yourself.`,
    sections: [
      {
        eyebrow: "// home equity",
        title: "Cash-out and home-equity loans have their own rules",
        paragraphs: [
          `${s.name} has distinctive rules for home-equity and cash-out refinance loans that come from the state constitution rather than from federal law. They affect how much equity can be borrowed against, how the loan is documented, and the timing of closing.`,
          "This site does not summarize those rules, because a summary that is slightly wrong is worse than none. If you are thinking about tapping equity in a home here, ask your licensed loan officer to walk through them before you plan around a number.",
        ],
      },
      {
        eyebrow: "// purchase",
        title: "Purchases follow the standard form",
        paragraphs: [
          "For a purchase, the Loan Estimate follows the same federal form used in every state. Property taxes, title insurance, and the customs around who pays which closing costs are local, and every one of those items appears on the estimate so you can see them before you decide.",
          "Your licensed loan officer tells you which lines are estimates, which you can shop, and which the contract assigns to the seller.",
        ],
      },
      {
        eyebrow: "// your rights",
        title: "Recording consent and the regulator",
        paragraphs: [recordingParagraph(s), regulatorParagraph(s)],
      },
    ],
  }),
};

export function stateContent(s: StateConfig): StateContent {
  return byState[s.slug](s);
}
