"use client";

import StepList, { type StepItem } from "@/components/motion/StepList";
import { StageVisual } from "@/components/motion/FloatCard";
import Orb, { type OrbState } from "@/components/Orb";

/**
 * HowItWorksSteps — the three borrower steps as a scroll-driven step
 * list. The pinned visual is the orb over a gradient block with a tiny
 * Rate Strategy Brief card floating over it; the orb's state and the
 * card's fill change with the active step.
 *
 *   01 talk    orb listening, card empty bars
 *   02 brief   orb thinking, one bar filled green (the brief drafting)
 *   03 verify  orb idle, the verified line lit
 *
 * Client component because the visual is a render prop.
 */
const ORB_STATES: OrbState[] = ["listening", "thinking", "idle"];

type Props = {
  steps: readonly StepItem[];
  ariaLabel: string;
  orbPrefix: string;
};

export default function HowItWorksSteps({ steps, ariaLabel, orbPrefix }: Props) {
  return (
    <StepList
      ariaLabel={ariaLabel}
      steps={steps}
      visual={(i) => {
        const state = ORB_STATES[i] ?? "idle";
        return (
          <StageVisual block={<Orb size="ambient" px={140} state={state} />}>
            <p className="mono-label is-accent">{steps[i]?.label}</p>
            <p className="stage-visual-title">{steps[i]?.title}</p>
            <div className="stage-bars">
              <span />
              <span />
              <span className={i >= 1 ? "is-accent" : ""} />
            </div>
            <p className="stage-visual-state">
              <Orb size="mark" px={14} state={state} />
              {orbPrefix} {state}
            </p>
          </StageVisual>
        );
      }}
    />
  );
}
