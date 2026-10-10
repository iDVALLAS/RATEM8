/**
 * lib/content/design.ts — strings for /design, the living style guide
 * (v24). Internal, noindex, behind the stealth gate. It uses a fictional
 * "Sample Lender" only: no real lender is named or shown here, and no
 * real rate is displayed (rate slots read "x.xxx%").
 */
export const designContent = {
  metaTitle: "Design system — LoanM8",
  eyebrow: "// living style guide",
  heading: "LoanM8 design system",
  sub: "Tokens, components and states as they render in this build. Switch the theme in the nav to see Night, Dim and Paper. Internal page: not indexed, not linked.",
  sections: {
    brand: "Brand colours (locked)",
    brandNote: "The orb, the wordmark and brand surfaces only ever use these.",
    data: "Data colours",
    dataNote: "Charts, lender tints and state chips only. Never the orb or the wordmark. Light hue for text on dark surfaces; ink for text on Paper. Ratios are WCAG contrast against Night and Paper.",
    type: "Type",
    buttons: "Buttons and links",
    labels: "Labels",
    lenders: "Lender marks",
    lendersNote: "Every real lender ships with logoApproved: false, so it renders as a monogram tile. An approved logo sits on a white chip (paper-coloured in Paper) so a full-colour mark stays legible. The lender below is fictional.",
    cards: "Lender cards",
    cardsNote: "A tinted left edge and a soft wash from the lender's colour. The lowest-total-cost option glows green in the demo only; /rates never singles out an option.",
    states: "State chips",
    statesNote: "A hue per licensed state plus a simple original outline. No seals or flags.",
    mobile: "Mobile patterns",
    mobileNote: "Swipeable cards with snap and dots (narrow the window), a Detail bottom sheet, and the sticky bottom CTA bar on borrower pages.",
    motion: "Motion",
    motionNote: "Figures count up and bars draw in when scrolled into view. Reduced motion shows the final state.",
    loading: "Loading and empty states",
    loadingNote: "Skeletons, never spinners.",
    mesh: "Mesh backdrop",
    meshNote: "Two still gradient layers cross-fading over 48 seconds behind the hero and every scene.",
  },
  sample: {
    lender: "Sample Lender",
    monogram: "SL",
    rate: "x.xxx%",
    designations: ["Lowest total cost", "Lowest rate · no risky features", "Lowest origination fees"],
    detail: "Detail",
    detailTitle: "Option 01 · Sample Lender",
    detailBody: "A bottom sheet on phones and a dialog on desktop. Esc, the backdrop or × closes it.",
    swipe: "Swipe to compare",
    countFigure: "$338,096",
    countLabel: "Seven-year total (count-up)",
    bars: ["Option 01", "Option 02", "Option 03"],
    empty: "Nothing to show yet.",
    emptyBody: "Empty states say what's missing and what to do next.",
    loading: "Loading example pricing",
    sticky: "Sticky CTA bar (phones, borrower pages)",
  },
} as const;
