"use client";

import { useEffect, useRef, useState } from "react";
import { useVoice } from "@/components/voice/VoiceRoot";
import { copy } from "@/lib/copy";

/**
 * The composer (v33). Docked at the bottom of the conversation column
 * (sticky inside it, so it stays with the conversation), the same width as
 * the messages.
 *
 * - Type, or tap the mic: the transcript lands in the box to edit or send.
 *   The mic stops M8 if it is speaking. Hidden where the browser can't
 *   transcribe.
 * - Sending goes to the visitor's loan officer through /api/chat-question
 *   (two-way chat with M8 is still in private testing). An optional email
 *   appears once there is a question. "Sent" shows only when it was
 *   actually sent. `first` is the matched loan officer, or null (generic).
 * - With voice replies on, the confirmation is read aloud.
 */
/** Anything on the page can fill the composer: dispatch this event with the text. */
export const PREFILL_EVENT = "m8:prefill";

export default function Composer({ first }: { first: string | null }) {
  const t = copy.m8chat;
  const sentText = first ? t.sent.replaceAll("{first}", first) : t.sentGeneric;
  const hintText = first ? t.sendHint.replaceAll("{first}", first) : t.sendHintGeneric;
  const v = useVoice();
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listening = v.state === "listening";

  useEffect(() => {
    const onPrefill = (e: Event) => {
      setQ(String((e as CustomEvent).detail ?? ""));
      setStatus("idle");
      inputRef.current?.focus();
    };
    window.addEventListener(PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(PREFILL_EVENT, onPrefill);
  }, []);

  async function mic() {
    if (listening) return v.stop();
    const said = await v.listen((partial) => setQ(partial));
    if (said) setQ(said);
    inputRef.current?.focus();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/chat-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, email: email || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // The route explains refusals (e.g. an SSN in the question) in plain words.
        if (res.status === 400 && body.error && body.error.length > 30) setError(body.error);
        throw new Error("send failed");
      }
      setStatus("sent");
      setQ("");
      setEmail("");
      if (v.repliesOn) void v.speak(sentText);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="m8c-dock">
      <form className="m8c-composer" onSubmit={send}>
        <label htmlFor="m8c-q" className="sr-only">
          {t.placeholder}
        </label>
        <input
          id="m8c-q"
          ref={inputRef}
          className="m8c-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (status !== "sending") setStatus("idle");
          }}
          placeholder={listening ? t.listeningPlaceholder : t.placeholder}
          autoComplete="off"
          maxLength={4000}
        />
        {v.canListen ? (
          <button type="button" className={`m8c-ic ${listening ? "is-live" : ""}`} aria-pressed={listening} aria-label={listening ? t.micStop : t.mic} onClick={mic}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        ) : null}
        <button type="submit" className="m8c-ic m8c-ic--send" aria-label={t.send} disabled={!q.trim() || status === "sending"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {q.trim() && status !== "sent" ? (
        <div className="m8c-email">
          <label htmlFor="m8c-email">{t.emailLabel}</label>
          <input id="m8c-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <span>{hintText}</span>
        </div>
      ) : null}
      <p className="m8c-status" role="status" aria-live="polite">
        {status === "sent" ? sentText : status === "error" ? error || t.sendError : ""}
      </p>
      <p className="m8c-disclosure">
        {t.disclosureLead} <b>{t.disclosureStrong}</b> {t.disclosureTail}
      </p>
    </div>
  );
}
