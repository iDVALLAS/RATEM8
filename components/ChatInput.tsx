"use client";

import { useState, useRef, useEffect } from "react";

/**
 * The chat input bar at the bottom of /chat.
 *
 * v8 update: adds a pulsing Deep Green M8 orb at the left edge
 * of the input. The orb is a visual signal that AI is present
 * in the conversation. Clicking it focuses the input box and
 * shows a brief hint ("M8 is here — ask me anything").
 *
 * In v9, the orb's click handler will swap from "focus input"
 * to "start live Claude API conversation" (and optionally
 * "activate voice via Vapi"). The component is built to support
 * that swap without restructuring.
 *
 * The orb has three visual states (idle / typing / sending) so
 * users get feedback that something is happening. The states are
 * also a forward-compat hook for v9's M8 "thinking" and
 * "speaking" states.
 *
 * Compliance:
 *  - Email field is optional (we don't gate on PII)
 *  - No SSN, no DOB, no hard pull — soft contact only
 *  - All inbound questions are stored 5 years (CFPB record-keeping)
 *  - The orb being clickable does NOT initiate any data collection
 *    until the user explicitly hits send
 */

type OrbState = "idle" | "typing" | "sending";

export default function ChatInput() {
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Orb visual state derives from input state
  const orbState: OrbState =
    status === "sending"
      ? "sending"
      : question.length > 0
        ? "typing"
        : "idle";

  // Auto-hide the hint after 3 seconds
  useEffect(() => {
    if (!showHint) return;
    const t = window.setTimeout(() => setShowHint(false), 3000);
    return () => window.clearTimeout(t);
  }, [showHint]);

  function handleOrbClick() {
    // v8 behavior: focus input + show hint
    // v9 behavior: this will become "start live M8 session"
    inputRef.current?.focus();
    setShowHint(true);
  }

  async function handleSubmit() {
    if (!question.trim()) return;
    setStatus("sending");

    try {
      const res = await fetch("/api/chat-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, email: email || null }),
      });
      if (!res.ok) throw new Error("send failed");
      setStatus("sent");
      setQuestion("");
      setEmail("");
      setShowEmail(false);
    } catch {
      setStatus("error");
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showEmail) {
        handleSubmit();
      } else {
        setShowEmail(true);
      }
    }
  }

  if (status === "sent") {
    return (
      <div className="chat-input">
        <div
          className="rounded-xl border px-5 py-4 text-sm leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 50%, transparent)",
            background: "var(--accent-soft)",
          }}
        >
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase mr-2"
                style={{ color: "var(--accent)" }}>
            ✓ Sent to Jason
          </span>
          He&apos;ll personally reply within a few hours. The full M8 chat
          launches soon — you&apos;ll be among the first to try it.{" "}
          <button
            onClick={() => setStatus("idle")}
            className="underline hover:no-underline"
            style={{ color: "var(--accent)" }}
          >
            Ask another question
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-input">
      <div
        className="chat-input-row flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors"
        style={{
          borderColor: question ? "var(--accent)" : "var(--rule)",
        }}
      >
        {/* ─── The M8 orb — left of input, clickable ─── */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={handleOrbClick}
            aria-label="M8 is here — click to focus the message box"
            className={`m8-input-orb m8-input-orb--${orbState}`}
          />
          {showHint && (
            <div
              className="absolute bottom-full left-0 mb-3 whitespace-nowrap rounded-md border px-3 py-2 text-xs"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--rule)",
                color: "var(--fg)",
                fontFamily: "var(--font-exo)",
                animation: "m8-hint-in 200ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              role="status"
            >
              M8 is here — ask me anything.
              <span
                className="absolute -bottom-1 left-3 h-2 w-2 rotate-45 border-b border-r"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--rule)",
                }}
              />
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask your M8 anything — rates, scenarios, fees, timing…"
          className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--muted)]"
          aria-label="Your question for M8"
        />
        <button
          aria-label="Attach document"
          className="text-[var(--muted)] hover:text-[var(--fg)] p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 11.5l-9 9a5.5 5.5 0 01-7.78-7.78l9-9a3.5 3.5 0 014.95 4.95L9.18 17.66a1.5 1.5 0 11-2.12-2.12L15.5 7.5" />
          </svg>
        </button>
        <button
          aria-label="Voice input (coming soon)"
          className="text-[var(--muted)] hover:text-[var(--fg)] p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="9" y="3" width="6" height="13" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
        </button>
        <button
          onClick={() => {
            if (showEmail) handleSubmit();
            else setShowEmail(true);
          }}
          disabled={!question.trim() || status === "sending"}
          aria-label="Send to Jason"
          className="grid place-items-center w-10 h-10 rounded-lg disabled:opacity-40 transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
          }}
        >
          {status === "sending" ? (
            <span className="font-mono text-xs">…</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      {showEmail && (
        <div className="mt-3 flex items-center gap-3 px-4">
          <span
            className="font-mono text-[10px] tracking-[0.15em] uppercase whitespace-nowrap"
            style={{ color: "var(--accent)" }}
          >
            ✓ Got it
          </span>
          <span className="text-sm text-[var(--muted)]">
            Email so Jason can reply:
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKey}
            placeholder="you@example.com"
            className="flex-1 bg-transparent border-b border-[var(--rule)] focus:border-[var(--accent)] outline-none text-sm py-1"
            aria-label="Your email"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={status === "sending"}
            className="font-mono text-[10px] tracking-[0.15em] uppercase hover:underline disabled:opacity-50"
            style={{ color: "var(--accent)" }}
          >
            Send →
          </button>
          <button
            onClick={() => handleSubmit()}
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Skip
          </button>
        </div>
      )}

      {status === "error" && (
        <p className="mt-2 text-xs text-red-400 px-4">
          Something went wrong sending that. Try again, or email Jason directly.
        </p>
      )}
    </div>
  );
}
