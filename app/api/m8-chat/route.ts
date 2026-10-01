import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { getM8SystemPrompt, M8_MODEL, M8_MAX_TOKENS } from "@/lib/m8";
import { exampleSummaryText } from "@/lib/pricing/summary";

import { CONFIG } from "@/lib/config";

/** The M8 prompt plus, when example pricing is on, the computed example figures (server-only). */
function systemPrompt(): string {
  const base = getM8SystemPrompt();
  return CONFIG.pricing.demoExamples ? `${base}\n\n${exampleSummaryText()}` : base;
}

/**
 * POST /api/m8-chat — the tester-only live M8 endpoint.
 *
 * Streams a response from the Claude API back to the browser as
 * Server-Sent Events. The only client is components/M8LiveChat.tsx,
 * rendered on /demo behind the tester password. The public /chat
 * route never calls this while CONFIG.featureFlags.chatLiveAi is false.
 *
 * SYSTEM PROMPT: lib/prompts/m8-system.ts (DRAFT — requires compliance
 * counsel review before any deployment). Built from lib/config.ts facts
 * by systemPrompt(); nothing is hardcoded here.
 *
 * RECORDING / CONSENT NOTE:
 *  - The UI shows the AI disclosure and the recording notice
 *    (copy.chat.gate.body) above the input before any message is sent.
 *  - This route does NOT yet persist transcripts. It logs only a
 *    timestamp, IP, and message count to the server console for dev
 *    visibility. Before any public launch: (a) counsel confirms the
 *    retention period in copy.chat.gate.recording, (b) transcripts are
 *    stored with that retention and a transcript-on-request path,
 *    (c) two-party consent states (CONFIG.states[].twoPartyConsent) get
 *    an explicit consent record before the first message.
 *
 * GATE: the request must carry the same demo auth cookie that
 * app/demo/page.tsx validates (SHA-256 of "loanm8:" + DEMO_PASSWORD).
 * middleware.ts leaves /api/* public, so the route checks it itself.
 * Fails closed when DEMO_PASSWORD or ANTHROPIC_API_KEY is unset.
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

// --------- Gate (mirrors app/demo/page.tsx; keep the two in sync) ---------

async function hashPassword(pw: string): Promise<string> {
  if (!pw) return "";
  const data = new TextEncoder().encode("loanm8:" + pw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isTesterAuthed(): Promise<boolean> {
  const expected = await hashPassword(process.env.DEMO_PASSWORD || "");
  if (!expected) return false;
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("loanm8_demo_auth");
  return !!authCookie && authCookie.value === expected;
}

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
  // Tester gate first. Same cookie the /demo page validates.
  if (!(await isTesterAuthed())) {
    return json(401, { ok: false, error: "Tester access required." });
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

  // Dev-visibility log only. See RECORDING / CONSENT NOTE above.
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  console.log("[m8-chat] request", {
    timestamp: new Date().toISOString(),
    ip,
    messageCount: messages.length,
    lastMessageLength: messages[messages.length - 1].content.length,
  });

  // --------- Stream from the Claude API ---------

  const client = new Anthropic({ apiKey });
  const system = systemPrompt();

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
