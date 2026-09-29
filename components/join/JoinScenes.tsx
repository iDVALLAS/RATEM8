"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrbState } from "@/components/Orb";
import Stage from "@/components/motion/Stage";
import { prefersReducedMotion } from "@/lib/useSceneTimeline";
import { STATES, stateChip } from "@/lib/config";
import type { JoinPathProps } from "./JoinPath";
import SceneHook from "./SceneHook";
import SceneStates from "./SceneStates";
import SceneIntake from "./SceneIntake";
import SceneHandled from "./SceneHandled";
import SceneYou from "./SceneYou";
import SceneRecap from "./SceneRecap";
import "./join.css";

/**
 * JoinScenes — the scroll-driven five-scene sequence on /join, as
 * stacked sheets on the ambient stage.
 *
 * Backgrounds flip night → forest → night → forest → paper, then a
 * night recap sheet with the five scenes as a step list. The path runs
 * down the left gutter in one segment per sheet (see JoinPath): a
 * segment draws when its scene starts, and the orb rides the segment
 * of the most recently started scene, so it travels sheet to sheet.
 *
 * Reduced motion: every Scene renders its final frame on entry, and
 * every segment is fully drawn from the start.
 */
const SCENE_COUNT = 5;
const PINS = STATES.map((s) => ({ label: stateChip(s) }));

export default function JoinScenes() {
  const [started, setStarted] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>("idle");

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  const markStarted = useCallback((i: number) => {
    setStarted((n) => Math.max(n, i + 1));
  }, []);
  const starters = useMemo(() => Array.from({ length: SCENE_COUNT }, (_, i) => () => markStarted(i)), [markStarted]);

  const orbAt = Math.max(started - 1, 0);
  const segment = (i: number, pins?: JoinPathProps["pins"]): JoinPathProps => ({
    progress: reduced || started > i ? 1 : 0,
    orbState,
    showOrb: i === orbAt,
    pins,
  });

  return (
    <div className="join-scenes" data-reduced={reduced ? "true" : "false"}>
      <Stage>
        <SceneHook onStart={starters[0]} path={segment(0)} />
        <SceneStates onStart={starters[1]} path={segment(1, PINS)} />
        <SceneIntake onStart={starters[2]} onOrb={setOrbState} path={segment(2)} />
        <SceneHandled onStart={starters[3]} path={segment(3)} />
        <SceneYou onStart={starters[4]} path={segment(4)} />
        <SceneRecap path={{ progress: reduced || started >= SCENE_COUNT ? 1 : 0, orbState: "idle", showOrb: false }} />
      </Stage>
    </div>
  );
}
