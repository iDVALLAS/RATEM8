import Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { M8_MODEL, M8_MAX_TOKENS } from "@/lib/m8";
import { buildM8SystemPrompt, m8RoutingFacts } from "@/lib/prompts/m8-system";
import { decodeRoute, ROUTE_HEADER } from "@/lib/routing";

import { CONFIG } from "@/lib/config";

/**
 * The M8 prompt plus the visitor's routing facts (server-only). C1: the
 * example pricing summary is no longer appended. The public chat never
 * quotes example rates; rates come only from the pricing tool (C4).
 */
async function systemPrompt(): Promise<string> {
  // v15: with MLO_ROUTING on, the visitor's route (resolved in middleware)
  // names the matched MLO only, and tells M8 about the mover case.
  const routing = CONFIG.pricing.mloRouting ? m8RoutingFacts(decodeRoute((await headers()).get(ROUTE_HEADER))) : { overrides: {}, section: "" };
  const parts = [buildM8SystemPrompt(routing.overrides)];
  if (routing.section) parts.push(routing.section);
  return parts.join("\n\n");
}

/**
 * POST /api/m8-chat — the live M8 endpoint behind the public /chat (C1).
 *
 * Streams a response from the Claude API back to the browser as
 * Server-Sent Events. The only client is components/M8LiveChat.tsx.
 *
 * SYSTEM PROMPT: lib/prompts/m8-system.ts, built from lib/config.ts facts
 * by systemPrompt(); nothing is hardcoded here. C3 replaces it with the
 * production prompt.
 *
 * GATES: open to everyone since C1 (owner 2026-11-01). The kill switch is
 * M8_LIVE_CHAT="false". Fails closed when ANTHROPIC_API_KEY is unset.
 * C4 adds rate limits, the turn cap, the output guard, PII redaction,
 * moderation and transcript storage (3-year retention).
 *
 * RECORDING: the UI shows the AI disclosure and the recording notice
 * (copy.chat.gate.body) above the input. This route does not store
 * transcripts yet (C4); it logs a timestamp and message counts only.
 *
 * REQUEST:  { messages: [{ role: "user" | "assistant", content }] }
 *           The client sends the full history each time; the model is stateless.
 * RESPONSE: SSE. `data: {"text": "..."}` chunks, `data: [DONE]` at the end,
 *           `data: {"error": "..."}` on failure.
 *
 * HYGIENE: rejects empty lists, >100 messages, messages >4000 chars,
 * and lists that do not end with a user turn.
 */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
};

// --------- Validation helpers ---------

function isValidMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string, unknown>;
  return (
    (msg.role === "user" || msg.role === "assistant") &&
    typeof msg.content === "string" &&
    msg.content.length > 0 &&
    msg.content.length <= 4000
  );
}

function validateMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0 || input.length > 100) return null;
  if (!input.every(isValidMessage)) return null;
  // Must end with a user message (otherwise there's nothing to answer)
  const last = input[input.length - 1];
  if (last.role !== "user") return null;
  return input as ChatMessage[];
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --------- Route handler ---------

export async function POST(req: Request) {
  // Kill switch: M8_LIVE_CHAT="false" turns the live chat off.
  if (!CONFIG.featureFlags.liveChat) {
    return json(503, { ok: false, error: `M8 is offline right now. Email ${CONFIG.contactEmail}.` });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fail closed. If the key isn't set, don't accidentally run.
  if (!apiKey) {
    console.error("[m8-chat] ANTHROPIC_API_KEY not set");
    return json(503, {
      ok: false,
      error: `M8 is temporarily unavailable. Email ${CONFIG.contactEmail}.`,
    });
  }

  // Parse and validate body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { ok: false, error: "Bad request" });
  }

  const messages = validateMessages(body.messages);
  if (!messages) {
    return json(400, { ok: false, error: "Message list is invalid. Try refreshing." });
  }

  // Counts only: never the text, never the IP (C1, now that it's public).
  console.log("[m8-chat] request", {
    timestamp: new Date().toISOString(),
    messageCount: messages.length,
    lastMessageLength: messages[messages.length - 1].content.length,
  });

  // --------- Stream from the Claude API ---------

  const client = new Anthropic({ apiKey });
  const system = await systemPrompt();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: M8_MODEL,
          max_tokens: M8_MAX_TOKENS,
          system,
          messages,
        });

        // Forward each text delta to the client as an SSE event
        claudeStream.on("text", (text: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        });

        // Signal completion
        claudeStream.on("finalMessage", () => {
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        });

        claudeStream.on("error", (err: unknown) => {
          console.error("[m8-chat] stream error", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "M8 hit a snag mid-response. Try again." })}\n\n`)
          );
          controller.close();
        });

        // Await the underlying promise so errors propagate cleanly
        await claudeStream.finalMessage();
      } catch (err) {
        console.error("[m8-chat] handler error", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "M8 couldn't reach the model. Try again in a moment." })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // prevent nginx/proxies from buffering
    },
  });
}
