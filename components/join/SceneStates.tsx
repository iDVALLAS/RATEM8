"use client";

import Link from "next/link";
import Scene from "@/components/motion/Scene";
import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import { STATES, stateChip, stateDisplay } from "@/lib/config";
import { JOIN_TEXT_EQUIVALENTS } from "@/lib/content/join";
import { useSceneRun } from "./useSceneRun";

const S = copy.join.scenes[1];
// title → cards (≤150 ms apart) → body line
const STEPS = [0, 250, 400, 550, 700, 850, 1150];

/** `// 02 — states`: four state cards stack in, one at a time. */
export default function SceneStates({ onStart }: { onStart: () => void }) {
  return (
    <Scene label={S.label} counter="02 / 05" steps={STEPS} background="forest" className="join-states" textEquivalent={JOIN_TEXT_EQUIVALENTS[1]}>
      {({ step }) => <StatesBody step={step} onStart={onStart} />}
    </Scene>
  );
}

function StatesBody({ step, onStart }: { step: number; onStart: () => void }) {
  const run = useSceneRun(step, onStart);
  return (
    <div className="join-scene__inner">
      <Reveal key={run} as="h2" text={S.title} accent="One originator per area." className="tagline join-scene__title max-w-2xl" />
      <div className="join-state-grid">
        {STATES.map((s, i) => (
          <Link key={s.slug} href={`/states/${s.slug}`} className={`card join-state-card step-in ${step >= i + 1 ? "is-on" : ""}`}>
            <span className="join-state-card__chip">{stateChip(s)}</span>
            <span className="join-state-card__name">{stateDisplay(s)}</span>
            <span className="join-state-card__arrow" aria-hidden="true">
              {`→ /states/${s.slug}`}
            </span>
          </Link>
        ))}
        <div className={`card join-state-card join-state-card--vetting step-in ${step >= 5 ? "is-on" : ""}`} aria-label="Every other state: vetting now">
          <span className="join-state-card__chip">US</span>
          <span className="join-state-card__name">Every other state</span>
          <span className="join-state-card__arrow" aria-hidden="true">
            vetting now
          </span>
        </div>
      </div>
      <p className={`join-scene__body step-in ${step >= 6 ? "is-on" : ""}`}>{S.body}</p>
    </div>
  );
}
