/**
 * tests/m8-harness.ts — a fake model for the M8 pipeline (C4).
 *
 * Stands in for the Anthropic client's `messages.stream`: it replays a
 * scripted reply (text chunks, optionally a tool call first), honours
 * `abort()` the way the real stream does, and records every request so a
 * test can check the system prompt and the tools that were offered.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type Script = { chunks: string[]; tool?: { name: string; input: unknown } };
export type Call = { system: string; tools: string[]; messages: Anthropic.Messages.MessageParam[] };

export function fakeClient(scripts: Script[]): { client: Anthropic; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const client = {
    messages: {
      stream(params: Anthropic.Messages.MessageCreateParams) {
        calls.push({ system: String(params.system), tools: (params.tools ?? []).map((t) => (t as { name: string }).name), messages: params.messages });
        const script = scripts[Math.min(i++, scripts.length - 1)];
        const handlers: ((t: string) => void)[] = [];
        let aborted = false;
        return {
          on(event: string, fn: (t: string) => void) {
            if (event === "text") handlers.push(fn);
            return this;
          },
          abort() {
            aborted = true;
          },
          async finalMessage(): Promise<Anthropic.Messages.Message> {
            for (const c of script.chunks) {
              if (aborted) throw new Error("Request was aborted.");
              handlers.forEach((h) => h(c));
            }
            if (aborted) throw new Error("Request was aborted.");
            const content: Anthropic.Messages.ContentBlock[] = [];
            if (script.chunks.length) content.push({ type: "text", text: script.chunks.join(""), citations: null } as Anthropic.Messages.TextBlock);
            if (script.tool) content.push({ type: "tool_use", id: `tool_${i}`, name: script.tool.name, input: script.tool.input } as Anthropic.Messages.ToolUseBlock);
            return {
              id: `msg_${i}`,
              type: "message",
              role: "assistant",
              model: "fake",
              content,
              stop_reason: script.tool ? "tool_use" : "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 100, output_tokens: 50 },
            } as unknown as Anthropic.Messages.Message;
          },
        };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

/** Splits a reply into small chunks, like a real stream. */
export function chunk(text: string, size = 7): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
