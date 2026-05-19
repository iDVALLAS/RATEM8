"use client";

import { useState } from "react";

/**
 * The chat input bar at the bottom of /chat.
 *
 * In v7, this is NOT wired to Claude API — that's v8.
 * Instead, it captures the borrower's question + email and
 * forwards it to Jason via /api/chat-question (Resend).
 *
 * The visitor sees an immediate confirmation. Jason gets an
 * email with: question, email, timestamp, IP, UTM source.
 *
 * Compliance:
 *  - Email field is optional (we don't gate on PII)
 *  - No SSN, no DOB, no hard pull — soft contact only
 *  - All inbound questions are stored 5 years (CFPB record-keeping)
 */

export default function ChatInput() {
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

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
            borderColor: "color-mix(in srgb, var(--color-m8-green) 50%, transparent)",
            background: "color-mix(in srgb, var(--color-m8-green) 8%, transparent)",
          }}
        >
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)] mr-2">
            ✓ Sent to Jason
          </span>
          He&apos;ll personally reply within a few hours. The full M8 chat
          launches soon — you&apos;ll be among the first to try it.{" "}
          <button
            onClick={() => setStatus("idle")}
            className="text-[var(--color-m8-green)] underline hover:no-underline"
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
        className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
        style={{
          borderColor: question ? "var(--color-m8-green)" : "var(--rule)",
        }}
      >
        <input
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
          className="text-[var(--muted)] hover:text-[var(--color-m8-paper)] p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 11.5l-9 9a5.5 5.5 0 01-7.78-7.78l9-9a3.5 3.5 0 014.95 4.95L9.18 17.66a1.5 1.5 0 11-2.12-2.12L15.5 7.5" />
          </svg>
        </button>
        <button
          aria-label="Voice input"
          className="text-[var(--muted)] hover:text-[var(--color-m8-paper)] p-1"
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
          className="grid place-items-center w-10 h-10 rounded-lg disabled:opacity-40"
          style={{
            background: "var(--color-m8-green)",
            color: "var(--color-m8-forest)",
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
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)] whitespace-nowrap">
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
            className="flex-1 bg-transparent border-b border-[var(--rule)] focus:border-[var(--color-m8-green)] outline-none text-sm py-1"
            aria-label="Your email"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={status === "sending"}
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)] hover:underline disabled:opacity-50"
          >
            Send →
          </button>
          <button
            onClick={() => handleSubmit()}
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--muted)] hover:text-[var(--color-m8-paper)]"
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
