"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useSceneRun — glue between a Scene's `step` and the page-level path.
 *
 * - Calls `onStart` the first time a scene run begins (step goes from
 *   -1 to ≥ 0). Under reduced motion Scene jumps straight to its last
 *   step, which still counts as a start.
 * - Returns a `run` counter that increments whenever the scene is
 *   replayed (step drops back to -1). Use it as a React `key` so
 *   self-timed children (Reveal) remount and replay too.
 */
export function useSceneRun(step: number, onStart?: () => void): number {
  const [run, setRun] = useState(0);
  const prev = useRef(step);
  useEffect(() => {
    const was = prev.current;
    prev.current = step;
    if (step >= 0 && was < 0) onStart?.();
    if (step < 0 && was >= 0) setRun((r) => r + 1);
  }, [step, onStart]);
  return run;
}
