"use client";

import { useEffect, useMemo, useState } from "react";
import { prefersReducedMotion } from "@/lib/useSceneTimeline";
import Underline from "./Underline";

/**
 * Reveal — word-by-word headline reveal.
 *
 * One phrase (`accent`) renders as italic serif in M8 Green, optionally
 * with a hand-drawn underline that draws itself after the words land.
 *
 * Two modes:
 *  - `immediate` (above the fold): pure CSS. Words animate from first
 *    paint via `animation-delay`, no JS gating, so the headline is never
 *    invisible while the page hydrates (LCP-safe, works without JS).
 *  - viewport-triggered (default): words are visible in the server HTML;
 *    on mount the component arms itself (`reveal--js`), hides the words,
 *    and plays when the element scrolls into view. Plays once.
 *
 * `prefers-reduced-motion`: final state, no transitions (CSS handles
 * the immediate mode; JS handles the viewport mode).
 *
 * Text is a single string for screen readers; the split spans are
 * aria-hidden.
 */
type RevealProps = {
  text: string;
  accent?: string;
  underline?: boolean;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  /** ms between words. Default 90. */
  interval?: number;
  /** Start at first paint without waiting for viewport entry (CSS mode). */
  immediate?: boolean;
  delay?: number;
};

export default function Reveal({
  text,
  accent,
  underline = false,
  as: Tag = "h2",
  className = "",
  interval = 90,
  immediate = false,
  delay = 0,
}: RevealProps) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    if (!immediate) setArmed(true);
  }, [immediate]);

  useEffect(() => {
    if (immediate || !armed) return;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          window.setTimeout(() => setVisible(true), delay);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, immediate, armed, delay]);

  // Split into tokens, marking the accent phrase.
  const tokens = useMemo(() => {
    const out: { word: string; accent: boolean; last: boolean }[] = [];
    if (accent && text.includes(accent)) {
      const [before, after] = text.split(accent);
      before.split(/\s+/).filter(Boolean).forEach((w) => out.push({ word: w, accent: false, last: false }));
      const accentWords = accent.split(/\s+/).filter(Boolean);
      accentWords.forEach((w, i) => out.push({ word: w, accent: true, last: i === accentWords.length - 1 }));
      after.split(/\s+/).filter(Boolean).forEach((w) => out.push({ word: w, accent: false, last: false }));
    } else {
      text.split(/\s+/).filter(Boolean).forEach((w) => out.push({ word: w, accent: false, last: false }));
    }
    return out;
  }, [text, accent]);

  const totalMs = tokens.length * interval + delay;
  const mode = immediate ? "reveal--css" : armed ? "reveal--js" : "";
  const on = immediate || visible || reduced;

  return (
    <Tag
      ref={setEl as unknown as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
      className={`reveal ${mode} ${on ? "reveal--on" : ""} ${reduced ? "reveal--reduced" : ""} ${className}`}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="reveal__words">
        {tokens.map((t, i) => (
          <span key={`${t.word}-${i}`}>
            <span
              className={`reveal__word ${t.accent ? "reveal__accent" : ""}`}
              style={
                {
                  transitionDelay: reduced ? "0ms" : `${i * interval}ms`,
                  "--reveal-delay": `${delay + i * interval}ms`,
                } as React.CSSProperties
              }
            >
              {t.word}
              {t.accent && t.last && underline ? (
                <Underline active={on} delay={reduced ? 0 : totalMs + 100} />
              ) : null}
            </span>
            {/* The space lives OUTSIDE the inline-block span so it is not collapsed. */}
            {i < tokens.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </Tag>
  );
}
