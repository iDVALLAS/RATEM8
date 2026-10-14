"use client";

import Scene from "@/components/motion/Scene";
import Bento, { BentoSlot } from "@/components/motion/Bento";
import SampleBadge from "@/components/SampleBadge";
import { seq } from "@/lib/useSceneTimeline";

/**
 * SecondLookScene — a compact, looping version of the Second Look
 * decode: a tilted paper Loan Estimate is scanned top to bottom, four
 * rows light up (reading → found, each tagged), then a small bento
 * fills with what the borrower gets back.
 *
 * The document shows NO figures: values are blank bars. Every frame
 * carries <SampleBadge />. Nothing here compares pricing.
 *
 * Steps (150 ms apart):
 *   0 doc in · 1 scanline · 2/3 row 1 reading/found · 4/5 row 2 ·
 *   6/7 row 3 · 8/9 row 4 · 10 result fills
 */
type Field = { section: number; label: string; tag: string };

type SecondLookSceneProps = {
  sceneLabel: string;
  counter: string;
  docTitle: string;
  docMeta: string;
  sections: readonly string[];
  fields: readonly Field[];
  resultLabel: string;
  resultLines: readonly string[];
  textEquivalent: string;
};

const FIELD_COUNT = 4;
const STEPS = seq(0, 150, 3 + FIELD_COUNT * 2);
const RESULT_STEP = STEPS.length - 1;

function fieldClass(step: number, i: number): string {
  const reading = 2 + i * 2;
  if (step >= reading + 1) return "is-found";
  if (step === reading) return "is-reading";
  return "";
}

export default function SecondLookScene({ sceneLabel, counter, docTitle, docMeta, sections, fields, resultLabel, resultLines, textEquivalent }: SecondLookSceneProps) {
  const rows = fields.slice(0, FIELD_COUNT);
  return (
    <Scene
      label={sceneLabel}
      counter={counter}
      steps={STEPS}
      loop
      loopDelay={2600}
      background="paper"
      badge={<SampleBadge />}
      textEquivalent={textEquivalent}
      className="hm-sl rounded-3xl overflow-hidden"
    >
      {({ step }) => (
        <div className="hm-sl__grid px-4 sm:px-6 pb-6 sm:pb-8">
          <div className="hm-sl__stage" aria-hidden="true">
            <div className={`doc hm-sl__doc ${step >= 0 ? "is-on" : ""}`}>
              <div className="hm-sl__doc-head">
                <span className="hm-sl__doc-title">{docTitle}</span>
                <span className="hm-sl__doc-meta">{docMeta}</span>
              </div>
              {sections.map((sec, si) => (
                <div key={sec}>
                  <div className="doc__section">{sec}</div>
                  {rows.map((f, i) =>
                    f.section === si ? (
                      <div key={f.label} className={`doc__row doc__field ${fieldClass(step, i)}`}>
                        <span>{f.label}</span>
                        <span className="doc__bar" />
                        <span className="doc__tag">{f.tag}</span>
                      </div>
                    ) : null
                  )}
                </div>
              ))}
              <div className="doc__row" style={{ borderBottom: 0 }}>
                <span className="doc__bar" style={{ width: 90 }} />
                <span className="doc__bar" style={{ width: 30 }} />
              </div>
              <span className={`scanline ${step >= 1 ? "is-on" : ""}`} />
            </div>
          </div>

          <div className="hm-sl__result">
            <Bento cols={1}>
              <BentoSlot filled={step >= RESULT_STEP} label={resultLabel}>
                <ul className="hm-sl__result-list">
                  {resultLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </BentoSlot>
            </Bento>
          </div>
        </div>
      )}
    </Scene>
  );
}
