/**
 * lib/m8/client.ts — one M8 turn from the browser (C17). Client-safe.
 * Posts the conversation to /api/m8-chat and reads its Server-Sent Events
 * (lib/m8/shared.ts M8Event). Used by the homepage voice session; the
 * typed chat (components/M8LiveChat.tsx) has its own copy of this loop.
 */
import type { M8Event, M8Message, PricingCard } from "./shared";

export type M8TurnResult = { text: string; pricing?: PricingCard; voice?: string; userText?: string };

export async function streamM8Turn(
  messages: M8Message[],
  opts: { hp?: string; t: number; signal?: AbortSignal; onText?: (soFar: string) => void; fallbackError: string },
): Promise<M8TurnResult> {
  const resp = await fetch("/api/m8-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })), hp: opts.hp ?? "", t: opts.t }),
    signal: opts.signal,
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? opts.fallbackError);
  }
  if (!resp.body) throw new Error(opts.fallbackError);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const out: M8TurnResult = { text: "" };
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      if (!ev.startsWith("data: ")) continue;
      const payload = ev.slice(6).trim();
      if (payload === "[DONE]") continue;
      let e: M8Event;
      try {
        e = JSON.parse(payload) as M8Event;
      } catch {
        continue;
      }
      if (e.error) throw new Error(e.error);
      if (e.userText !== undefined) out.userText = e.userText;
      if (e.pricing) out.pricing = e.pricing;
      if (e.voice) out.voice = e.voice;
      if (e.replace !== undefined) out.text = e.replace;
      if (e.text) out.text += e.text;
      if (e.replace !== undefined || e.text) opts.onText?.(out.text);
    }
  }
  return out;
}
