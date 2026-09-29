"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Orb, { type OrbState } from "@/components/Orb";
import TermField from "@/components/TermField";

/**
 * HeroOrb — the hero orb with two stitched-line actions under it.
 *
 *   [ ◌ Voice ]   [ ▢ Q & A ]
 *
 * - Voice: voice is not live (CONFIG.featureFlags.voice is false), so
 *   the button pulses the orb and shows the coming-soon line. Tapping
 *   the orb itself does the same.
 * - Q & A: goes where "I'm shopping a mortgage" goes (the borrower
 *   booking link). When that link is not configured yet, it shows the
 *   booking-coming-soon line instead of dead-linking.
 *
 * NO microphone access. NO audio. NO AI call. Orb state changes are
 * speed / amplitude / halo only.
 */
type HeroOrbProps = {
  ariaLabel: string;
  voiceLabel: string;
  qaLabel: string;
  voiceMessage: string;
  qaComingSoon: string;
  aiNote: string;
  /** Borrower booking URL, or null when not configured. */
  qaHref: string | null;
};

const PULSE_MS = 700;
const SPEAK_MS = 1500;
const TOAST_MS = 4200;

function VoiceIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
    </svg>
  );
}

function QaIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M9.6 8.2a2.4 2.4 0 1 1 3.4 2.2c-.7.35-1 .75-1 1.4" />
      <path d="M12 14h.01" />
    </svg>
  );
}

export default function HeroOrb({ ariaLabel, voiceLabel, qaLabel, voiceMessage, qaComingSoon, aiNote, qaHref }: HeroOrbProps) {
  const [pulse, setPulse] = useState(false);
  const [state, setState] = useState<OrbState>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const wake = useCallback((message: string) => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPulse(true);
    setState("speaking");
    setToast(message);
    timers.current.push(window.setTimeout(() => setPulse(false), PULSE_MS));
    timers.current.push(window.setTimeout(() => setState("idle"), SPEAK_MS));
    timers.current.push(window.setTimeout(() => setToast(null), TOAST_MS));
  }, []);

  const onVoice = useCallback(() => wake(voiceMessage), [wake, voiceMessage]);
  const onQaFallback = useCallback(() => wake(qaComingSoon), [wake, qaComingSoon]);

  return (
    <div className="hm-orb-wrap">
      <div className="hm-orb-stage">
        <TermField />
        <button type="button" onClick={onVoice} aria-label={ariaLabel} className="hm-orb-btn">
          <Orb size="hero" state={state} className={pulse ? "orb--pulse" : ""} />
        </button>
      </div>

      <div className="hm-orb-actions" role="group" aria-label="M8 actions">
        <button type="button" onClick={onVoice} className="stitch-btn" aria-describedby={toast ? "hero-orb-toast" : undefined}>
          <VoiceIcon />
          <span>{voiceLabel}</span>
        </button>
        {qaHref ? (
          <a href={qaHref} target="_blank" rel="noopener noreferrer" className="stitch-btn">
            <QaIcon />
            <span>{qaLabel}</span>
          </a>
        ) : (
          <button type="button" onClick={onQaFallback} className="stitch-btn">
            <QaIcon />
            <span>{qaLabel}</span>
          </button>
        )}
      </div>

      <div className="hm-orb-toastwrap" aria-live="polite">
        {toast ? (
          <div id="hero-orb-toast" className="hm-orb-toast step-in is-on">
            <p className="hm-orb-toast__msg">{toast}</p>
            <p className="hm-orb-toast__note">{aiNote}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
