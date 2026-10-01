"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useActiveStep — which step of a scroll-driven list is active (v17).
 *
 * One IntersectionObserver watches every step through a band across the
 * middle of the viewport; the highest-index step in the band wins. A
 * sentinel at the end of the section forces the last step active once
 * it is on screen, so the last step can never be skipped when its
 * container pins (sticky sheets) before the step reaches the band.
 *
 * Each step element: `data-step={i}` and `ref={(el) => (stepRefs.current[i] = el)}`.
 * The sentinel: `<div ref={endRef} aria-hidden="true" style={{ height: 1 }} />`
 * after the last step, inside the section.
 */
export function useActiveStep(count: number, enabled = true) {
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const i = Number((e.target as HTMLElement).dataset.step);
          if (e.isIntersecting) visible.set(i, e.intersectionRatio);
          else visible.delete(i);
        });
        if (visible.size) setActive(Math.max(...visible.keys()));
      },
      // a band through the middle of the viewport
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));

    // last-step fallback: once the section's end is on screen, the last step is active
    const endIo = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setActive(count - 1);
      },
      { threshold: 0 },
    );
    if (endRef.current) endIo.observe(endRef.current);

    return () => {
      io.disconnect();
      endIo.disconnect();
    };
  }, [count, enabled]);

  return { active, stepRefs, endRef };
}
