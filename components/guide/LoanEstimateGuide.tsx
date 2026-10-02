"use client";

import { useCallback, useEffect, useState } from "react";
import Scene from "@/components/motion/Scene";
import SampleBadge from "@/components/SampleBadge";
import LoanEstimateDiagram from "./LoanEstimateDiagram";
import { leContent, leSections, type LeSectionId } from "@/lib/content/loan-estimate";
import { prefersReducedMotion, seq } from "@/lib/useSceneTimeline";
import "./guide.css";

/**
 * LoanEstimateGuide — owns the "active section" state shared by the
 * diagram (left / top) and the plain-English notes (right / below).
 *
 * Selecting a callout on the form highlights the region, marks the
 * matching note active (which expands its "what to check" list) and
 * scrolls that note into view. "Show on the form" does the reverse.
 * Scrolling is instant under prefers-reduced-motion.
 */
export default function LoanEstimateGuide() {
  const [active, setActive] = useState<LeSectionId | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  const scrollTo = useCallback(
    (elId: string) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const fullyVisible = r.top >= 80 && r.bottom <= window.innerHeight;
      if (fullyVisible) return;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [reduced]
  );

  const selectFromForm = useCallback(
    (id: LeSectionId) => {
      setActive(id);
      window.requestAnimationFrame(() => scrollTo(`le-note-${id}`));
    },
    [scrollTo]
  );

  const selectFromNote = useCallback((id: LeSectionId) => {
    setActive((cur) => (cur === id ? null : id));
  }, []);

  const showOnForm = useCallback(
    (id: LeSectionId) => {
      setActive(id);
      window.requestAnimationFrame(() => scrollTo(`le-region-${id}`));
    },
    [scrollTo]
  );

  return (
    <div className="le-layout">
      <Scene
        label={leContent.diagramLabel}
        steps={seq(0, 200, 3)}
        background="none"
        badge={<SampleBadge />}
        textEquivalent={leContent.textEquivalent}
        className="rounded-2xl"
      >
        {({ step }) => (
          <div className="px-0 pt-4 sm:pt-6">
            <div className={`step-scale ${step >= 0 ? "is-on" : ""}`}>
              <LoanEstimateDiagram active={active} onSelect={selectFromForm} />
            </div>
            <p className="mono-label mt-4 leading-relaxed">{leContent.sampleNote}</p>
          </div>
        )}
      </Scene>

      <aside className="le-notes" aria-label="Plain-English explanations">
        <p className="eyebrow lg:pt-2">{leContent.notesLabel}</p>
        {leSections.map((sec) => {
          const on = active === sec.id;
          return (
            <article key={sec.id} id={`le-note-${sec.id}`} className={`le-note card ${on ? "is-active" : ""}`}>
              <h3>
                <button type="button" className="le-note__head" aria-expanded={on} onClick={() => selectFromNote(sec.id)}>
                  <span className="le-note__n" aria-hidden="true">
                    {sec.n}
                  </span>
                  <span>
                    <span className="le-note__title">{sec.title}</span>
                    <span className="le-note__page">
                      {leContent.pageLabel(sec.page)} · {sec.formTitle}
                    </span>
                  </span>
                </button>
              </h3>
              <div className="le-note__body prose-m8">
                {sec.explain.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="le-note__check prose-m8" hidden={!on}>
                <p className="mono-label" style={{ marginBottom: 6 }}>
                  {leContent.whatToCheck}
                </p>
                <ul>
                  {sec.check.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <button type="button" className="le-note__show" onClick={() => showOnForm(sec.id)}>
                  {leContent.showOnForm} →
                </button>
              </div>
            </article>
          );
        })}
      </aside>
    </div>
  );
}
