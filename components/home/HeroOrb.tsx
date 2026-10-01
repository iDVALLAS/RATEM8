"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Orb, { type OrbState } from "@/components/Orb";
import TermField from "@/components/TermField";
import OrbMonogram from "./OrbMonogram";

/**
 * HeroOrb — the hero orb with two stitched-line actions under it.
 *
 *   [popup ←][ ◌ Voice ]   [ ▢ Q & A ][→ popup]
 *
 * Voice and Q & A each open a solid popup (Edit 1, patch v14): Voice to
 * the left of its button, Q & A to the right; on phones both drop below
 * the button row. A progress line fills over REDIRECT_MS, then the
 * visitor is routed to /chat. Tapping the popup goes now; × cancels.
 * One popup at a time. Reduced motion: no animation, same timer.
 * Tapping the orb opens the Voice popup.
 *
 * The orb carries the raised monogram (Edit 7). v16: it comes and goes
 * with every breath (CSS, synced to the orb's keyframes; home.css), and
 * holds steady while Voice or Q & A is hovered or keyboard-focused.
 *
 * NO microphone access. NO audio. NO AI call. Orb state changes are
 * speed / amplitude / halo only.
 */
type HeroOrbProps = {
  ariaLabel: string;
  voiceLabel: string;
  qaLabel: string;
  voicePopup: string;
  qaPopup: string;
  cancelLabel: string;
  redirectNote: string;
};

type Popup = "voice" | "qa";

const PULSE_MS = 700;
const SPEAK_MS = 1500;
const REDIRECT_MS = 5500;
const CHAT_HREF = "/chat";


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

export default function HeroOrb({ ariaLabel, voiceLabel, qaLabel, voicePopup, qaPopup, cancelLabel, redirectNote }: HeroOrbProps) {
  const router = useRouter();
  const [pulse, setPulse] = useState(false);
  const [state, setState] = useState<OrbState>("idle");
  const [popup, setPopup] = useState<Popup | null>(null);
  // Voice / Q & A hovered (mouse) or focused: hold the monogram up.
  const [holdHover, setHoldHover] = useState(false);
  const [holdFocus, setHoldFocus] = useState(false);
  const timers = useRef<number[]>([]);
  const redirectTimer = useRef<number | null>(null);

  const clearRedirect = useCallback(() => {
    if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    redirectTimer.current = null;
  }, []);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => window.clearTimeout(id));
      clearRedirect();
    };
  }, [clearRedirect]);

  const open = useCallback(
    (which: Popup) => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      clearRedirect();
      setPulse(true);
      setState("speaking");
      setPopup(which);
      timers.current.push(window.setTimeout(() => setPulse(false), PULSE_MS));
      timers.current.push(window.setTimeout(() => setState("idle"), SPEAK_MS));
      redirectTimer.current = window.setTimeout(() => router.push(CHAT_HREF), REDIRECT_MS);
    },
    [clearRedirect, router],
  );

  const cancel = useCallback(() => {
    clearRedirect();
    setPopup(null);
  }, [clearRedirect]);

  // Esc cancels, like the ×.
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup, cancel]);

  const onVoice = useCallback(() => open("voice"), [open]);
  const onQa = useCallback(() => open("qa"), [open]);

  const holdProps = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && setHoldHover(true),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === "mouse" && setHoldHover(false),
    // Keyboard focus only: a mouse click also focuses, and must not pin the hold.
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => setHoldFocus(e.currentTarget.matches(":focus-visible")),
    onBlur: () => setHoldFocus(false),
  };

  const renderPopup = (which: Popup, text: string) =>
    popup === which ? (
      <div className={`hm-pop hm-pop--${which === "voice" ? "left" : "right"}`} key={which}>
        <Link href={CHAT_HREF} className="hm-pop__body" onClick={clearRedirect}>
          <span aria-hidden="true" className="hm-pop__dot" />
          <span className="hm-pop__text">{text}</span>
          <span className="sr-only"> {redirectNote}</span>
        </Link>
        <button type="button" className="hm-pop__x" onClick={cancel} aria-label={cancelLabel}>
          <span aria-hidden="true">×</span>
        </button>
        <span aria-hidden="true" className="hm-pop__bar" style={{ "--pop-ms": `${REDIRECT_MS}ms` } as React.CSSProperties} />
      </div>
    ) : null;

  return (
    <div className={`hm-orb-wrap ${holdHover || holdFocus ? "hm-orb-wrap--mono-hold" : ""}`.trim()}>
      <div className="hm-orb-stage">
        <TermField />
        <button type="button" onClick={onVoice} aria-label={ariaLabel} className="hm-orb-btn">
          <Orb size="hero" state={state} className={`orb--mono ${pulse ? "orb--pulse" : ""}`.trim()}>
            <OrbMonogram />
          </Orb>
        </button>
      </div>

      <div className="hm-orb-actions" role="group" aria-label="M8 actions">
        <button
          type="button"
          onClick={onVoice}
          {...holdProps}
          className={`stitch-btn ${popup === "voice" ? "stitch-btn--on" : ""}`.trim()}
          aria-expanded={popup === "voice"}
        >
          <VoiceIcon />
          <span>{voiceLabel}</span>
        </button>
        <button
          type="button"
          onClick={onQa}
          {...holdProps}
          className={`stitch-btn ${popup === "qa" ? "stitch-btn--on" : ""}`.trim()}
          aria-expanded={popup === "qa"}
        >
          <QaIcon />
          <span>{qaLabel}</span>
        </button>
        <div className="hm-pop-layer" aria-live="polite">
          {renderPopup("voice", voicePopup)}
          {renderPopup("qa", qaPopup)}
        </div>
      </div>
    </div>
  );
}
