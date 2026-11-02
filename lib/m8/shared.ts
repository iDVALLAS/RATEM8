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
 */
export type M8Event = { text?: string; replace?: string; userText?: string; notice?: string; error?: string };
