import Anthropic from "@anthropic-ai/sdk";
import { M8_PLACEHOLDER_SYSTEM_PROMPT, M8_MODEL, M8_MAX_TOKENS } from "@/lib/m8";

/**
 * POST /api/m8-chat  (v10.0 infrastructure only)
 *
 * Streams a response from Claude API back to the browser as
 * Server-Sent Events. The client (ChatExperience.tsx) reads
 * the stream and appends tokens to the visible message.
 *
 * WHAT THIS IS (v10.0):
 *  - Plumbing only. Placeholder system prompt.
 *  - Proves the pipeline works: message in, streamed response out.
 *  - No real M8 personality yet — that's v10.1.
 *  - No compliance guardrails yet — that's v10.2.
 *
 * WHAT THIS IS NOT:
 *  - Ready for real borrowers. Do NOT lift the /demo password
 *    gate until v10.2 ships AND a compliance attorney reviews
 *    the system prompt in v10.1.
 *
 * REQUEST FORMAT:
 *   {
 *     messages: [
 *       { role: "user" | "assistant", content: string },
 *       ...
 *     ]
 *   }
 *
 *   The client sends the full conversation history each request.
 *   Claude API is stateless — memory lives in the client.
 *
 * RESPONSE FORMAT:
 *   Server-Sent Events stream. Each event is a chunk of text.
 *   The client accumulates chunks into the visible message.
 *
 * ENV REQUIRED:
 *   ANTHROPIC_API_KEY — from console.anthropic.com
 *
 * SAFETY DEFAULTS (v10.0):
 *  - Rejects requests with no messages
 *  - Rejects requests with more than 100 messages (loose conversation limit)
 *  - Rejects requests with individual messages over 4000 chars
 *  - Logs each request with IP + timestamp (server-side console)
 *  - Fail-closed if ANTHROPIC_API_KEY isn't set
 *
 * These aren't real compliance guardrails — those come in v10.2.
 * These are basic hygiene so bugs don't burn through your API budget.
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
  // Must end with a user message (otherwise there's nothing for Claude to answer)
  const last = input[input.length - 1];
  if (last.role !== "user") return null;
  return input as ChatMessage[];
}

// --------- Route handler ---------

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fail closed. If the key isn't set, don't accidentally run.
  if (!apiKey) {
    console.error("[m8-chat] ANTHROPIC_API_KEY not set");
    return new Response(
      JSON.stringify({
        ok: false,
        error: "M8 is temporarily unavailable. Email jason@ratem8.com.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse and validate body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Bad request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const messages = validateMessages(body.messages);
  if (!messages) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Message list is invalid. Try refreshing.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Log the request. v10.2 will add real audit logging; this is for dev visibility.
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  console.log("[m8-chat] request", {
    timestamp: new Date().toISOString(),
    ip,
    messageCount: messages.length,
    lastMessageLength: messages[messages.length - 1].content.length,
  });

  // --------- Stream from Claude API ---------

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = client.messages.stream({
          model: M8_MODEL,
          max_tokens: M8_MAX_TOKENS,
          system: M8_PLACEHOLDER_SYSTEM_PROMPT,
          messages,
        });

        // Forward each text delta to the client as an SSE event
        claudeStream.on("text", (text: string) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
          );
        });

        // Signal completion
        claudeStream.on("finalMessage", () => {
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        });

        claudeStream.on("error", (err: unknown) => {
          console.error("[m8-chat] stream error", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "M8 hit a snag mid-response. Try again.",
              })}\n\n`
            )
          );
          controller.close();
        });

        // Await the underlying promise so errors propagate cleanly
        await claudeStream.finalMessage();
      } catch (err) {
        console.error("[m8-chat] handler error", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: "M8 couldn't reach the model. Try again in a moment.",
            })}\n\n`
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
