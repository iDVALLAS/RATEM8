/**
 * lib/m8.ts — M8 configuration and system prompt (v10.0 PLACEHOLDER)
 *
 * This file is the heart of M8's identity. When v10.1 lands, this
 * file becomes the most important document in your business.
 *
 * For v10.0 (infrastructure), the system prompt is deliberately
 * minimal. The point of this patch is proving the plumbing works —
 * a message goes in, a response streams out. No real M8 personality
 * yet, no compliance rules encoded, no borrower-safety guardrails.
 *
 * DO NOT lift the /demo password gate until:
 *   1. v10.1 ships with the real M8 system prompt
 *   2. Your compliance attorney reviews the prompt
 *   3. v10.2 ships with recording consent, audit logging, and
 *      transcript-on-demand
 *
 * Until then, M8 is a friendly but generic mortgage assistant.
 * That's a v10.0 feature, not a bug.
 */

/**
 * Model choice. Claude Sonnet 4.6 is the current recommended balance
 * of instruction-following, latency, and cost for chat products.
 *
 * When Claude 5 lineup ships (or you want faster/cheaper), update here.
 * Just one string swap — nothing else needs to change.
 */
export const M8_MODEL = "claude-sonnet-4-6";

/**
 * Max tokens per response. 1024 is enough for a substantial mortgage
 * explanation but not so much that a runaway response drains your budget.
 * Increase to 2048 or 4096 if borrowers routinely need longer answers.
 */
export const M8_MAX_TOKENS = 1024;

/**
 * PLACEHOLDER system prompt (v10.0).
 *
 * This is deliberately minimal. Just enough for M8 to behave sensibly
 * during infrastructure testing. It's not the real M8 voice, and it
 * doesn't encode the eight principles, anti-steering rules, or hard
 * behavioral constraints.
 *
 * v10.1 will replace this with the real M8 system prompt — the one
 * that encodes brand voice, compliance rules, refusal patterns, and
 * everything else that makes M8 actually M8.
 */
export const M8_PLACEHOLDER_SYSTEM_PROMPT = `You are M8, a helpful assistant on RateM8, a mortgage rate shopping platform.

For this preview build, you help visitors understand mortgages at a high level. You do NOT:
- Quote specific rates (say "I can't quote specific rates in this preview build")
- Promise anyone an approval or lock
- Ask for SSN, birthdate, or anything that could trigger a hard credit pull
- Claim to be human — always be clear you're an AI

Every loan on RateM8 is closed by Jason Shapiro, a licensed loan officer (NMLS #1844143).

You're chatting with a tester who has access to a preview of RateM8. Be friendly, clear, and honest. Keep responses concise unless the tester asks for detail.

If someone asks a specific rate question or wants to actually apply for a loan, let them know the full M8 experience is still in development and they can email jason@ratem8.com to talk directly.`;

/**
 * Type-safe chat message shape used across client and server.
 * Keep in sync with app/api/m8-chat/route.ts ChatMessage type.
 */
export type M8Message = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Session storage key for conversation history in localStorage.
 * v11 will move this to a real database with proper CFPB retention.
 */
export const M8_SESSION_KEY = "ratem8_m8_conversation_v10";
