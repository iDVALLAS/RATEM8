"use client";

import Scene from "@/components/motion/Scene";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import Orb from "@/components/Orb";
import { copy } from "@/lib/copy";
import { JOIN_TEXT_EQUIVALENTS } from "@/lib/content/join";
import JoinPath, { type JoinPathProps } from "./JoinPath";
import { useSceneRun } from "./useSceneRun";

const S = copy.join.scenes[0];
// Module-level so the array identity is stable: a new array each render
// would reset the timeline (JoinScenes re-renders when a scene starts).
const STEPS = [0, 300, 900];

/** `// 01 — hook`: the headline, and the orb peeking in from the corner. */
export default function SceneHook({ onStart, path }: { onStart: () => void; path: JoinPathProps }) {
  return (
    <Scene label={S.label} counter="01 / 05" steps={STEPS} background="night" className="join-hook sheet-item" textEquivalent={JOIN_TEXT_EQUIVALENTS[0]}>
      {({ step }) => <HookBody step={step} onStart={onStart} path={path} />}
    </Scene>
  );
}

function HookBody({ step, onStart, path }: { step: number; onStart: () => void; path: JoinPathProps }) {
  const run = useSceneRun(step, onStart);
  return (
    <>
      <div className="join-scene__inner sheet-fill">
        <div className={`join-orb-peek step-slide-r ${step >= 1 ? "is-on" : ""}`} aria-hidden="true">
          <Orb size="ambient" px={120} state={step >= 2 ? "idle" : "listening"} />
        </div>
        <div className="max-w-2xl">
          <SlideHeadline runKey={run} as="h2" lines={splitLines(S.title)} accent="something to prove?" underline dim className="join-scene__title" />
          <p className={`join-scene__body step-in ${step >= 2 ? "is-on" : ""}`}>{S.body}</p>
        </div>
      </div>
      <JoinPath {...path} />
    </>
  );
}
