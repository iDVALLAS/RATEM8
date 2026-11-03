import Anthropic from "@anthropic-ai/sdk";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { buildM8SystemPrompt, m8PromptVars } from "@/lib/prompts/m8-system";
import { decodeRoute, ROUTE_HEADER } from "@/lib/routing";
import { nameableMlo, type MloContextValue } from "@/lib/mlo-match";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { M8_MAX_TOKENS, m8Model } from "@/lib/m8/server";
import { prepareTurn, runM8Turn } from "@/lib/m8/pipeline";
import { checkRateLimit, countTurn, hashIp, recordUsage, underDailyBudget } from "@/lib/m8/limits";
import { deleteSession, saveTranscript } from "@/lib/m8/store";
import type { M8Event, M8Message } from "@/lib/m8/shared";
import { report } from "@/lib/monitoring";

/**
 * /api/m8-chat — the live M8 endpoint behind the public /chat (C1, hardened in C4).
 *
 * POST: one turn, streamed back as Server-Sent Events (lib/m8/shared.ts M8Event).
 *  1. Kill switch (M8_LIVE_CHAT="false") and the API key; both fail closed.
 *  2. Body checks: 1–100 messages, each 1–4000 characters, ending with the
 *     borrower; the honeypot is empty; the first message isn't instant.
 *  3. Limits (lib/m8/limits.ts): per-IP (hashed) and per-session rates,
 *     40 turns per session, the daily token budget.
 *  4. lib/m8/pipeline.ts: redact SSN/DOB/account numbers, block abuse, stream
 *     the model with only get_pricing and request_handoff, and guard every
 *     slice of the reply.
 *  5. After the response: save the redacted transcript (Neon, 3 years) and
 *     add the tokens to today's budget.
 *
 * DELETE: "Delete my chat". Removes this session's transcript and handoffs.
 *
 * SYSTEM PROMPT: lib/prompts/m8-system.ts (C3), filled per request; never
 * sent to the browser. Logs carry counts and reasons only, never text or IPs.
 */

const SESSION_COOKIE = "lm8_chat_sid";
const NOTICE_VERSION = "c4-2026-11-02";
const FIRST_MESSAGE_MIN_MS = 800;

type Body = { messages?: unknown; hp?: unknown; t?: unknown };

function isValidMessage(m: unknown): m is M8Message {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string, unknown>;
  return (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string" && msg.content.length > 0 && msg.content.length <= 4000;
}

function validateMessages(input: unknown): M8Message[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) return null;
  if (!input.every(isValidMessage)) return null;
  return input[input.length - 1].role === "user" ? (input as M8Message[]) : null;
}

function json(status: number, body: Record<string, unknown>, cookie?: string): Response {
  const h = new Headers({ "Content-Type": "application/json" });
  if (cookie) h.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers: h });
}

function sessionCookie(sid: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${sid}; Path=/; Max-Age=${30 * 86_400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

async function visitorRoute(): Promise<MloContextValue | null> {
  return CONFIG.pricing.mloRouting ? decodeRoute((await headers()).get(ROUTE_HEADER)) : null;
}

export async function POST(req: Request) {
  if (!CONFIG.featureFlags.liveChat) {
    return json(503, { ok: false, error: copy.chat.live.offline.replace("{email}", CONFIG.contactEmail) });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[m8-chat] ANTHROPIC_API_KEY not set");
    return json(503, { ok: false, error: `M8 is temporarily unavailable. Email ${CONFIG.contactEmail}.` });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, error: "Bad request" });
  }
  const messages = validateMessages(body.messages);
  if (!messages) return json(400, { ok: false, error: "Message list is invalid. Try refreshing." });

  // Session: a random id in a first-party, httpOnly cookie (rate limits, turn cap, transcript, delete).
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  const sid = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : crypto.randomUUID();
  const secure = new URL(req.url).protocol === "https:";
  const setCookie = existing === sid ? undefined : sessionCookie(sid, secure);

  // Bot protection on the first message: a filled honeypot, or a send faster than a person can.
  const firstMessage = messages.filter((m) => m.role === "user").length === 1;
  if ((typeof body.hp === "string" && body.hp.length > 0) || (firstMessage && !(typeof body.t === "number" && body.t >= FIRST_MESSAGE_MIN_MS))) {
    console.warn("[m8-chat] blocked: bot check");
    return json(400, { ok: false, error: copy.chat.live.botBlocked }, setCookie);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = await hashIp(ip);
  if (!(await checkRateLimit(ipHash, sid)).ok) {
    console.warn("[m8-chat] blocked: rate limit");
    return json(429, { ok: false, error: copy.chat.live.rateLimited }, setCookie);
  }
  if (!(await underDailyBudget())) {
    console.warn("[m8-chat] blocked: daily budget");
    return json(503, { ok: false, error: copy.chat.live.dailyCap }, setCookie);
  }

  const turn = prepareTurn(messages);
  const turns = await countTurn(sid, turn.userTurns);
  if (!turns.ok) {
    console.warn("[m8-chat] blocked: turn cap");
    return json(429, { ok: false, error: copy.chat.live.turnLimit }, setCookie);
  }

  const route = await visitorRoute();
  const vars = m8PromptVars(route);
  const mlo = route ? nameableMlo(route) : null;
  const stateCode = route?.stateCode ?? null;
  const twoParty = !!CONFIG.states.find((s) => s.code === stateCode)?.twoPartyConsent;
  console.log("[m8-chat] request", { messageCount: messages.length, userTurns: turn.userTurns, redacted: turn.redacted.length > 0 });

  const encoder = new TextEncoder();
  const respHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (setCookie) respHeaders.append("Set-Cookie", setCookie);

  // After the response: the budget and the transcript. `after` must be
  // registered during the request, so it waits on the stream's outcome.
  type Outcome = { reply: string; tokens: number; guard: string | null; error: unknown };
  let finish: (r: Outcome) => void = () => {};
  const finished = new Promise<Outcome>((resolve) => (finish = resolve));
  after(async () => {
    const { reply, tokens, guard, error } = await finished;
    // C5: Sentry (when SENTRY_DSN is set). Reasons and error names only, never text.
    if (error) await report("error", error, { route: "m8-chat", stage: "model" });
    if (guard) await report("warning", new Error(`guard replaced a reply: ${guard}`), { route: "m8-chat", guard });
    await recordUsage(tokens);
    if (reply) {
      await saveTranscript(sid, [...turn.messages, { role: "assistant", content: reply }], {
        state: stateCode,
        mloId: mlo?.id ?? null,
        noticeVersion: NOTICE_VERSION,
        twoPartyState: twoParty,
      });
    }
  });

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: M8Event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      let reply = "";
      let tokens = 0;
      let guard: string | null = null;
      let error: unknown = null;
      try {
        if (turn.redacted.length) emit({ userText: turn.lastUserText, notice: copy.chat.live.redactedNotice });
        if (turn.abusive) {
          console.warn("[m8-chat] moderation: abusive input");
          reply = copy.chat.live.moderation;
          emit({ text: reply });
        } else {
          const result = await runM8Turn({
            client: new Anthropic({ apiKey }),
            model: m8Model(),
            maxTokens: M8_MAX_TOKENS,
            system: buildM8SystemPrompt(vars),
            turn,
            tools: { sessionId: sid, mloId: mlo?.id ?? null, mloName: mlo?.name ?? null, state: route?.stateName ?? null },
            mloName: vars.mloName,
            emit,
          });
          reply = result.reply;
          tokens = result.tokens;
          guard = result.guard;
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (err) {
        error = err;
        console.error("[m8-chat] model error", err instanceof Error ? err.message : "unknown");
        emit({ error: "M8 couldn't reach the model. Try again in a moment." });
      } finally {
        controller.close();
        finish({ reply, tokens, guard, error });
      }
    },
  });

  return new Response(stream, { headers: respHeaders });
}

/** "Delete my chat": deletes this session's stored transcript and handoff requests. */
export async function DELETE() {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid && /^[0-9a-f-]{36}$/.test(sid)) await deleteSession(sid);
  console.log("[m8-chat] delete requested");
  // Expire the cookie so the next chat starts a new session.
  return json(200, { ok: true }, `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}
