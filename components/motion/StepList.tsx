"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/useSceneTimeline";
import "./stage.css";

/**
 * StepList — statements on the left, one pinned visual on the right.
 *
 * As the reader scrolls, the statement nearest the viewport centre
 * becomes active (full contrast, green marker) and the others fade to
 * 45%. The right column is sticky and shows `visual(activeIndex)`.
 *
 * Reduced motion: every statement at full contrast, first visual only.
 * Phones: one column, each statement followed by its own visual, no
 * sticky. Visuals are decorative (aria-hidden); the statements carry
 * the text.
 */
export type StepItem = { title: string; body: ReactNode; label?: string };

type StepListProps = {
  steps: readonly StepItem[];
  visual: (activeIndex: number) => ReactNode;
  className?: string;
  ariaLabel?: string;
};

export default function StepList({ steps, visual, className = "", ariaLabel }: StepListProps) {
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReduced(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        const i = Number((hit.target as HTMLElement).dataset.index);
        if (!Number.isNaN(i)) setActive(i);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  const shown = reduced ? 0 : active;

  return (
    <div className={`steplist-root ${reduced ? "is-reduced" : ""} ${className}`.trim()} data-active={shown}>
      <ol className="steplist-items" aria-label={ariaLabel}>
        {steps.map((s, i) => (
          <li
            key={s.title}
            ref={(el) => {
              items.current[i] = el;
            }}
            data-index={i}
            className={`steplist-item ${!reduced && i === shown ? "is-active" : ""}`.trim()}
          >
            <span className="steplist-dot" aria-hidden="true" />
            <div>
              {s.label ? <p className="steplist-label">{s.label}</p> : null}
              <h3 className="steplist-title">{s.title}</h3>
              <p className="steplist-body">{s.body}</p>
            </div>
            <div className="steplist-visual steplist-visual--inline" aria-hidden="true">
              {visual(i)}
            </div>
          </li>
        ))}
      </ol>
      <div className="steplist-pin" aria-hidden="true">
        <div className="steplist-visual" key={shown}>
          {visual(shown)}
        </div>
      </div>
    </div>
  );
}
