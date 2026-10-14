/**
 * lib/content/home.ts — homepage strings that are not in lib/copy.ts.
 *
 * Only structural / accessibility strings live here: scene labels,
 * text equivalents for animations, and the neutral row labels used by
 * the Second Look teaser mock. Marketing copy stays in lib/copy.ts.
 *
 * Rules: no facts (names, NMLS, licenses, counts, rates). The teaser
 * document shows NO figures at all — values are blank bars — so nothing
 * on the homepage can be mistaken for a rate or a fee.
 */

export const homeContent = {
  hero: {
    orbAriaLabelOpen: "M8 has said g'day",
    orbCardLabel: "// m8",
    gridLabel: "Start here",
    trustLabel: "What you can count on",
  },
  states: {
    ariaLabel: "Licensed states",
  },
  principles: {
    sceneLabel: "// the eight",
    listLabel: "The eight principles",
    ctaCardBody: "The eight, with what each one means in practice, versioned and citable.",
    textEquivalent:
      "The eight principles appear one at a time as cards: one loan officer start to close, live wholesale pricing, every lender shopped on every file, all-in cost displayed before you decide, soft pull until you're ready, your data stays yours, M8 shops the math and a licensed human verifies the deal, and documented decisions.",
  },
  how: {
    sceneLabel: "// how it works",
    counterTotal: "03",
    /** Accent phrase inside copy.how.heading (presentation only). */
    accent: "No surprises.",
    listLabel: "The three steps",
    orbPrefix: "// m8:",
    textEquivalent:
      "The three steps as a list: talk it through with M8, get a written Rate Strategy Brief, then talk to your licensed loan officer. As you scroll, the step nearest the middle of the screen reads at full contrast and the others fade. Beside them, the M8 orb changes state, listening, thinking, then idle, over a small Rate Strategy Brief card.",
  },
  secondLook: {
    counter: "loop",
    docTitle: "Loan Estimate",
    docMeta: "page 2 of 3",
    /** Neutral section names from the standard Loan Estimate form. No values shown. */
    docSections: ["Loan costs", "Other costs"],
    docFields: [
      { section: 0, label: "Origination charges", tag: "explained" },
      { section: 0, label: "Services you cannot shop for", tag: "explained" },
      { section: 0, label: "Services you can shop for", tag: "yours to shop" },
      { section: 1, label: "Prepaids & escrow", tag: "explained" },
    ],
    resultLabel: "// what you get back",
    resultLines: [
      "Every line, in plain English.",
      "Which fees are set by the lender, and which you can shop.",
      "The questions worth asking before you sign.",
    ],
    textEquivalent:
      "A small tilted Loan Estimate document is scanned top to bottom by a green line. Four rows light up as M8 reads them and are tagged 'explained' or 'yours to shop'. A card then fills in describing what you get back: every line in plain English, which fees are set by the lender and which you can shop, and the questions worth asking. The document is a sample with no figures.",
  },
  mlo: {
    textEquivalent: "A headline reveals word by word with the phrase 'Build your book' underlined.",
  },
  about: {
    nmlsPrefix: "NMLS #",
  },
} as const;
