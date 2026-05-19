/**
 * All user-facing copy for RateM8.
 *
 * Voice: populist, technically grounded, calm, honest, specific.
 *        Occasional Aussie warmth in microcopy ("G'day", "mate")
 *        used sparingly so it lands as flavor, not a costume.
 *
 * NOTE: LICENSING / COMPLIANCE / LO contact values are NOT here.
 * Edit `lib/licensing.ts` for anything regulatory or LO-specific.
 */

import {
  ANCHOR_LO,
  STATE_LIST_SHORT,
  STATE_LIST_LONG,
  NMLS_BADGE,
  DISCLAIMER,
  PRIVACY_EMAIL,
} from "./licensing";

export const copy = {
  brand: {
    tagline: "Loan intelligence. Free for all loan mates.",
  },

  hero: {
    eyebrow: `G'day. Available in ${STATE_LIST_SHORT}.`,
    tagline: "Loan intelligence.",
    taglineEmphasis: "Free for all loan mates.",
    sub: "AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer. No lead-selling. No trigger leads. No spam.",
    borrowerCta: "I'm shopping a mortgage",
    agentCta: "I'm a real estate agent",
  },

  principles: {
    eyebrow: "THE EIGHT PRINCIPLES",
    heading: "What we owe you.",
    sub: "These are not features. They are the rules we close every loan against.",
  },

  how: {
    eyebrow: "HOW IT WORKS",
    heading: "Three steps. No surprises.",
    steps: [
      {
        n: "01",
        title: "Tell M8 what you're buying.",
        body: "A few questions. Soft credit pull only. No spam blast to other lenders.",
      },
      {
        n: "02",
        title: "M8 shops every wholesale lender on your file.",
        body: "Same algorithm runs for everyone. You see three real options with all-in costs.",
      },
      {
        n: "03",
        title: `${ANCHOR_LO.firstName} closes the loan.`,
        body: "One licensed loan officer, start to close. You leave with a written record of every decision.",
      },
    ],
  },

  agents: {
    eyebrow: "FOR REAL ESTATE AGENTS",
    heading: "Your buyers stall when financing is murky. M8 unsticks them.",
    sub: "A partner who answers his own phone, doesn't poach your client list, and gives your buyers a defensible reason to move.",
    cards: [
      {
        title: "Same-day pre-approval, written.",
        body: "Your buyer gets a real letter — not a soft 'we'll see.' Listing agents read it and take the offer seriously.",
      },
      {
        title: "No spam blast to your buyer.",
        body: "We pull soft credit. Your client doesn't get 47 calls from other lenders the next morning.",
      },
      {
        title: "One person owns the file.",
        body: `${ANCHOR_LO.firstName}. Not a processor in another time zone. You call once, you get the answer.`,
      },
    ],
    cta: "Book a partner intro call",
  },

  about: {
    eyebrow: "WHO CLOSES YOUR LOAN",
    heading: `${ANCHOR_LO.name}.`,
    sub: `NMLS-licensed Mortgage Loan Originator. Authorized in ${STATE_LIST_LONG}. M8 is the tool. I'm the human on the line.`,
    nmls: NMLS_BADGE,
  },

  footer: {
    blurb:
      "AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer.",
    disclaimer: DISCLAIMER,
  },

  agentsPage: {
    eyebrow: "PARTNERSHIP",
    heading: "Built for agents who are tired of mortgage drama.",
    sub: "RateM8 was designed alongside working agents across the four launch markets. Here is what the partnership actually looks like.",
    sections: [
      {
        title: "The basics",
        body: `You refer a buyer. ${ANCHOR_LO.firstName} answers in business hours, same day. Pre-approval letter — fully underwritten where possible — delivered within 24 hours. You get cc'd on every status change.`,
      },
      {
        title: "What we will never do",
        body: "We will not market other services to your client. We will not sell their data. We will not call them about refinances years later without your knowledge.",
      },
      {
        title: "Co-branded subdomain (coming)",
        body: "When live, your buyers will land on agentname.ratem8.com — your face, your name, our engine. You stay the trusted brand.",
      },
      {
        title: "Compensation",
        body: "Per RESPA and federal law: no kickbacks, no co-marketing arrangements that don't follow Section 8 rules. We're happy to walk through compliant co-branding on the call.",
      },
    ],
    cta: "Book a 20-min partner intro call",
  },

  privacy: {
    heading: "Privacy — v1 statement",
    intro:
      "RateM8 launches with a single principle on data: yours stays yours. This page is the short v1 statement. The full policy ships with the platform.",
    points: [
      "We do not sell leads. Ever.",
      "We do not share your data with third-party marketers.",
      "We use soft credit pulls until you choose to formally apply.",
      "Any data you submit is exportable and deletable on request.",
      `Contact: ${PRIVACY_EMAIL}`,
    ],
  },

  /* ───────────── SUBPAGES ───────────── */

  purchase: {
    eyebrow: "BUYING A HOME",
    heading: "Shop your mortgage before you tour the house.",
    sub: "Most buyers find the house first, then panic about financing. We flip it. M8 walks through your scenario, surfaces real wholesale pricing, and gives you a written rate strategy you can take to any showing.",
    sections: [
      {
        title: "What we shop for you",
        body: "Every conventional, FHA, VA, USDA, and jumbo program across our wholesale panel. M8 pulls live indicative pricing from every lender on the panel — same algorithm runs for everyone — and shows you the three options that fit your situation best. Lowest rate. Lowest fees. Lowest risk structure.",
      },
      {
        title: "How much you can actually afford",
        body: "Not the maximum a bank will lend you. The amount that leaves you with money for car repairs, vacations, and a life. M8 walks through DTI, PITI, and your real monthly comfort zone before showing you any pricing.",
      },
      {
        title: "First-time buyer? Read this.",
        body: "If this is your first mortgage, the system was not designed to be understood. That's not your fault. M8 will explain APR vs. note rate, points vs. credits, escrow vs. impound, and what a Loan Estimate actually says — without the condescension you'll find on a bank's website.",
      },
    ],
    cta: "Start with a 15-minute call",
  },

  refinance: {
    eyebrow: "REFINANCING",
    heading: "Refi the math, not the marketing.",
    sub: "Half the refinance offers in your inbox are mathematically worse than your current loan. We'll tell you that. M8 runs the actual breakeven calculation against the rate, the fees, and how long you plan to stay — and tells you honestly whether refinancing makes sense.",
    sections: [
      {
        title: "Rate-and-term refinance",
        body: "Lower your rate, change your term, drop PMI. M8 calculates your breakeven point in months and shows you the all-in cost — including the fees most lenders bury at the bottom of the offer letter.",
      },
      {
        title: "Cash-out refinance",
        body: "Tap home equity for renovations, debt consolidation, or college. M8 compares cash-out refi against HELOC and home equity loan side-by-side so you see the real cost of each path.",
      },
      {
        title: "When NOT to refinance",
        body: "If your breakeven is longer than you plan to own the home, refinancing is a loss. M8 will tell you that. We'd rather lose a closing than close a refi that doesn't actually help you.",
      },
    ],
    cta: "Have M8 run the math on your scenario",
  },

  equity: {
    eyebrow: "HOME EQUITY",
    heading: "Equity is a tool. Use it carefully.",
    sub: "HELOC, home equity loan, or cash-out refi — they all let you borrow against your home, but they cost very different amounts. M8 lays out all three side-by-side with your real numbers, then explains which one actually fits what you're trying to do.",
    sections: [
      {
        title: "HELOC (Home Equity Line of Credit)",
        body: "A revolving credit line against your equity. Variable rate, draw period, repayment period. Good for ongoing project costs (renovations that change scope) or as a financial safety net. M8 will surface our wholesale HELOC partners' current pricing.",
      },
      {
        title: "Home equity loan (second mortgage)",
        body: "A lump sum at a fixed rate, separate from your primary mortgage. Good when you know the exact amount you need and want payment certainty. Typically higher rate than cash-out refi but doesn't touch your first lien.",
      },
      {
        title: "Cash-out refinance",
        body: "Replace your existing mortgage with a larger one and pocket the difference. Best when current rates are lower than your existing rate, or when you want to consolidate everything into one payment. M8 runs the comparison against HELOC and home equity loan so you see the trade-offs clearly.",
      },
    ],
    cta: "Compare all three with M8",
  },

  loanTypes: {
    eyebrow: "LOAN PROGRAMS",
    heading: "Every program. Plain English.",
    intro:
      "There's no single 'best' mortgage. There's the program that fits your situation. Here's a working person's guide to the programs M8 will shop for you.",
    items: [
      {
        name: "Conventional",
        body: "The default. Conforming loans backed by Fannie Mae or Freddie Mac. Best rates if your credit and down payment are solid. PMI required under 20% down, but it drops off automatically at 78% LTV.",
        bestFor: "Strong credit, 5–20% down, owner-occupied or investment.",
      },
      {
        name: "FHA",
        body: "Government-insured loan with looser credit requirements and as little as 3.5% down. The trade-off: mortgage insurance (MIP) typically stays for the life of the loan, even after you hit 20% equity.",
        bestFor: "Credit under 680, low down payment, first-time buyers.",
      },
      {
        name: "VA",
        body: "Zero down payment, no PMI, often the best rates available. Funded by lenders, guaranteed by the VA. If you're eligible, this is almost always the right choice.",
        bestFor: "Active military, veterans, eligible surviving spouses.",
      },
      {
        name: "USDA",
        body: "Zero down payment for properties in eligible rural areas (and many suburban areas qualify — check the map). Income limits apply.",
        bestFor: "Rural or eligible-suburban properties, moderate income.",
      },
      {
        name: "Jumbo",
        body: "Loan amounts above the conforming limit (higher in WA and CA high-cost areas). Stricter underwriting, often competitive rates if you have strong assets.",
        bestFor: "Higher-priced homes, strong credit and reserves.",
      },
      {
        name: "Non-QM / Bank Statement",
        body: "Alternative documentation loans for self-employed borrowers, real estate investors, or borrowers whose tax returns don't reflect their real income. Higher rates, but the only path for some borrowers.",
        bestFor: "Self-employed, 1099, asset-rich borrowers.",
      },
    ],
  },

  tools: {
    eyebrow: "TOOLS",
    heading: "Calculators that don't lie to you.",
    intro:
      "Most mortgage calculators leave out half the costs. These don't. Run the numbers, then talk to M8 if you want a real picture of what you can actually afford.",
    items: [
      {
        title: "Affordability calculator",
        body: "What you can actually afford — including PITI, HOA, and a realistic monthly comfort buffer. Not the bank's maximum.",
        status: "Coming with platform launch",
      },
      {
        title: "Refi breakeven calculator",
        body: "Months until your refinance pays for itself, given the rate drop and fees. The number lenders won't show you.",
        status: "Coming with platform launch",
      },
      {
        title: "Rate buy-down calculator",
        body: "Whether paying points actually makes sense for your timeline. The answer is usually no.",
        status: "Coming with platform launch",
      },
      {
        title: "HELOC vs. Cash-out comparison",
        body: "Side-by-side: monthly payment, total cost over 10 years, tax implications, breakeven.",
        status: "Coming with platform launch",
      },
    ],
  },

  rates: {
    eyebrow: "LIVE RATES",
    heading: "We don't post a rate page yet. On purpose.",
    body: `Every mortgage site you've ever visited posts a 'today's rate' that doesn't match what you'll actually be quoted. We won't do that. When we publish live rates, they'll be real wholesale-panel pricing tied to your scenario — not a bait number. That ships with the platform in Stage 3. For now, talk to M8 (coming soon) or book a 15-minute call with ${ANCHOR_LO.firstName}.`,
    cta: "Book a call to get a real quote",
  },

  aboutPage: {
    eyebrow: "ABOUT",
    heading: "One loan officer. Four states. No call center.",
    sub: `${ANCHOR_LO.name} is an NMLS-licensed mortgage loan originator authorized in ${STATE_LIST_LONG}. Every loan on this platform is closed personally by ${ANCHOR_LO.firstName} through a panel of wholesale lender partners. No call center. No transfers. One loan officer, start to close.`,
    sections: [
      {
        title: "Why RateM8 exists",
        body: `[${ANCHOR_LO.firstName}'s personal story goes here — a few paragraphs about why the existing mortgage shopping experience is broken, what you saw working with borrowers that frustrated you, and what RateM8 is meant to fix. Keep it specific, keep it honest. Avoid platitudes.]`,
      },
      {
        title: "The wholesale-broker advantage",
        body: "A wholesale broker shops dozens of lenders on each file. A retail bank only sells you their own loans. That structural difference is why broker channel pricing usually beats retail bank pricing for the same borrower. RateM8 is a broker operation. Every loan file gets shopped — same algorithm, every time.",
      },
      {
        title: "What M8 is, what M8 isn't",
        body: `M8 is the AI assistant built into the platform. It runs conversations, surfaces rate options, and generates written rate strategies you can keep. M8 is not a loan officer — it doesn't sign anything, it doesn't commit to anything, and it doesn't make the final call on whether a loan is right for you. That's ${ANCHOR_LO.firstName}'s job. M8 does the math. ${ANCHOR_LO.firstName} verifies the deal.`,
      },
    ],
  },

  contact: {
    eyebrow: "CONTACT",
    heading: "One human. No call center.",
    sub: `RateM8 is ${ANCHOR_LO.name}. There is no IVR, no support tier system, no offshore call center. If you email or call, you reach ${ANCHOR_LO.firstName}. If ${ANCHOR_LO.firstName} is in a closing, they'll get back to you within the business day.`,
    email: ANCHOR_LO.email,
    phone: ANCHOR_LO.phone,
  },
};
