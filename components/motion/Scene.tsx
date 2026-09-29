"use client";

import { useSceneTimeline, type SceneTimeline } from "@/lib/useSceneTimeline";
import SceneLabel from "./SceneLabel";
import ReplayButton from "./ReplayButton";

/**
 * Scene — a viewport-triggered, replayable, reduced-motion-aware
 * section. Wires useSceneTimeline to a mono corner label and a replay
 * control, and hands `step` to a render-prop child.
 *
 * `background`: "night" | "forest" | "paper" flips the scene chapter
 * color (see .scene--* in globals.css). Text tokens follow.
 *
 * `textEquivalent` is rendered visually-hidden so every animation has a
 * plain-text description (WCAG).
 */
type SceneProps = {
  label: string;
  counter?: string;
  steps: number[];
  background?: "night" | "forest" | "paper" | "none";
  className?: string;
  badge?: React.ReactNode;
  textEquivalent: string;
  autoStart?: boolean;
  loop?: boolean;
  loopDelay?: number;
  id?: string;
  children: (t: SceneTimeline<HTMLElement>) => React.ReactNode;
};

export default function Scene({
  label,
  counter,
  steps,
  background = "none",
  className = "",
  badge,
  textEquivalent,
  autoStart,
  loop,
  loopDelay,
  id,
  children,
}: SceneProps) {
  const t = useSceneTimeline<HTMLElement>({ steps, autoStart, loop, loopDelay });
  return (
    <section
      id={id}
      ref={t.ref}
      data-step={t.step}
      data-reduced={t.reduced ? "true" : "false"}
      className={`scene scene--${background} ${className}`}
    >
      <SceneLabel
        label={label}
        counter={counter}
        right={
          <>
            {badge}
            <ReplayButton onClick={t.replay} />
          </>
        }
      />
      <p className="sr-only">{textEquivalent}</p>
      {children(t)}
    </section>
  );
}
