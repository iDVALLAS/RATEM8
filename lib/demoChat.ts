/**
 * Demo conversation data for the M8 chat preview.
 *
 * This is a static, pre-scripted demo that lets visitors see
 * what a real M8 conversation will look like. The chat is NOT
 * connected to Claude API yet — that ships in v8.
 *
 * Compliance:
 *  - Footer disclosure on the page says "Sample conversation.
 *    Live pricing not yet active." (UDAAP protection)
 *  - All rate numbers are indicative examples, clearly labeled
 *    "Indicative pricing · Subject to verification · Soft pull only"
 *  - Loan officer name + NMLS pulled from lib/licensing.ts
 *    (ANCHOR_LO) — single source of truth.
 *  - "49 STATES" badge represents platform-wide coverage via the
 *    multi-LO network, NOT the anchor LO's personal licensing.
 *    Pending compliance attorney scoping memo on whether this card
 *    needs to be state-dynamic when displayed alongside a named
 *    individual MLO. Documented for review.
 */

import { ANCHOR_LO } from "./licensing";

export const demoChat = {
  scenario: {
    loanAmount: "$640,000",
    propertyValue: "$1.1M",
    creditEstimate: "760+",
    loanPurpose: "Rate/term refi",
    occupancy: "Primary",
    location: "98004 · WA",
  },

  market: {
    rate: "6.625%",
    label: "30yr conf",
    change: "−0.125 today",
  },

  bestQuote: {
    rate: "6.375%",
    detail: "30yr · 0.5 pts · UWM",
  },

  conversations: [
    { id: "1", title: "Refinance — primary home", active: true },
    { id: "2", title: "Cash-out scenarios", active: false },
    { id: "3", title: "Investment property", active: false },
  ],

  tools: ["Rate watch", "Strategy briefs", "Documents", "Audit log"],

  messages: [
    {
      role: "user",
      sender: "Sarah",
      avatar: "SM",
      time: "11:42 AM",
      content:
        "I'm thinking about refinancing my home in Bellevue. Currently at 7.25% on a $640k balance. What can you actually do for me right now?",
    },
    {
      role: "m8",
      sender: "M8",
      avatar: "M8",
      time: "11:42 AM",
      label: "PRICING PULLED LIVE",
      content: [
        "Straight answer: with 760+ credit on a $640k primary in 98004, you're looking at 6.375% to 6.625% across our wholesale panel right now. Real improvement over your 7.25%.",
        "Here are the three options that meet the anti-steering requirements — lowest rate, lowest rate with no risky features, and lowest fees. All from lenders Jason closes with regularly.",
      ],
      rateTable: true,
    },
    {
      role: "m8",
      sender: "M8",
      avatar: "M8",
      time: "11:42 AM",
      content: [
        'Bottom line: option 01 saves you about $743/month and roughly $14,200 over the next 5 years, even after the points. The real question isn\'t "which rate" — it\'s whether you\'re staying in the house long enough to make the math work. Let\'s figure that out.',
      ],
      scenarioPills: true,
    },
    {
      role: "user",
      sender: "Sarah",
      avatar: "SM",
      time: "11:44 AM",
      content:
        "We're probably here another 6–8 years. Would it be smarter to take the no-points option even though the rate is higher?",
    },
    {
      role: "m8",
      sender: "M8",
      avatar: "M8",
      time: "11:44 AM",
      label: "SCENARIO MODELED",
      content: [
        "Good instinct to ask. At 6–8 years, the math favors paying the points — but not by as much as you'd expect. Here's the full picture.",
      ],
      holdAnalysis: true,
    },
    {
      role: "m8",
      sender: "M8",
      avatar: "M8",
      time: "11:44 AM",
      content: [
        "The points win, but by only ~$4–5k over 7 years — not life-changing money. Here's what I'd weigh more heavily: if rates drop meaningfully in the next 2–3 years and you'd consider refinancing again, the points become a sunk cost. Option 02 keeps your options open.",
        "This is a judgment call, not just a math problem. Want me to loop in Jason? He has all this context now and can talk it through in 10 minutes.",
      ],
    },
  ],

  rateOptions: [
    {
      rank: "01",
      lender: "UWM",
      designation: "LOWEST TOTAL COST",
      rate: "6.375%",
      apr: "APR 6.48%",
      payment: "$3,994",
      paymentType: "/mo · P&I",
      pointsLabel: "0.5 pts",
      pointsDetail: "$3,200 · ~22mo break-even",
      selected: true,
    },
    {
      rank: "02",
      lender: "Rocket Pro TPO",
      designation: "LOWEST RATE · NO RISKY FEATURES",
      rate: "6.5%",
      apr: "APR 6.58%",
      payment: "$4,045",
      paymentType: "/mo · P&I",
      pointsLabel: "0 pts",
      pointsDetail: "No discount points",
      selected: false,
    },
    {
      rank: "03",
      lender: "Kind Lending",
      designation: "LOWEST ORIGINATION FEES",
      rate: "6.625%",
      apr: "APR 6.69%",
      payment: "$4,096",
      paymentType: "/mo · P&I",
      pointsLabel: "0 pts · $695 orig",
      pointsDetail: "Minimum cost to close",
      selected: false,
    },
  ],

  scenarioPills: [
    { label: "credit", value: "760+" },
    { label: "balance", value: "$640,000" },
    { label: "value", value: "~$1.1M est" },
    { label: "LTV", value: "58%" },
    { label: "property", value: "Primary · 98004" },
    { label: "type", value: "Conventional · 30yr" },
  ],

  holdAnalysis: [
    { label: "OPTION 01 · UWM", amount: "$338,096", note: "Total cost · incl. points" },
    { label: "OPTION 02 · ROCKET PRO", amount: "$342,210", note: "+$4,114 over 7yr" },
    { label: "OPTION 03 · KIND", amount: "$343,108", note: "+$5,012 over 7yr" },
  ],

  followups: [
    "What if rates drop 0.5% next year?",
    "Show me a 15-year scenario",
    "Loop in Jason",
    "Generate a strategy brief",
  ],

  m8Code: [
    { n: "01", text: "One loan officer, every option — no handoffs" },
    { n: "02", text: "Soft pull only · No trigger leads, ever" },
    { n: "03", text: "14-lender wholesale panel · Every file" },
    { n: "04", text: "All-in pricing surfaced upfront" },
    { n: "05", text: "AI shops · A licensed human verifies" },
  ],

  loanOfficer: {
    name: ANCHOR_LO.name,
    // "49 STATES" suffix is platform-coverage messaging via the multi-LO
    // network — NOT the anchor LO's personal licensing. Compliance review
    // pending; see the comment block at the top of this file.
    nmls: `NMLS #${ANCHOR_LO.nmls} · 49 STATES`,
    bio: "17 years originating · Avg close: 18 days · Available now · in office",
  },

  user: {
    name: "Sarah M.",
    avatar: "SM",
  },
};

export type DemoChat = typeof demoChat;
