/**
 * Demo conversation data for the M8 chat preview.
 *
 * v21: restored from the v7–v11 build (dropped by the one-shot rebuild).
 * Content is the original Sarah / Bellevue refi / $640K / 98004 script,
 * verbatim, with these deliberate changes (patch log v21):
 *  - The loan officer's name and NMLS come from lib/config.ts (the MLO
 *    assigned to WA), never typed here (check:identity).
 *  - "49 STATES" is now the real licensed-state count from config.
 *  - "14-lender wholesale panel" became "up to {lenderCountMax} lenders",
 *    and "N more lenders shopped" is computed from `lendersShopped`.
 *  - The bio line is the carried-over CONFIG.demo.loBio for that MLO.
 *
 * This is a static, pre-scripted demo. It is NOT connected to the Claude
 * API. Live M8 is the separate, flagged tab on /demo (M8_LIVE_CHAT).
 *
 * Compliance:
 *  - Footer disclosure: "Sample conversation. Live pricing not yet active."
 *  - Every rate card carries EXAMPLE_PRICING_LABEL ("Example — illustrative
 *    pricing, not an offer"); the rate card footer keeps "Indicative
 *    pricing · Subject to verification · Soft pull only". Attorney-cleared
 *    for the demo (owner 2026-10-10). CONFIG.liveRatesEnabled stays false.
 *  - Named lenders (UWM, Rocket Pro TPO, Kind Lending) are the original
 *    demo's; no new named-lender display is added.
 */

import { CONFIG, STATES, mloById } from "./config";
import { lendersFor } from "./pricing/lenders";

const mlo = mloById(CONFIG.routing.stateAssignments.WA) ?? CONFIG.principalMlo;
const first = mlo.firstName;
/** The pronoun the original copy used, from config; neutral otherwise. */
export const demoPronoun = CONFIG.demo.loPronoun[mlo.id] ?? { subject: "They", has: "have", will: "They'll" };

export const demoChat = {
  scenario: {
    loanAmount: "$640,000",
    propertyValue: "$1.1M",
    creditEstimate: "760+",
    loanPurpose: "Rate/term refi",
    occupancy: "Primary",
    location: "98004 · WA",
  },

  /**
   * Lenders shopped for this scenario (the three shown plus the rest).
   * v27: the panel's first-mortgage lenders only (11 of 14); the three
   * HELOC-only programs can't price a rate/term refinance.
   */
  lendersShopped: lendersFor("first_mortgage").length,

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
      // v25 (owner 2026-10-11): no "live" on demo pricing. The date is today's,
      // added at render time (ChatExperience), so it never goes stale.
      label: "EXAMPLE PRICING",
      datedLabel: true,
      content: [
        "Straight answer: with 760+ credit on a $640k primary in 98004, you're looking at 6.375% to 6.625% across our wholesale panel right now. Real improvement over your 7.25%.",
        `Here are the three options that meet the anti-steering requirements — lowest rate, lowest rate with no risky features, and lowest fees. All from lenders ${first} closes with regularly.`,
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
        `This is a judgment call, not just a math problem. Want me to loop in ${first}? ${demoPronoun.subject} ${demoPronoun.has} all this context now and can talk it through in 10 minutes.`,
      ],
    },
  ] as DemoMessage[],

  rateOptions: [
    {
      rank: "01",
      lender: "UWM",
      lenderKey: "uwm",
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
      lenderKey: "rocket-pro",
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
      lenderKey: "kind",
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
    { label: "OPTION 01 · UWM", lenderKey: "uwm", amount: "$338,096", note: "Total cost · incl. points" },
    { label: "OPTION 02 · ROCKET PRO", lenderKey: "rocket-pro", amount: "$342,210", note: "+$4,114 over 7yr" },
    { label: "OPTION 03 · KIND", lenderKey: "kind", amount: "$343,108", note: "+$5,012 over 7yr" },
  ],

  followups: [
    "What if rates drop 0.5% next year?",
    "Show me a 15-year scenario",
    `Loop in ${first}`,
    "Generate a strategy brief",
  ],

  m8Code: [
    { n: "01", text: "One loan officer, every option — no handoffs" },
    { n: "02", text: "Soft pull only · No trigger leads, ever" },
    { n: "03", text: `Wholesale panel, up to ${CONFIG.lenderCountMax} lenders · Every file` },
    { n: "04", text: "All-in pricing surfaced upfront" },
    { n: "05", text: "AI shops · A licensed human verifies" },
  ],

  loanOfficer: {
    id: mlo.id,
    name: mlo.name,
    firstName: mlo.firstName,
    nmls: `NMLS #${mlo.nmls} · ${STATES.length} STATES`,
    nmlsNumber: mlo.nmls,
    bio: CONFIG.demo.loBio[mlo.id] ?? "",
  },

  user: {
    name: "Sarah M.",
    avatar: "SM",
  },
};

export type DemoMessage = {
  role: "user" | "m8";
  sender: string;
  avatar: string;
  time: string;
  label?: string;
  /** Append today's date to the label ("EXAMPLE PRICING · OCTOBER 11, 2026"). */
  datedLabel?: boolean;
  content: string | string[];
  rateTable?: boolean;
  scenarioPills?: boolean;
  holdAnalysis?: boolean;
};

export type DemoChat = typeof demoChat;

/**
 * Today's calendar date for the demo's example-pricing labels (v25), in the
 * operator's time zone. Computed per request, never at build time.
 */
export function demoAsOf(now: Date = new Date()): string {
  return now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
}

/** A lender as the demo shows it: named (the original demo) or numbered. */
export type DemoLender = { label: string; slug: string | null; index: number };

/**
 * v26: the owner's revert switch. CONFIG.demo.namedLenders false turns the
 * original demo's named lenders into "Lender 1 / 2 / 3" (numbered tiles,
 * no logos), everywhere the demo names them.
 */
export function demoLender(index: number, named: boolean = CONFIG.demo.namedLenders): DemoLender {
  const r = demoChat.rateOptions[index];
  return named ? { label: r.lender, slug: r.lenderKey, index } : { label: `Lender ${index + 1}`, slug: null, index };
}

/**
 * The demo's "… · NAME" strings ("30yr · 0.5 pts · UWM", "OPTION 02 ·
 * ROCKET PRO") with the lender part swapped for "Lender N" when numbered.
 */
export function demoLenderText(text: string, index: number, named: boolean = CONFIG.demo.namedLenders): string {
  if (named) return text;
  const cut = text.lastIndexOf(" · ");
  const head = cut >= 0 ? text.slice(0, cut + 3) : "";
  const label = `Lender ${index + 1}`;
  return head + (text === text.toUpperCase() ? label.toUpperCase() : label);
}
