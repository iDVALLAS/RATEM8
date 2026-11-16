/**
 * lib/m8/shared.ts — chat types shared by the browser and the server.
 *
 * Imported by the chat UI (a client component), so it must never import
 * the system prompt or any server module. Model settings live in
 * lib/m8/server.ts; the prompt in lib/prompts/m8-system.ts (C3).
 */

/**
 * Type-safe chat message shape used across client and server.
 * Keep in sync with the request validation in app/api/m8-chat/route.ts.
 */
export type M8Message = {
  role: "user" | "assistant";
  content: string;
  /** C7: a dated example shown as a card under an M8 reply. Display only: never sent to the model. */
  pricing?: PricingCard;
  /** C15: the reply's read-aloud signature (/api/m8-speak). Display only: never sent to the model. */
  voice?: string;
  /** C19: boxes under this reply (show_options). Display only: never sent to the model. */
  actions?: ChatAction[];
};

/** C19: the boxes M8 can put under a reply with the show_options tool. */
export const CHAT_ACTIONS = ["call_loan_officer", "book_time", "upload_loan_estimate"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

/** C7: one of the three options on a dated example card. Figures are computed server-side. */
export type PricingCardOption = {
  option: "lowest_rate" | "lowest_rate_no_risky_features" | "lowest_points_and_fees";
  lender: string;
  rate: number;
  apr: number;
  pointsPct: number;
  pointsDollars: number;
  originationFee: number;
  lenderFees: number;
  lockDays: number;
  /** Principal and interest. */
  payment: number;
  /** First month's mortgage insurance, when the scenario has any. */
  mortgageInsurance: number | null;
  risky: boolean;
};

/** C7: today's priced example for a standard scenario close to the borrower's. */
export type PricingCard = {
  title: string;
  location: string;
  pricedAt: string;
  assumptions: string[];
  eligibleCount: number;
  options: PricingCardOption[];
};

/** Storage key for the conversation in the borrower's own browser (localStorage). */
export const M8_SESSION_KEY = "loanm8_m8_conversation_v10";

/**
 * Server-sent events from /api/m8-chat (C4). One JSON object per event.
 * - text: a slice of M8's reply
 * - replace: the guard replaced the whole reply with this text
 * - userText: the borrower's last message as stored, with sensitive numbers removed
 * - notice: a short note for the borrower (e.g. something was redacted)
 * - error: the reply failed
 * - pricing: C7, a dated example card for this reply
 * - voice: C15, the finished reply's signature for /api/m8-speak (only while voice is on)
 * - say: C18, one finished sentence (or a few) of the reply, signed, to speak right away
 * - sayReset: C18, the guard replaced the reply: stop speaking and drop what's queued
 * - actions: C19, boxes to show under this reply (call, book, …)
 */
export type M8Event = { text?: string; replace?: string; userText?: string; notice?: string; error?: string; pricing?: PricingCard; voice?: string; say?: { text: string; sig: string }; sayReset?: true; actions?: ChatAction[] };
