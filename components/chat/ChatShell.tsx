"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Orb, { type OrbState } from "@/components/Orb";
import BookingCTA from "@/components/BookingCTA";
import SampleBadge from "@/components/SampleBadge";
import ReplayButton from "@/components/motion/ReplayButton";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { chatContent } from "./chatContent";
import { useScriptPlayer } from "./useScriptPlayer";
import VoiceModal from "./VoiceModal";
import "./chat.css";

/**
 * ChatShell — the public /chat surface. UI only.
 *
 * 1. Disclosure gate FIRST (AI disclosure, recording, two-party consent).
 *    Consent lives in React state only; nothing is stored.
 * 2. After the gate: hero orb with four states driven by the scripted
 *    demo (`copy.chat.script`), a small dev toggle to force a state for
 *    QA, a DEMO badge and note, a replay control, a disabled input, the
 *    booking CTA (the only working action), and the disabled voice modal.
 *
 * While CONFIG.featureFlags.chatLiveAi is false this component makes
 * NO network request of any kind. There is no fetch in this file.
 */
const LIVE_AI: boolean = CONFIG.featureFlags.chatLiveAi;

export default function ChatShell() {
  const [consented, setConsented] = useState(false);
  const [manual, setManual] = useState<OrbState | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const script = useMemo(() => [...copy.chat.script], []);
  const player = useScriptPlayer(script, consented);

  // Orb state: dev override → script-driven → idle before the gate.
  const orbState: OrbState = manual ?? (consented ? player.orb : "idle");

  // Keep the newest bubble in view as the script plays.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [player.shown]);

  const c = copy.chat;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 m8chat-page">
      <header className="m8chat-head">
        <h1 className="m8chat-head__title">{c.title}</h1>
        <SampleBadge text={c.demoBadge} />
        <p className="m8chat-head__note">{c.demoNote}</p>
      </header>

      <section className="m8chat-stage" aria-label="M8">
        <Orb size="hero" state={orbState} />
        {/* Text equivalent of the orb's animation state (contract §5). */}
        <p className="sr-only" aria-live="polite">
          {chatContent.orbStateText[orbState]}
        </p>

        {consented ? (
          <div className="m8chat-dev">
            <span className="m8chat-dev__label" id="m8chat-dev-label">
              {c.devToggle}
            </span>
            <div className="m8chat-seg" role="radiogroup" aria-labelledby="m8chat-dev-label">
              {c.states.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={orbState === s}
                  className="m8chat-seg__opt"
                  onClick={() => setManual(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {manual ? (
              <button type="button" className="m8chat-linkbtn" onClick={() => setManual(null)}>
                {chatContent.devAuto}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {!consented ? (
        <section className="m8chat-gate card" aria-labelledby="m8chat-gate-eyebrow">
          <span id="m8chat-gate-eyebrow" className="code-label">
            {c.gate.eyebrow}
          </span>
          <p className="m8chat-gate__body">{c.gate.body}</p>
          <p className="m8chat-gate__fine">{c.gate.recording}</p>
          <p className="m8chat-gate__fine">{c.gate.twoParty}</p>
          <div className="m8chat-gate__actions">
            <button type="button" className="m8chat-btn m8chat-btn--primary" onClick={() => setConsented(true)}>
              {c.gate.cta}
            </button>
            <Link href="/" className="m8chat-link">
              {c.gate.back}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Conversation">
            <div
              ref={threadRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              className="m8chat-thread max-h-[60svh] overflow-y-auto"
              data-reduced={player.reduced ? "true" : "false"}
            >
              {player.shown.map((m) => (
                <div key={m.id} className={`bubble ${m.from === "m8" ? "bubble--m8" : "bubble--user"}`}>
                  <span className="m8chat-bubble__who">{chatContent.who[m.from]}</span>
                  {m.from === "m8" ? (
                    <>
                      {/* Visible copy types out; the screen reader gets the whole line once. */}
                      <span aria-hidden="true" className={m.typing ? "tw-cursor" : undefined}>
                        {m.visible}
                      </span>
                      <span className="sr-only">{m.text}</span>
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              ))}
            </div>
            <div className="m8chat-thread__foot">
              <span className="mono-label">{player.done ? c.comingSoon : c.demoNote}</span>
              <ReplayButton onClick={player.replay} label={chatContent.replay} />
            </div>
          </section>

          <div className="m8chat-actions">
            <input
              type="text"
              className="m8chat-input"
              placeholder={c.inputPlaceholder}
              aria-label={c.inputPlaceholder}
              disabled={!LIVE_AI}
              readOnly
            />
            <button type="button" className="m8chat-btn" onClick={() => setVoiceOpen(true)} aria-haspopup="dialog">
              {chatContent.voice.open}
            </button>
            <BookingCTA kind="borrower" variant="pill">
              {chatContent.bookingCta}
            </BookingCTA>
          </div>
        </>
      )}

      <VoiceModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
}
