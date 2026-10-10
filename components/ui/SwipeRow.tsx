"use client";

import { Children, useEffect, useRef, useState } from "react";

/**
 * SwipeRow — swipeable cards on phones (scroll-snap) with dot indicators
 * (v24). From md up it is a grid (`variant="grid"`, default) or plain
 * stacked rows (`variant="stack"`, e.g. the demo's option rows).
 *
 * The children stay server-rendered (lender names never ship in browser
 * JS); this component only tracks which card is in view for the dots.
 */
export default function SwipeRow({
  children,
  label,
  variant = "grid",
  className = "",
  hint,
}: {
  children: React.ReactNode;
  label: string;
  variant?: "grid" | "stack";
  className?: string;
  /** Optional "Swipe to compare" line; "{n} / {total}" is appended. */
  hint?: string;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);
  const items = Children.toArray(children);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof IntersectionObserver === "undefined") return;
    const cards = Array.from(row.children) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        let best: { i: number; ratio: number } | null = null;
        for (const e of entries) {
          const i = cards.indexOf(e.target as HTMLElement);
          if (i < 0) continue;
          if (!best || e.intersectionRatio > best.ratio) best = { i, ratio: e.intersectionRatio };
        }
        if (best && best.ratio > 0.5) setCurrent(best.i);
      },
      { root: row, threshold: [0.5, 0.75, 1] },
    );
    cards.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  return (
    <div className={`swipe ${className}`.trim()}>
      <div ref={rowRef} className={`swipe-row swipe-row--${variant}`} role="list" aria-label={label}>
        {items.map((child, i) => (
          <div key={i} role="listitem" className="swipe-row__item">
            {child}
          </div>
        ))}
      </div>
      <div className={`swipe-dots swipe-dots--${variant}`} aria-hidden="true">
        {items.map((_, i) => (
          <span key={i} className={i === current ? "is-on" : ""} />
        ))}
      </div>
      {hint ? (
        <p className="swipe-hint">
          {hint} · {current + 1} / {items.length}
        </p>
      ) : null}
    </div>
  );
}
