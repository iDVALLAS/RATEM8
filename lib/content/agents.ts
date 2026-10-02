/**
 * lib/content/agents.ts — strings for /agents that are not in
 * `lib/copy.ts` (which is locked). Structural headings, the demo-card
 * labels for the "stalled deal" scene, and the scene's text equivalent.
 *
 * No names, no numbers, no timing promises. The address is fictional
 * and is labeled as a sample on the card.
 */

export const agentsContent = {
  metaTitle: "For real estate agents — LoanM8",
  metaDescription:
    "What a LoanM8 partnership looks like for real estate agents: a written pre-approval, one loan officer on the file, status updates you are copied on, and no money changing hands.",

  crumbs: [
    { name: "Home", path: "/" },
    { name: "For real estate agents", path: "/agents" },
  ],

  /** The animated centerpiece. */
  scene: {
    sceneLabel: "// stalled deal",
    cardLabel: "Offer accepted",
    address: "123 Sample St",
    sampleTag: "sample",
    orbLine: "reading the situation",
    briefChip: "Rate Strategy Brief · drafted",
    statusKey: "status",
    textEquivalent:
      "A buyer card reads \"Offer accepted, 123 Sample St\" with the status \"financing: unclear\" flickering in a warning tone and only the first timeline dot, Offer, lit. M8 slides in and reads the situation. The status flips to \"financing: documented\", the flicker stops, the timeline dots light up in order from Offer through Pre-approval, LE reviewed, and Lock to Clear to close, the card gains a solid green border, and a small chip reads \"Rate Strategy Brief · drafted\". The address is a fictional sample.",
  },

  /** Section headings the page adds around the locked copy. */
  headings: {
    partnership: "What the partnership looks like",
    partnershipEyebrow: "// the terms",
    buyers: "What your buyer gets",
    buyersEyebrow: "// for your buyers",
    quoteEyebrow: "// money",
    ctaEyebrow: "// next step",
    ctaTitle: "Talk it through with a person.",
    ctaSub: "A short call. No deck, no pitch. Bring the deal that is stuck right now if you have one.",
  },
} as const;
