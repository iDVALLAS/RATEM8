/**
 * lib/m8.ts — M8 model configuration and shared chat types.
 *
 * Imported by the chat UI (a client component), so it must never import
 * the system prompt. The prompt is server-only: lib/prompts/m8-system.ts,
 * used by app/api/m8-chat/route.ts alone (C3).
 */

/** Model choice. One string swap to change it. */
export const M8_MODEL = "claude-sonnet-4-6";

/** Max tokens per response. Enough for a substantial explanation. */
export const M8_MAX_TOKENS = 1024;

/**
 * Type-safe chat message shape used across client and server.
 * Keep in sync with app/api/m8-chat/route.ts ChatMessage type.
 */
export type M8Message = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Storage key for the conversation in the borrower's own browser
 * (localStorage). Server-side transcript storage comes in C4.
 */
export const M8_SESSION_KEY = "loanm8_m8_conversation_v10";
