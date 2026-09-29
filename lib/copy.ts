/**
 * All user-facing copy for LoanM8.
 *
 * Voice: populist, technically grounded, calm, honest, specific.
 *        Never corporate, never pressuring, never effusive.
 *        Occasional Aussie warmth in microcopy ("G'day") used sparingly.
 *
 * RULES (see COMPLIANCE.md):
 *  - No rates, no lender counts, no earnings claims, no urgency, no
 *    endorsements, no invented stats. `npm run check:copy` greps for the
 *    banned list (COMPLIANCE.md rule 2) and fails if any string matches.
 *  - Facts (names, NMLS, states, emails, links) come from lib/config.ts.
 *  - Strings that existed before the one-shot build are kept verbatim
 *    where they still comply. Where a change was required, the old
 *    string is preserved in a `// PROPOSAL:` comment right above it.
 *
 * Long-form educational content (guides, FAQs, state context, legal
 * skeletons) lives in lib/content/*.ts so this file stays readable.
 */

import {
  CONFIG,
  MLO_REF,
  MLO_REF_CAP,
  HAS_TEAM,
  LICENSED_IN_LINE,
  AI_DISCLOSURE,
  NOT_A_CREDIT_PULL,
} from "./config";
import { NMLS_BADGE, PRIVACY_EMAIL } from "./licensing";

const mlo = CONFIG.principalMlo;

export const copy = {
  brand: {
    // PROPOSAL: previous string was "Loan intelligence. Free for all loan mates."
    // The site brief (Section 1) sets the tagline to "Free for the people."
    tagline: CONFIG.tagline,
    subname: CONFIG.brandSubname,
    aiLine: CONFIG.aiLine,
  },

  nav: {
    links: [
      { href: "/calculators", label: "Calculators" },
      { href: "/chat", label: "M8 Chat" },
      { href: "/agents", label: "For agents" },
      { href: "/principles", label: "Principles" },
      { href: "/#about", label: "About" },
      { href: "/privacy", label: "Privacy" },
    ],
    secondary: [
      { href: "/second-look", label: "Second Look" },
      { href: "/join", label: "For MLOs" },
      { href: "/loan-estimate", label: "Loan Estimate guide" },
      { href: "/sample-brief", label: "Sample brief" },
      { href: "/ai", label: "For AI assistants" },
    ],
    menuLabel: "Menu",
    closeLabel: "Close",
  },

  hero: {
    eyebrow: "BUILT ON CLAUDE · VERIFIED BY HUMANS",
    tagline: "Loan intelligence.",
    // PROPOSAL: "Free for all loan mates." → brief tagline second half.
    taglineEmphasis: "Free for the people.",
    sub: "AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer. No lead-selling. No trigger leads. No spam.",
    // PROPOSAL: the brief's orb greeting "Tap me to say g'day." was replaced
    // by the owner with two actions under the orb (Voice / Q & A). The
    // string stays here for reference; nothing renders it.
    orbCaption: "Tap me to say g'day.",
    voiceLabel: "Voice",
    qaLabel: "Q & A",
    voiceComingSoon: "Voice is coming soon. Hang in there, m8.",
    qaComingSoon: "Booking link coming soon.",
    orbCardTitle: "Hi, I'm M8.",
    orbCardBody: `${AI_DISCLOSURE} Chat is opening soon. Want to talk to a licensed loan officer now?`,
    orbCardCta: "Book a call with a licensed loan officer",
    orbCardDismiss: "Not right now",
    borrowerCta: "I'm shopping a mortgage",
    agentCta: "I'm a real estate agent",
    secondLookCta: "Get a second look",
    secondLookSub: "Already have an offer? Drop it here and M8 decodes it.",
    mloCta: "I'm a hungry MLO. I want in.",
    mloSub: "Licensed in any state? We are vetting one originator per area.",
  },

  trust: {
    items: [
      { icon: "soft-pull", label: "Soft pull only", sub: "No trigger leads" },
      { icon: "one-lo", label: "One loan officer", sub: "Start to close" },
      { icon: "never-shared", label: "Never shared", sub: "Your data stays yours" },
      { icon: "free", label: "Free to use", sub: "No fee to borrowers for M8" },
    ],
  },

  states: {
    label: "// licensed in",
    heading: "Four states. One standard.",
    sub: `Licensed in ${LICENSED_IN_LINE}.`,
    ctaSuffix: "state page",
  },

  principles: {
    eyebrow: "THE EIGHT PRINCIPLES",
    heading: "What we owe you.",
    sub: "These are not features. They are the rules we close every loan against.",
    readAll: "Read the full manifesto",
    pageEyebrow: "// the manifesto",
    pageHeading: "Eight rules. No exceptions.",
    pageSub: "Every loan on LoanM8 is closed against these. If we break one, you will have it in writing.",
    counterFormat: (n: number) => `// ${String(n).padStart(2, "0")} of 08`,
  },

  how: {
    eyebrow: "HOW IT WORKS",
    heading: "Three steps. No surprises.",
    // PROPOSAL: earlier steps were "Tell M8 what you're buying." / "M8 shops
    // every wholesale lender on your file." / "<MLO> closes the loan." The
    // brief (Section 8) sets the three steps below.
    steps: [
      {
        n: "01",
        label: "// 01 — talk",
        title: "Talk it through with M8.",
        body: `A conversation, not a form. M8 asks what you are trying to do and explains the math as you go. ${NOT_A_CREDIT_PULL}`,
      },
      {
        n: "02",
        label: "// 02 — brief",
        title: "Get a written Rate Strategy Brief.",
        body: "Three options, plain-English tradeoffs, the questions worth asking. Yours to keep, whoever you end up closing with.",
      },
      {
        n: "03",
        label: "// 03 — verify",
        title: "Talk to your licensed loan officer.",
        body: HAS_TEAM
          ? "A licensed human checks the file, answers the hard questions, and closes the loan. One person, start to close."
          : `${mlo.firstName} checks the file, answers the hard questions, and closes the loan. One person, start to close.`,
      },
    ],
  },

  secondLookTeaser: {
    eyebrow: "// second look",
    heading: "Got an offer? Drop it. M8 reads it.",
    accent: "Drop it.",
    body: "Paste in the Loan Estimate you already have. M8 explains every line of it in plain English, and which fees are yours to negotiate. It never compares it to our pricing. It just makes sure you understand what you were handed.",
    cta: "See how Second Look works",
  },

  agents: {
    eyebrow: "FOR REAL ESTATE AGENTS",
    heading: "Your buyers stall when financing is murky. M8 unsticks them.",
    // PROPOSAL: was "A partner who answers his own phone, doesn't poach your
    // client list, and gives your buyers a defensible reason to move."
    // Changed to remove the gendered pronoun and the timing claim.
    sub: "A loan officer who answers their own phone, doesn't poach your client list, and gives your buyers a documented reason to move.",
    cards: [
      {
        // PROPOSAL: was "Same-day pre-approval, written." (timing claim).
        title: "A written pre-approval, not a maybe.",
        body: "Your buyer gets a real letter, not a soft 'we'll see.' Listing agents read it and take the offer seriously.",
      },
      {
        title: "No spam blast to your buyer.",
        // PROPOSAL: was "...doesn't get 47 calls from other lenders" (invented stat).
        body: "We pull soft credit. Your client doesn't get a wave of calls from other lenders the next morning.",
      },
      {
        title: "One person owns the file.",
        body: `${MLO_REF_CAP}. Not a processor in another time zone. You call once, you get the answer.`,
      },
    ],
    cta: "Book a partner intro call",
  },

  mloBand: {
    eyebrow: "// for licensed MLOs",
    heading: "Hungry? Build your book on LoanM8.",
    accent: "Build your book",
    body: "Licensed anywhere in the US? We are vetting originators in every state, one per area, and building the AI search channel that sends borrowers to them. M8 handles the intake. You originate.",
    cta: "See how it works for you",
  },

  about: {
    eyebrow: HAS_TEAM ? "WHO CLOSES YOUR LOAN" : "WHO CLOSES YOUR LOAN",
    heading: HAS_TEAM ? "Licensed loan officers. No call center." : `${mlo.name}.`,
    sub: HAS_TEAM
      ? "Every loan on LoanM8 is closed by one NMLS-licensed Mortgage Loan Originator, start to finish. M8 is the tool. A human is on the line."
      : "NMLS-licensed Mortgage Loan Originator. M8 is the tool. I'm the human on the line.",
    nmls: NMLS_BADGE,
    verify: "Verify on NMLS Consumer Access",
    bioLabel: "// bio",
  },

  footer: {
    blurb: "AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer.",
    columns: [
      {
        title: "Borrowers",
        links: [
          { href: "/second-look", label: "Second Look" },
          { href: "/calculators", label: "Calculators" },
          { href: "/loan-estimate", label: "Loan Estimate guide" },
          { href: "/sample-brief", label: "Sample Rate Strategy Brief" },
          { href: "/chat", label: "M8 Chat" },
        ],
      },
      {
        title: "Partners",
        links: [
          { href: "/agents", label: "For real estate agents" },
          { href: "/join", label: "For licensed MLOs" },
          { href: "/ai", label: "For AI assistants" },
        ],
      },
      {
        title: "Company",
        links: [
          { href: "/principles", label: "The eight principles" },
          { href: "/#about", label: "About" },
          { href: "/disclosures", label: "Licenses & disclosures" },
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
        ],
      },
    ],
    licensedLabel: "// licensed in",
    equalHousing: "Equal Housing Lender",
    aiNote: `M8 is an AI, not a person. A licensed loan officer verifies every deal.`,
  },

  /* ───────────── SECOND LOOK ───────────── */

  secondLook: {
    eyebrow: "// second look",
    heading: "Got an offer? Drop it. M8 reads it.",
    accent: "Drop it.",
    sub: "You already have a Loan Estimate from someone else. Good. M8 walks through it line by line, in plain English, and tells you which questions to ask. It does not compare it to our pricing and it does not tell you to switch.",
    sampleNote: "The demo below uses a fictional Loan Estimate. Nothing you see is a real offer.",
    scenes: [
      { label: "// 01 — drop", title: "Drop the document.", body: "A Loan Estimate is a standard three-page form. M8 reads the standard fields, nothing else." },
      { label: "// 02 — read", title: "M8 reads the fields.", body: "Interest rate. APR. Points. Lender credits. Section A origination charges. Section B and C services. Cash to close." },
      { label: "// 03 — decoded", title: "Decoded.", body: "What each number means, which fees the lender controls, and what you are being asked to bring to closing." },
      { label: "// 04 — toggle", title: "Points or credit?", body: "Flip the toggle. The monthly payment, the upfront cost, and the break-even month update from deterministic math." },
      { label: "// 05 — handoff", title: "A licensed human can check it.", body: "M8 explains. A licensed loan officer verifies. Book a call if you want one." },
    ],
    decoded: {
      trueCost: { title: "True cost", body: "The rate is what you pay on the balance. The APR folds in the fees, which is why it is higher. The gap is the cost of getting the loan." },
      negotiable: { title: "Negotiable vs. fixed", body: "Section A charges are set by the lender. Sections B and C are third-party services; C is the part you can shop for yourself." },
      cashToClose: { title: "Cash to close", body: "Down payment plus closing costs, minus credits and deposits already paid. Ask for the full breakdown on page 2." },
      toggle: { title: "Points vs. credit", body: "Paying points lowers the rate; taking a credit raises it. Which one wins depends on how long you keep the loan." },
      questions: {
        title: "Questions to ask your lender",
        items: [
          "Which of these fees are yours, and which are pass-through?",
          "Is the rate locked, and for how long?",
          "What would the lender credit be at a rate one-eighth higher?",
          "Are any of the Section C services ones I can shop myself?",
          "Does the cash-to-close figure include my earnest money deposit?",
        ],
      },
    },
    toggleLabels: { points: "Pay points", credit: "Take credit" },
    handoff: {
      title: "Want a licensed human to check this?",
      body: "A licensed loan officer can walk through your actual document with you. No credit pull, no pressure, no pitch.",
      cta: "Book a call",
    },
    live: {
      eyebrow: "// live decode",
      heading: "Decode your own Loan Estimate.",
      comingSoon: "Live decode opens soon. Try the sample above.",
      consent: {
        title: "Before you upload",
        items: [
          `${NOT_A_CREDIT_PULL} Uploading a document does not touch your credit.`,
          `What is stored, and for how long: ${CONFIG.secondLookRetention}`,
          "The analysis is AI-generated. It is an explanation of your document, not a commitment to lend and not an offer.",
          "You can request deletion of anything you uploaded at any time.",
          "Your name, address, loan ID, and any SSN-shaped strings are masked on your device before anything is sent.",
        ],
        cta: "I understand, continue",
      },
      dropzone: {
        title: "Drop your Loan Estimate here",
        sub: "PDF or image. Three pages. Nothing is sent until you approve the redaction preview.",
        button: "Choose a file",
      },
      redaction: {
        title: "Redaction preview",
        sub: "These strings were masked automatically. Add a box over anything else you want hidden before sending.",
        addBox: "Add redaction box",
        clear: "Clear my boxes",
        send: "Send masked document",
      },
      reading: "Reading…",
      resultsTitle: "What M8 found",
    },
  },

  /* ───────────── JOIN (MLO RECRUITING) ───────────── */

  join: {
    eyebrow: "// for licensed MLOs",
    heading: "Hungry? Build your book on LoanM8.",
    accent: "Build your book",
    sub: "Licensed, competent, and tired of buying leads that were sold to four other people? We are vetting originators in every state, one per area. M8 handles the intake. You originate.",
    scenes: [
      { label: "// 01 — hook", title: "Got a license and something to prove?", body: "This is for originators, in any state, who would rather explain the math than pressure a borrower." },
      { label: "// 02 — where", title: "Every state. One originator per area.", body: "Live today in Western Washington, Arizona, California, and Texas. Vetting licensed originators everywhere else ahead of expansion. When an area has its originator, it is closed to new applicants." },
      { label: "// 03 — intake", title: "M8 does the first conversation.", body: "A borrower talks to M8, gets the math explained, and a Rate Strategy Brief is drafted before you pick up the phone." },
      { label: "// 04 — handled", title: "You get a file, not a lead.", body: "A routed borrower, a three-option comparison laid out the anti-steering way, a pipeline, and a compliance trail." },
      { label: "// 05 — you", title: "You originate. M8 handles the intake.", body: "Book an intro call. No forms." },
    ],
    intakeChat: [
      { from: "borrower", text: "We're under contract and the lender's estimate has a fee I don't understand." },
      { from: "m8", text: "I'm an AI, not a person, so let's keep it simple. Which section is the fee in: A, B, or C?" },
      { from: "borrower", text: "Section A. It says 'underwriting fee'." },
      { from: "m8", text: "That's a lender-controlled charge. I'll note it in your brief along with the question to ask. Want a licensed loan officer to look at the whole estimate with you?" },
    ],
    briefGenerating: "Rate Strategy Brief · generating",
    handled: {
      borrower: { label: "// routed borrower", name: "Sample borrower", detail: "Purchase · Western WA · pre-approval requested", sample: "fictional" },
      comparison: { label: "// wholesale comparison", options: ["Lowest rate suitable", "Lowest rate, no risky features", "Lowest total points & fees"], note: "Anti-steering layout. Fictional labels, no figures." },
      pipeline: { label: "// pipeline", steps: ["Application", "LE", "Lock", "Close"] },
      compliance: { label: "// compliance", items: ["Soft pull only", "Disclosures logged", "Documented decisions"] },
    },
    aiChannel: {
      eyebrow: "// the channel",
      heading: "Borrowers are starting to ask AI assistants who to call.",
      accent: "who to call.",
      body: "LoanM8 is built to be the source those assistants can verify and cite: machine-readable licensing, deterministic calculators, a documented process, and plain answers on /ai. When an assistant hands a borrower off, the conversation routes to the licensed originator for that area. A channel, not a lead list.",
      note: "No borrower is shared with more than one originator. No lead is sold.",
    },
    lookFor: {
      eyebrow: "// what we look for",
      heading: "What we look for. What to expect.",
      items: [
        "Active NMLS license in any state.",
        "One originator per service area. When an area has its originator, it is closed to new applicants.",
        "Must hold an active NMLS license.",
        "Sponsorship and state licensing requirements apply.",
        "Borrower assignment is explained on the intro call.",
        "Compensation details are shared on the intro call.",
        "You will explain, not pressure. Every decision gets written down.",
      ],
    },
    cta: "Book an intro call",
    ctaSub: "No forms. One conversation.",
  },

  /* ───────────── AGENTS PAGE ───────────── */

  agentsPage: {
    eyebrow: "PARTNERSHIP",
    heading: "Built for agents who are tired of mortgage drama.",
    sub: "LoanM8 was designed alongside working agents in our licensed markets. Here is what the partnership actually looks like.",
    scenes: [
      { label: "// 01 — stalled", status: "financing: unclear", title: "Offer accepted. Financing unclear." },
      { label: "// 02 — M8", status: "reading the situation", title: "M8 reads the situation." },
      { label: "// 03 — unstuck", status: "financing: documented", title: "Documented. Moving." },
    ],
    timeline: ["Offer", "Pre-approval", "LE reviewed", "Lock", "Clear to close"],
    sections: [
      {
        title: "The basics",
        // PROPOSAL: was "...answers in business hours, same day. Pre-approval
        // letter ... delivered within 24 hours." Timing claims removed.
        body: `You introduce a buyer. ${MLO_REF_CAP} answers during business hours. A written pre-approval letter, fully underwritten where possible. You get cc'd on every status change.`,
      },
      {
        title: "What we will never do",
        body: "We will not market other services to your client. We will not sell their data. We will not call them about refinances years later without your knowledge.",
      },
      {
        title: "Co-branded pages (coming later)",
        // PROPOSAL: was "Co-branded subdomain (coming)". Kept as a future
        // feature per the brief; nothing is built.
        body: "Later, your buyers will be able to land on a page with your name on it and our engine underneath. That is a future feature. Nothing to sign up for yet.",
      },
      {
        title: "Money",
        // PROPOSAL: replaced the earlier "Compensation" section (which
        // discussed RESPA co-marketing) with the brief's plain sentence.
        body: "No money, gifts, or marketing dollars flow between LoanM8 and agents. Buyers get a better mortgage experience; you get the credit for finding it.",
      },
    ],
    howBox: {
      title: "How this works",
      items: [
        "Your buyer talks to M8 or books a call. No forms, no credit pull to start.",
        "M8 explains the options in writing. A licensed loan officer verifies the file.",
        "You get status updates. Your buyer gets a documented decision.",
        "Nothing is paid to you and nothing is asked of you.",
      ],
    },
    cta: "Book a 20-min partner intro call",
  },

  /* ───────────── CALCULATORS ───────────── */

  calculators: {
    eyebrow: "// calculators",
    heading: "Run the numbers yourself.",
    sub: "Four calculators, deterministic math, nothing collected. You enter the rate. We never display one.",
    noRates: "No rates displayed. Enter your own.",
    items: [
      { slug: "points-breakeven", title: "Points break-even", body: "Should you pay points? Monthly savings, break-even month, and a chart." },
      { slug: "refinance-breakeven", title: "Refinance break-even", body: "Months until closing costs earn back, and the total interest delta." },
      { slug: "rent-vs-buy", title: "Rent vs. buy", body: "Total cost of each path over your horizon, with every assumption on the table." },
      { slug: "affordability", title: "Affordability", body: "An indicative payment range from income, debts, and down payment. Not the bank's maximum." },
    ],
    moreTools: "More tools",
    moreToolsSub: "Twelve additional calculators, same rules.",
    showWork: "Show your work",
    assumptions: "Assumptions",
    faq: "Questions",
    lastUpdated: "Last updated",
    ctaTitle: "Want to talk this through?",
    ctaBody: HAS_TEAM
      ? "M8 can explain the math in a conversation. A licensed loan officer can look at your actual situation."
      : `M8 can explain the math in a conversation. ${mlo.firstName} can look at your actual situation.`,
    ctaChat: "Talk to M8",
    ctaBook: "Book a call",
  },

  /* ───────────── CHAT ───────────── */

  chat: {
    title: "M8 Chat",
    gate: {
      eyebrow: "// before we start",
      body: "I'm M8, an AI, not a person. A licensed loan officer verifies every deal. This chat may be recorded for compliance; ask for a transcript any time. It is not a credit pull.",
      recording: "Recording and transcript: conversations may be stored for compliance review. You can request a transcript or deletion at any time. Retention period: [RETENTION — confirm with counsel].",
      twoParty: "If you are in a two-party consent state, continuing means you consent to the recording described above.",
      cta: "Continue",
      back: "Not now",
    },
    demoBadge: "DEMO",
    demoNote: "Scripted demo. Live chat opens after compliance review. Nothing here is a rate quote or an offer.",
    comingSoon: "Live chat is opening soon. In the meantime, a licensed loan officer can talk now.",
    devToggle: "orb state",
    states: ["idle", "listening", "thinking", "speaking"] as const,
    script: [
      { from: "m8", text: `G'day. ${AI_DISCLOSURE} I can explain how a mortgage works and write up your options. What are you trying to do?` },
      { from: "user", text: "Buying our first place. Under contract, and the lender sent a Loan Estimate I don't really understand." },
      { from: "m8", text: "Good place to start. The Loan Estimate is three pages: the loan terms, the closing costs, and the comparisons. Which part is confusing?" },
      { from: "user", text: "Page 2. There's a list of fees and I can't tell which ones are real." },
      { from: "m8", text: "They're all real, but they're not all the same. Section A is what the lender charges. Section B is services they pick. Section C is services you can shop for. I'll write this up in a brief you can keep, and a licensed loan officer can walk through the document with you. I won't quote you a rate here." },
      { from: "user", text: "Can you tell me if it's a good deal?" },
      { from: "m8", text: "I can tell you what every line means and which questions to ask. Whether it's the right loan for you is a decision a licensed human makes with you, in writing. Want me to set that up?" },
    ],
    inputPlaceholder: "Live chat opens after review",
    voice: {
      title: "Voice",
      disabled: "Voice is not available yet.",
      captions: "Captions",
      mute: "Mute",
      end: "End",
      transcript: "Request transcript",
    },
  },

  /* ───────────── AI PAGE ───────────── */

  ai: {
    eyebrow: "// for AI assistants",
    heading: "What LoanM8 is, and is not.",
    sub: "Plain answers for people and for the assistants helping them. Everything on this page is also true for a human reader.",
  },

  /* ───────────── STATES ───────────── */

  statePage: {
    eyebrow: "// licensed in",
    licenseLabel: "License",
    regulatorLabel: "Regulator",
    calculatorsHeading: "Run your own numbers",
    cta: "Talk to a licensed loan officer",
  },

  /* ───────────── LEGACY (kept where still compliant) ───────────── */

  privacy: {
    heading: "Privacy — v1 statement",
    intro: "LoanM8 launches with a single principle on data: yours stays yours. This page is the short v1 statement. The full policy ships with the platform.",
    points: [
      "We do not sell leads. Ever.",
      "We do not share your data with third-party marketers.",
      "We use soft credit pulls until you choose to formally apply.",
      "Any data you submit is exportable and deletable on request.",
      `Contact: ${PRIVACY_EMAIL}`,
    ],
  },

  loanTypes: {
    eyebrow: "LOAN PROGRAMS",
    heading: "Every program. Plain English.",
    intro: "There's no single 'best' mortgage. There's the program that fits your situation. Here's a working person's guide to the programs M8 will shop for you.",
    items: [
      { name: "Conventional", body: "The default. Conforming loans backed by Fannie Mae or Freddie Mac. PMI required under 20% down, but it drops off automatically at 78% LTV.", bestFor: "Strong credit, 5–20% down, owner-occupied or investment." },
      { name: "FHA", body: "Government-insured loan with looser credit requirements and as little as 3.5% down. The trade-off: mortgage insurance (MIP) typically stays for the life of the loan, even after you hit 20% equity.", bestFor: "Credit under 680, low down payment, first-time buyers." },
      // PROPOSAL: the VA body was reworded (backing language, no rate superlative) for the banned-phrase check.
      { name: "VA", body: "Zero down payment, no PMI. Funded by lenders, backed by the VA. If you're eligible, it is almost always worth pricing first.", bestFor: "Active military, veterans, eligible surviving spouses." },
      { name: "USDA", body: "Zero down payment for properties in eligible rural areas (and many suburban areas qualify — check the map). Income limits apply.", bestFor: "Rural or eligible-suburban properties, moderate income." },
      { name: "Jumbo", body: "Loan amounts above the conforming limit (higher in high-cost areas of our markets). Stricter underwriting.", bestFor: "Higher-priced homes, strong credit and reserves." },
      { name: "Non-QM / Bank Statement", body: "Alternative documentation loans for self-employed borrowers, real estate investors, or borrowers whose tax returns don't reflect their real income. Higher rates, but the only path for some borrowers.", bestFor: "Self-employed, 1099, asset-rich borrowers." },
    ],
  },

  /*
   * PROPOSAL: the following legacy sections were removed from this file
   * because their strings conflicted with COMPLIANCE.md rules 1 and 14
   * (implied live rate display, "dozens of lenders", "Lowest rate. Lowest
   * fees.") and no page rendered them: `purchase`, `refinance`, `equity`,
   * `tools` (old placeholder list), `rates`, `aboutPage`, `contact`.
   * They remain in git history (commit 837fff6) if a future page needs
   * them rewritten.
   */

  notFound: {
    eyebrow: "// 404",
    heading: "That page isn't here.",
    body: "The link may be old, or the page hasn't shipped yet.",
    cta: "Back to the homepage",
  },

  comingSoon: {
    eyebrow: "// coming soon",
    body: "This part of LoanM8 is being built. Everything else works.",
  },

  mloRef: MLO_REF,
};

export type Copy = typeof copy;
