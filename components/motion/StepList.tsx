"use client";

import { useEffect, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/useSceneTimeline";
import { useActiveStep } from "@/lib/useActiveStep";
import "./stage.css";

/**
 * StepList — statements on the left, one pinned visual on the right.
 *
 * As the reader scrolls, the statement in a band across the middle of
 * the viewport becomes active (full contrast, green marker) and the
 * others fade to 45%. A sentinel at the end of the list forces the last
 * statement active, and a tail spacer lets it reach the band (v17: the
 * last step used to be skipped when its sticky sheet pinned first; see
 * lib/useActiveStep.ts). The right column is sticky and shows
 * `visual(activeIndex)`.
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
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) setReduced(true);
  }, []);
  const { active, stepRefs, endRef } = useActiveStep(steps.length, !reduced);

  const shown = reduced ? 0 : active;

  return (
    <div className={`steplist-root ${reduced ? "is-reduced" : ""} ${className}`.trim()} data-active={shown}>
      <div className="steplist-col">
        <ol className="steplist-items" aria-label={ariaLabel}>
          {steps.map((s, i) => (
            <li
              key={s.title}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              data-step={i}
              data-state={reduced ? "reduced" : i === shown ? "active" : i < shown ? "before" : "after"}
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
        {/* Room for the last step to reach the middle band, then the end sentinel. */}
        <div className="steplist-tail" aria-hidden="true" />
        <div ref={endRef} aria-hidden="true" style={{ height: 1 }} />
      </div>
      <div className="steplist-pin" aria-hidden="true">
        <div className="steplist-visual" key={shown}>
          {visual(shown)}
        </div>
      </div>
    </div>
  );
}
