"use client";

import { Sheet } from "@/components/motion/Stage";
import SceneLabel from "@/components/motion/SceneLabel";
import StepList from "@/components/motion/StepList";
import { StageVisual } from "@/components/motion/FloatCard";
import Orb, { type OrbState } from "@/components/Orb";
import { copy } from "@/lib/copy";
import { JOIN_RECAP } from "@/lib/content/join";
import JoinPath, { type JoinPathProps } from "./JoinPath";

const SCENES = copy.join.scenes;
const ORB_STATES: OrbState[] = ["listening", "idle", "speaking", "thinking", "idle"];

/**
 * The recap sheet: the five scenes as a scroll-driven step list, with
 * the orb's state as the pinned visual. Not a Scene (no timeline to
 * replay); the step list is driven by scroll position alone.
 */
export default function SceneRecap({ path }: { path: JoinPathProps }) {
  return (
    <Sheet chapter="night" className="join-recap" aria-label={JOIN_RECAP.ariaLabel}>
      <SceneLabel label={JOIN_RECAP.label} counter={JOIN_RECAP.counter} />
      <p className="sr-only">{JOIN_RECAP.textEquivalent}</p>
      <div className="join-scene__inner sheet-fill">
        <StepList
          ariaLabel={JOIN_RECAP.ariaLabel}
          steps={SCENES.map((s) => ({ label: s.label, title: s.title, body: s.body }))}
          visual={(i) => {
            const state = ORB_STATES[i] ?? "idle";
            return (
              <StageVisual block={<Orb size="ambient" px={140} state={state} />}>
                <p className="mono-label is-accent">{SCENES[i].label}</p>
                <div className="stage-bars">
                  <span />
                  <span />
                  <span className={i >= 3 ? "is-accent" : ""} />
                </div>
                <p className="stage-visual-state">
                  <Orb size="mark" px={14} state={state} />
                  {JOIN_RECAP.orbPrefix} {state}
                </p>
              </StageVisual>
            );
          }}
        />
      </div>
      <JoinPath {...path} />
    </Sheet>
  );
}
