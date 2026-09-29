"use client";

import Scene from "@/components/motion/Scene";
import Bento, { BentoSlot } from "@/components/motion/Bento";

/**
 * HowItWorksScene — three dashed slots appear, then fill one at a time
 * (150 ms apart) with the three borrower steps. A timeline rail above
 * the grid lights its dots in the same sequence.
 *
 * Steps: 0 = dashed slots + rail visible, 1..3 = slot n filled.
 */
export type HowStep = { n: string; label: string; title: string; body: string };

type HowItWorksSceneProps = {
  steps: HowStep[];
  sceneLabel: string;
  /** Static mono counter shown in the scene label, e.g. "03 steps". */
  counter: string;
  slotLabels: readonly string[];
  textEquivalent: string;
};

const STEPS = [0, 250, 400, 550];

export default function HowItWorksScene({ steps, sceneLabel, counter, slotLabels, textEquivalent }: HowItWorksSceneProps) {
  return (
    <Scene label={sceneLabel} counter={counter} steps={STEPS} background="forest" textEquivalent={textEquivalent} className="hm-how rounded-3xl overflow-hidden">
      {({ step }) => (
        <div className="px-4 sm:px-6 pb-6 sm:pb-8 pt-6">
          <div className="hm-how__rail" aria-hidden="true">
            <div className="tl">
              {steps.map((s, i) => (
                <div key={s.n} className="tl-step">
                  <span className={`tl-dot ${step >= i + 1 ? "is-on" : ""}`} />
                  <span className="tl-label">{slotLabels[i] ?? s.n}</span>
                </div>
              ))}
            </div>
          </div>

          <Bento cols={3}>
            {steps.map((s, i) => (
              <BentoSlot key={s.n} filled={step >= i + 1} label={s.label}>
                <div className="hm-how__n">{s.n}</div>
                <h3 className="hm-how__title">{s.title}</h3>
                <p className="hm-how__body">{s.body}</p>
              </BentoSlot>
            ))}
          </Bento>
        </div>
      )}
    </Scene>
  );
}
