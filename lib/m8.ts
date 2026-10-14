/**
 * lib/m8.ts — M8 model configuration and shared chat types.
 *
 * The system prompt itself lives in lib/prompts/m8-system.ts (DRAFT —
 * requires compliance counsel review before any deployment) and is
 * built from lib/config.ts facts by `buildM8SystemPrompt()`.
 *
 * Only the password-gated tester preview (/demo → Live M8 tab →
 * /api/m8-chat) talks to a model. The public /chat route never does
 * while CONFIG.featureFlags.chatLiveAi is false.
 */

import { buildM8SystemPrompt } from "@/lib/prompts/m8-system";

/** Model choice. One string swap to change it. */
export const M8_MODEL = "claude-sonnet-4-6";

/** Max tokens per response. Enough for a substantial explanation. */
export const M8_MAX_TOKENS = 1024;

/**
 * The M8 system prompt with every config fact interpolated. Built per
 * call so a config change (new MLO, new state) is picked up without a
 * restart. This is the only thing the API route sends as `system`.
 */
export function getM8SystemPrompt(): string {
  return buildM8SystemPrompt();
}

/**
 * Type-safe chat message shape used across client and server.
 * Keep in sync with app/api/m8-chat/route.ts ChatMessage type.
 */
export type M8Message = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Storage key for the tester preview's conversation history
 * (localStorage, tester's own browser). A real retention store
 * replaces this before any public launch.
 */
export const M8_SESSION_KEY = "loanm8_m8_conversation_v10";
