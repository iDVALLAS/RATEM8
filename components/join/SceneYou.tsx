"use client";

import Link from "next/link";
import Scene from "@/components/motion/Scene";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import Wordmark from "@/components/Wordmark";
import BookingCTA from "@/components/BookingCTA";
import { copy } from "@/lib/copy";
import { STATES, stateChip } from "@/lib/config";
import { JOIN_TEXT_EQUIVALENTS } from "@/lib/content/join";
import JoinPath, { type JoinPathProps } from "./JoinPath";
import { useSceneRun } from "./useSceneRun";

const S = copy.join.scenes[4];
const STEPS = [0, 300, 600, 900];

/** `// 05 — you`: paper chapter. Headline, wordmark, the one CTA, state strip. */
export default function SceneYou({ onStart, path }: { onStart: () => void; path: JoinPathProps }) {
  return (
    <Scene label={S.label} counter="05 / 05" steps={STEPS} background="paper" className="join-you sheet-item" textEquivalent={JOIN_TEXT_EQUIVALENTS[4]}>
      {({ step }) => <YouBody step={step} onStart={onStart} path={path} />}
    </Scene>
  );
}

function YouBody({ step, onStart, path }: { step: number; onStart: () => void; path: JoinPathProps }) {
  const run = useSceneRun(step, onStart);
  return (
    <>
      <div className="join-scene__inner sheet-fill">
        <SlideHeadline runKey={run} as="h2" lines={splitLines(S.title)} accent="M8 handles the intake." underline className="join-scene__title max-w-3xl" />
        <div className="join-you__stack">
          <div className={`step-in ${step >= 1 ? "is-on" : ""}`}>
            <Wordmark showSubname />
          </div>
          <div className={`step-in ${step >= 2 ? "is-on" : ""}`}>
            <BookingCTA kind="mlo" variant="pill">
              {copy.join.cta}
            </BookingCTA>
          </div>
          <div className={`join-chip-strip step-in ${step >= 3 ? "is-on" : ""}`}>
            {STATES.map((s) => (
              <Link key={s.slug} href={`/states/${s.slug}`} className="state-chip">
                {stateChip(s)}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <JoinPath {...path} />
    </>
  );
}
