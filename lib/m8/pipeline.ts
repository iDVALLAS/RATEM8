/**
 * lib/m8/pipeline.ts — one M8 turn, from the borrower's message to the
 * guarded reply (C4). The route (app/api/m8-chat/route.ts) adds HTTP,
 * cookies and limits around it; the red-team suite drives it directly.
 *
 * Order:
 *  1. prepareTurn: redact every user message (SSN, DOB, account numbers),
 *     check the last one for abuse, count user turns.
 *  2. runM8Turn: stream the model with the two allowed tools, run any tool
 *     calls (validated), and pass every slice of text through the output
 *     guard. A failed check stops the stream and replaces the reply.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { copy } from "@/lib/copy";
import { redactChatInput, type RedactionKind } from "./redact";
import { isAbusive } from "./moderation";
import { guardReply, userPercentages, type GuardReason } from "./guard";
import { M8_TOOLS, pricedRates, runTool, type PricingResult, type ToolContext } from "./tools";
import type { M8Event, M8Message } from "./shared";

export type PreparedTurn = {
  messages: M8Message[];
  redacted: RedactionKind[];
  lastUserText: string;
  abusive: boolean;
  userTurns: number;
  userStated: Set<string>;
};

export function prepareTurn(messages: M8Message[]): PreparedTurn {
  const kinds = new Set<RedactionKind>();
  const out = messages.map((m) => {
    if (m.role !== "user") return m;
    const r = redactChatInput(m.content);
    r.kinds.forEach((k) => kinds.add(k));
    return { ...m, content: r.text };
  });
  const users = out.filter((m) => m.role === "user").map((m) => m.content);
  const lastUserText = users[users.length - 1] ?? "";
  return { messages: out, redacted: [...kinds], lastUserText, abusive: isAbusive(lastUserText), userTurns: users.length, userStated: userPercentages(users) };
}

/** The reply that replaces a guarded one. `name` is the loan officer (or a generic phrase). */
export function fallbackFor(reason: GuardReason, name: string): string {
  const g = copy.chat.live.guard;
  const t = reason === "prompt-leak" ? g.promptLeak : reason === "promise" ? g.promise : reason === "sensitive-echo" ? g.sensitive : g.rate;
  const filled = t.replaceAll("{name}", name);
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}

export type TurnResult = { reply: string; guard: GuardReason | null; tokens: number };

const MAX_TOOL_ROUNDS = 3;

export async function runM8Turn(opts: {
  client: Anthropic;
  model: string;
  maxTokens: number;
  system: string;
  turn: PreparedTurn;
  tools: ToolContext;
  /** The loan officer's name for fallback text, or a generic phrase. */
  mloName: string;
  emit: (e: M8Event) => void;
}): Promise<TurnResult> {
  const { client, turn, emit } = opts;
  const api: Anthropic.Messages.MessageParam[] = turn.messages.map((m) => ({ role: m.role, content: m.content }));
  let reply = "";
  let tokens = 0;
  let pricing: PricingResult | undefined;

  const fail = (reason: GuardReason): TurnResult => {
    const text = fallbackFor(reason, opts.mloName);
    emit({ replace: text });
    console.warn(`[m8-chat] guard replaced a reply: ${reason}`);
    return { reply: text, guard: reason, tokens };
  };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const allowed = pricedRates(pricing);
    const stream = client.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: api,
      tools: round < MAX_TOOL_ROUNDS ? M8_TOOLS : undefined,
    });
    let blocked: GuardReason | null = null;
    const sep = reply && !reply.endsWith("\n") ? "\n\n" : "";
    let roundText = "";
    stream.on("text", (t: string) => {
      if (blocked) return;
      roundText += t;
      const check = guardReply(reply + sep + roundText, allowed, turn.userStated, true);
      if (!check.ok) {
        blocked = check.reason;
        stream.abort();
        return;
      }
      emit({ text: (roundText === t ? sep : "") + t });
    });
    let final: Anthropic.Messages.Message;
    try {
      final = await stream.finalMessage();
    } catch (e) {
      if (blocked) return fail(blocked);
      throw e;
    }
    if (blocked) return fail(blocked);
    tokens += (final.usage?.input_tokens ?? 0) + (final.usage?.output_tokens ?? 0);
    if (roundText) reply += sep + roundText;

    if (final.stop_reason !== "tool_use") break;
    const calls = final.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    api.push({ role: "assistant", content: final.content });
    const results: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const run = await runTool(call.name, call.input, opts.tools);
      if (run.pricing) pricing = run.pricing;
      results.push({ type: "tool_result", tool_use_id: call.id, content: run.content, is_error: run.isError });
    }
    api.push({ role: "user", content: results });
  }

  // Final check on the whole reply (rates need their APR and disclosure once complete).
  const check = guardReply(reply, pricedRates(pricing), turn.userStated);
  if (!check.ok) return fail(check.reason);
  return { reply, guard: null, tokens };
}
