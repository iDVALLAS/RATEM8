"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Orb, { type OrbState } from "@/components/Orb";
import TermField from "@/components/TermField";

/**
 * HeroOrb — the tappable hero orb.
 *
 * Tap = a one-shot pulse (700 ms), the orb "speaks" for ~1.5 s (speed,
 * amplitude, halo only — never hue or shape), and an inline card
 * appears with the AI disclosure and the booking CTA.
 *
 * NO microphone access. NO audio. NO AI call. The card's CTA is
 * rendered by the server parent (BookingCTA reads env) and passed in
 * as `cta`.
 */
type HeroOrbProps = {
  caption: string;
  cardLabel: string;
  cardTitle: string;
  cardBody: string;
  dismissLabel: string;
  ariaLabel: string;
  ariaLabelOpen: string;
  cta: React.ReactNode;
};

const PULSE_MS = 700;
const SPEAK_MS = 1500;

export default function HeroOrb({ caption, cardLabel, cardTitle, cardBody, dismissLabel, ariaLabel, ariaLabelOpen, cta }: HeroOrbProps) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [state, setState] = useState<OrbState>("idle");
  const timers = useRef<number[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  // Mount the card, then flip `.is-on` on the next frame so the
  // step-scale transition actually runs.
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      setShown(true);
      cardRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  const tap = useCallback(() => {
    setPulse(true);
    setState("speaking");
    setOpen(true);
    timers.current.push(window.setTimeout(() => setPulse(false), PULSE_MS));
    timers.current.push(window.setTimeout(() => setState("idle"), SPEAK_MS));
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="hm-orb-wrap">
      <div className="hm-orb-stage">
        <TermField />
        <button
          ref={btnRef}
          type="button"
          onClick={tap}
          aria-label={open ? ariaLabelOpen : ariaLabel}
          aria-expanded={open}
          aria-controls={open ? "hero-orb-card" : undefined}
          className="hm-orb-btn"
        >
          <Orb size="hero" state={state} className={pulse ? "orb--pulse" : ""} />
        </button>
      </div>

      <div className="hm-orb-caption">
        {!open ? <span className="speech-bubble">{caption}</span> : null}
      </div>

      {open ? (
        <div
          id="hero-orb-card"
          ref={cardRef}
          tabIndex={-1}
          role="region"
          aria-label={cardTitle}
          aria-live="polite"
          className={`hm-orb-card step-scale ${shown ? "is-on" : ""}`}
        >
          <div className="code-label">{cardLabel}</div>
          <p className="hm-orb-card__title">{cardTitle}</p>
          <p className="hm-orb-card__body">{cardBody}</p>
          <div className="hm-orb-card__actions">
            {cta}
            <button type="button" onClick={dismiss} className="hm-orb-card__dismiss">
              {dismissLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
