"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { OrbState } from "@/components/Orb";
import { prefersReducedMotion } from "@/lib/useSceneTimeline";
import { STATES, stateChip } from "@/lib/config";
import JoinPath from "./JoinPath";
import SceneHook from "./SceneHook";
import SceneStates from "./SceneStates";
import SceneIntake from "./SceneIntake";
import SceneHandled from "./SceneHandled";
import SceneYou from "./SceneYou";
import "./join.css";

/**
 * JoinScenes — the scroll-driven five-scene sequence on /join.
 *
 * Backgrounds flip night → forest → night → forest → paper. One SVG
 * path (JoinPath) runs down the whole sequence; `--join-progress` is
 * how many scenes have started, over five, and drives the path draw,
 * the orb's position on it, and the four state pins.
 *
 * Reduced motion: every Scene renders its final frame on entry, and
 * the path is fully drawn from the start.
 */
const SCENE_COUNT = 5;
const PINS = STATES.map((s) => ({ label: stateChip(s) }));

export default function JoinScenes() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>("idle");

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  const markStarted = useCallback((i: number) => {
    setStarted((n) => Math.max(n, i + 1));
  }, []);
  const starters = useMemo(
    () => Array.from({ length: SCENE_COUNT }, (_, i) => () => markStarted(i)),
    [markStarted]
  );

  const progress = reduced ? 1 : started / SCENE_COUNT;

  return (
    <div
      ref={hostRef}
      className="join-scenes"
      data-reduced={reduced ? "true" : "false"}
      style={{ "--join-progress": progress } as CSSProperties}
    >
      <SceneHook onStart={starters[0]} />
      <SceneStates onStart={starters[1]} />
      <SceneIntake onStart={starters[2]} onOrb={setOrbState} />
      <SceneHandled onStart={starters[3]} />
      <SceneYou onStart={starters[4]} />
      <JoinPath hostRef={hostRef} progress={progress} orbState={orbState} pins={PINS} />
    </div>
  );
}
