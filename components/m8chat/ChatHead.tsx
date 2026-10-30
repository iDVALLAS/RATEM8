"use client";

import Orb from "@/components/Orb";
import { useVoice } from "@/components/voice/VoiceRoot";
import { copy } from "@/lib/copy";
import { useEffect } from "react";

/**
 * The M8 header (v33): the orb follows M8's voice state (idle / listening /
 * speaking), the AI disclosure, and the "voice replies" switch. Arriving
 * from the homepage Voice button (/chat?voice=1) asks to turn voice on.
 */
export default function ChatHead() {
  const v = useVoice();
  const t = copy.m8chat;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("voice") === "1") void v.setRepliesOn(true);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="m8c-head">
      <Orb size="ambient" px={56} state={v.state} className="m8c-head__orb" />
      <div className="m8c-head__text">
        <h1 className="m8c-h1">
          {t.title} <span className="m8c-accent">{t.titleAccent}</span>
        </h1>
        <p className="m8c-state" aria-live="polite">
          <i aria-hidden="true" />
          {t.states[v.state]}
        </p>
        <p className="m8c-ai">{t.aiLine}</p>
      </div>
      {v.canSpeak ? (
        <button
          type="button"
          className={`m8c-voice ${v.repliesOn ? "is-on" : ""}`}
          aria-pressed={v.repliesOn}
          onClick={() => void v.setRepliesOn(!v.repliesOn)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {v.repliesOn ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M17 9l4 6M21 9l-4 6" />}
          </svg>
          {v.repliesOn ? t.repliesOn : t.repliesOff}
        </button>
      ) : null}
    </header>
  );
}
