"use client";

import Scene from "@/components/motion/Scene";
import Reveal from "@/components/motion/Reveal";
import Bento, { BentoSlot } from "@/components/motion/Bento";
import SampleBadge from "@/components/SampleBadge";
import { copy } from "@/lib/copy";
import { JOIN_TEXT_EQUIVALENTS } from "@/lib/content/join";
import { useSceneRun } from "./useSceneRun";

const S = copy.join.scenes[3];
const H = copy.join.handled;
// 0 grid · 1 borrower · 2 comparison · 3 pipeline · 4–7 dots · 8 compliance
const STEPS = [0, 200, 400, 600, 800, 950, 1100, 1250, 1400];
const OPTION_INDEX = ["A", "B", "C"];

/** `// 04 — handled`: dashed-to-filled bento of what M8 hands the MLO. */
export default function SceneHandled({ onStart }: { onStart: () => void }) {
  return (
    <Scene
      label={S.label}
      counter="04 / 05"
      steps={STEPS}
      background="forest"
      className="join-handled"
      badge={<SampleBadge />}
      textEquivalent={JOIN_TEXT_EQUIVALENTS[3]}
    >
      {({ step }) => <HandledBody step={step} onStart={onStart} />}
    </Scene>
  );
}

function HandledBody({ step, onStart }: { step: number; onStart: () => void }) {
  const run = useSceneRun(step, onStart);
  return (
    <div className="join-scene__inner">
      <Reveal key={run} as="h2" text={S.title} accent="not a lead." className="tagline join-scene__title max-w-2xl" />
      <p className={`join-scene__body step-in ${step >= 0 ? "is-on" : ""}`}>{S.body}</p>

      <Bento cols={2}>
        <BentoSlot filled={step >= 1} label={H.borrower.label}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="join-borrower__name">{H.borrower.name}</p>
              <p className="join-borrower__detail">{H.borrower.detail}</p>
            </div>
            <SampleBadge />
          </div>
          <p className="join-note">{`// ${H.borrower.sample}`}</p>
        </BentoSlot>

        <BentoSlot filled={step >= 2} label={H.comparison.label}>
          <div className="join-compare">
            {H.comparison.options.map((opt, i) => (
              <div key={opt} className="join-compare__opt">
                <span className="join-compare__idx">{OPTION_INDEX[i]}</span>
                <span>{opt}</span>
                <span className="join-compare__redact" aria-hidden="true" />
              </div>
            ))}
          </div>
          <p className="join-note">{H.comparison.note}</p>
        </BentoSlot>

        <BentoSlot filled={step >= 3} label={H.pipeline.label}>
          <div className="tl mt-2">
            {H.pipeline.steps.map((label, i) => (
              <div key={label} className="tl-step">
                <span className={`tl-dot ${step >= 4 + i ? "is-on" : ""}`} />
                <span className="tl-label">{label}</span>
              </div>
            ))}
          </div>
        </BentoSlot>

        <BentoSlot filled={step >= 8} label={H.compliance.label}>
          <ul className="join-compliance">
            {H.compliance.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </BentoSlot>
      </Bento>
    </div>
  );
}
