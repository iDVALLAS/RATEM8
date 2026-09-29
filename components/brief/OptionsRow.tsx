"use client";

import { useEffect, useRef, useState } from "react";
import SampleBadge from "@/components/SampleBadge";
import { briefContent as c, type BriefOption } from "@/lib/content/sample-brief";

/**
 * OptionsRow — the three option cards in a `.swipe-row` (swipeable on
 * mobile, a 3-column grid from md up) with a `.swipe-dots` indicator
 * driven by an IntersectionObserver on each card.
 *
 * Every card carries a SampleBadge. Lenders are numbered, never named.
 */
export default function OptionsRow({ options }: { options: readonly BriefOption[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof IntersectionObserver === "undefined") return;
    const cards = Array.from(row.children) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        // The most-visible card wins.
        let best: { i: number; ratio: number } | null = null;
        for (const e of entries) {
          const i = cards.indexOf(e.target as HTMLElement);
          if (i < 0) continue;
          if (!best || e.intersectionRatio > best.ratio) best = { i, ratio: e.intersectionRatio };
        }
        if (best && best.ratio > 0.5) setCurrent(best.i);
      },
      { root: row, threshold: [0.5, 0.75, 1] }
    );
    cards.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div>
      <div ref={rowRef} className="swipe-row" role="list" aria-label={c.sections.options}>
        {options.map((o) => (
          <article key={o.key} className="br-opt" role="listitem" aria-label={`Option ${o.key}: ${o.label}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="br-opt__key" aria-hidden="true">
                {o.key}
              </span>
              <SampleBadge />
            </div>
            <div>
              <p className="br-opt__label">{o.label}</p>
              <p className="br-opt__lender">
                {o.lender} · {o.product}
              </p>
            </div>
            <dl>
              <dt>{c.optionLabels.rate}</dt>
              <dd>{o.rate}</dd>
              <dt>{c.optionLabels.apr}</dt>
              <dd>{o.apr}</dd>
              <dt>{c.optionLabels.points}</dt>
              <dd>{o.pointsOrCredit}</dd>
              <dt>{c.optionLabels.pi}</dt>
              <dd>{o.pi}</dd>
              <dt>{c.optionLabels.cash}</dt>
              <dd>{o.cashToClose}</dd>
            </dl>
            <p className="br-opt__note">{o.pointsNote}</p>
            <ul className="br-opt__features" aria-label={c.optionLabels.features}>
              {o.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {o.flag ? (
              <p className="br-opt__flag">
                <b>{c.optionLabels.flag}</b>
                {o.flag}
              </p>
            ) : null}
          </article>
        ))}
      </div>
      <div className="swipe-dots" aria-hidden="true">
        {options.map((o, i) => (
          <span key={o.key} className={i === current ? "is-on" : ""} />
        ))}
      </div>
      <p className="br-swipe-hint">
        {c.swipeHint} · {current + 1} / {options.length}
      </p>
    </div>
  );
}
