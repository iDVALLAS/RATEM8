"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { M8Message } from "@/lib/m8";
import { M8_SESSION_KEY } from "@/lib/m8";

/**
 * M8LiveChat — the real M8 conversation UI (v10.0)
 *
 * Streams responses from /api/m8-chat token-by-token so the chat
 * feels alive rather than snapping in complete replies. Uses the
 * same visual chrome as the scripted Sarah demo (rate cards,
 * message bubbles, principle labels) but connected to Claude API.
 *
 * Behavior:
 *  - Empty state: shows M8's opening line
 *  - User types + hits enter -> message appears, streaming reply follows
 *  - Reply streams into the UI in real time
 *  - Conversation persists in localStorage between page reloads
 *  - "Start over" clears the conversation
 *  - If the API errors, message shown in place, retry available
 *
 * NOT INCLUDED in v10.0 (comes in v10.2):
 *  - Recording consent language
 *  - Transcript-on-demand button
 *  - Two-party consent state notice
 *  - Any compliance-required disclosures beyond the footer
 */

const M8_OPENING = `Hi. I'm M8, RateM8's mortgage assistant. I'm still being fine-tuned so this is a preview version — I can chat about how mortgages work but I can't quote live rates yet. What can I help you understand?`;

export default function M8LiveChat() {
  const [messages, setMessages] = useState<M8Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Load from localStorage on mount ───────────────────────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(M8_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as M8Message[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // localStorage may be blocked; just start empty
    }
  }, []);

  // ─── Save to localStorage on change ────────────────────────
  useEffect(() => {
    try {
      window.localStorage.setItem(M8_SESSION_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // ─── Auto-scroll to bottom as new content arrives ──────────
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamingText]);

  // ─── Send message + stream response ────────────────────────
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      setError(null);
      setStreamingText("");

      const nextMessages: M8Message[] = [
        ...messages,
        { role: "user", content: text.trim() },
      ];
      setMessages(nextMessages);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";
      try {
        const resp = await fetch("/api/m8-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(errText || `HTTP ${resp.status}`);
        }
        if (!resp.body) {
          throw new Error("No response body");
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Split by SSE event boundary (\n\n)
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // keep any incomplete event

          for (const event of events) {
            if (!event.startsWith("data: ")) continue;
            const payload = event.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as {
                text?: string;
                error?: string;
              };
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              }
            } catch (parseErr) {
              // If it's not JSON, ignore (probably a keepalive)
              if (parseErr instanceof Error && parseErr.message) {
                throw parseErr;
              }
            }
          }
        }

        // Streaming done — commit the assistant message and clear the buffer
        if (accumulated) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: accumulated },
          ]);
        }
        setStreamingText("");
      } catch (err) {
        console.error("[M8LiveChat] send error", err);
        const msg =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        // Roll back the user message so they can retry cleanly?
        // No — leave it visible so they see what they said.
        setStreamingText("");
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming]
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const startOver = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setStreamingText("");
    setError(null);
    setInput("");
    try {
      window.localStorage.removeItem(M8_SESSION_KEY);
    } catch {
      // ignore
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Preview banner */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between"
        style={{
          borderColor: "var(--rule)",
          background:
            "color-mix(in srgb, var(--color-m8-green) 8%, transparent)",
        }}
      >
        <span
          className="font-mono text-[10px] tracking-[0.15em] uppercase"
          style={{ color: "var(--color-m8-green)" }}
        >
          ● Live M8 · Preview build · Not yet quoting rates
        </span>
        {messages.length > 0 && (
          <button
            onClick={startOver}
            className="font-mono text-[10px] tracking-[0.15em] uppercase hover:underline"
            style={{ color: "var(--muted)" }}
          >
            Start over
          </button>
        )}
      </div>

      {/* Message thread */}
      <div ref={scrollRef} className="chat-center flex-1 overflow-y-auto">
        {messages.length === 0 && !streaming && (
          <div className="msg-bubble-m8">
            <div className="msg-avatar msg-avatar--m8">M8</div>
            <div className="flex-1 min-w-0">
              <div className="msg-meta">
                <span
                  className="font-medium"
                  style={{ color: "var(--fg)" }}
                >
                  M8
                </span>
              </div>
              <p
                className="text-[15px] leading-relaxed"
                style={{ color: "var(--fg)" }}
              >
                {M8_OPENING}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? "msg-bubble-user" : "msg-bubble-m8"}
          >
            <div
              className={`msg-avatar ${
                msg.role === "user" ? "msg-avatar--user" : "msg-avatar--m8"
              }`}
            >
              {msg.role === "user" ? "YOU" : "M8"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="msg-meta">
                <span
                  className="font-medium"
                  style={{ color: "var(--fg)" }}
                >
                  {msg.role === "user" ? "You" : "M8"}
                </span>
              </div>
              <p
                className="text-[15px] leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--fg)" }}
              >
                {msg.content}
              </p>
            </div>
          </div>
        ))}

        {/* In-flight streaming message */}
        {streaming && (streamingText || messages[messages.length - 1]?.role === "user") && (
          <div className="msg-bubble-m8">
            <div className="msg-avatar msg-avatar--m8">M8</div>
            <div className="flex-1 min-w-0">
              <div className="msg-meta">
                <span
                  className="font-medium"
                  style={{ color: "var(--fg)" }}
                >
                  M8
                </span>
                <span className="msg-meta--label ml-2">TYPING</span>
              </div>
              <p
                className="text-[15px] leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--fg)" }}
              >
                {streamingText || <span style={{ opacity: 0.5 }}>…</span>}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border px-4 py-3 text-sm"
               style={{
                 borderColor: "color-mix(in srgb, #E2746E 60%, transparent)",
                 background: "color-mix(in srgb, #E2746E 8%, transparent)",
                 color: "#E2746E",
               }}>
            {error}. Try sending again.
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="chat-input">
        <div
          className="chat-input-row flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors"
          style={{
            borderColor: input ? "var(--color-m8-deep)" : "var(--rule)",
          }}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              aria-label="M8 is here"
              className={`m8-input-orb ${
                streaming ? "m8-input-orb--sending" : input ? "m8-input-orb--typing" : "m8-input-orb--idle"
              }`}
            />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
            placeholder={
              streaming ? "M8 is typing…" : "Ask M8 anything about mortgages…"
            }
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--muted)] disabled:opacity-60"
            aria-label="Your question for M8"
          />

          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            aria-label="Send to M8"
            className="grid place-items-center w-10 h-10 rounded-lg disabled:opacity-40 transition-opacity"
            style={{
              background: "var(--color-m8-deep)",
              color: "var(--color-m8-paper)",
            }}
          >
            {streaming ? (
              <span className="font-mono text-xs">…</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
