"use client";

import Scene from "@/components/motion/Scene";
import Reveal from "@/components/motion/Reveal";
import Orb from "@/components/Orb";
import { copy } from "@/lib/copy";
import { JOIN_TEXT_EQUIVALENTS } from "@/lib/content/join";
import { useSceneRun } from "./useSceneRun";

const S = copy.join.scenes[0];

/** `// 01 — hook`: the headline, and the orb peeking in from the corner. */
export default function SceneHook({ onStart }: { onStart: () => void }) {
  return (
    <Scene label={S.label} counter="01 / 05" steps={[0, 300, 900]} background="night" className="join-hook" textEquivalent={JOIN_TEXT_EQUIVALENTS[0]}>
      {({ step }) => <HookBody step={step} onStart={onStart} />}
    </Scene>
  );
}

function HookBody({ step, onStart }: { step: number; onStart: () => void }) {
  const run = useSceneRun(step, onStart);
  return (
    <div className="join-scene__inner">
      <div className={`join-orb-peek step-slide-r ${step >= 1 ? "is-on" : ""}`} aria-hidden="true">
        <Orb size="ambient" px={120} state={step >= 2 ? "idle" : "listening"} />
      </div>
      <div className="max-w-2xl">
        <Reveal key={run} as="h2" text={S.title} accent="something to prove?" underline className="tagline join-scene__title" />
        <p className={`join-scene__body step-in ${step >= 2 ? "is-on" : ""}`}>{S.body}</p>
      </div>
    </div>
  );
}
