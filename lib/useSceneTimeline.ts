"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useSceneTimeline — the one motion primitive the site uses.
 *
 * A scene is a sequence of numbered steps. The timeline:
 *   - starts when the scene's root element enters the viewport
 *     (IntersectionObserver), plays ONCE, and exposes `step`
 *   - is replayable via `replay()`
 *   - respects `prefers-reduced-motion` by jumping straight to the
 *     final step with no transitions (`reduced` is true so components
 *     can also skip CSS transitions)
 *
 * Usage:
 *   const { ref, step, replay, reduced, done } = useSceneTimeline({
 *     steps: [0, 400, 800, 1400],   // ms offsets from start, one per step
 *   });
 *   <section ref={ref} data-step={step}> ... </section>
 *
 * `step` is -1 before the scene starts, then 0..steps.length-1.
 * Step 0 fires at `steps[0]` ms (usually 0) once the element is visible.
 */

export type SceneTimelineOptions = {
  /** Millisecond offsets from scene start, one per step. Must be ascending. */
  steps: number[];
  /** IntersectionObserver threshold. Default 0.35. */
  threshold?: number;
  /** Root margin. Default "0px 0px -10% 0px". */
  rootMargin?: string;
  /** Start immediately without waiting for viewport entry. */
  autoStart?: boolean;
  /** Loop: when the last step lands, wait `loopDelay` ms and restart. */
  loop?: boolean;
  loopDelay?: number;
};

export type SceneTimeline<T extends HTMLElement = HTMLElement> = {
  ref: (el: T | null) => void;
  /** -1 = not started. */
  step: number;
  /** True once the final step has fired (or immediately under reduced motion). */
  done: boolean;
  /** True when the user prefers reduced motion. */
  reduced: boolean;
  /** Restart from step -1. Ignores reduced-motion (user asked for it). */
  replay: () => void;
  /** Jump to a specific step (dev toggles, tests). */
  jumpTo: (step: number) => void;
  /** Number of steps. */
  total: number;
};

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSceneTimeline<T extends HTMLElement = HTMLElement>(
  options: SceneTimelineOptions
): SceneTimeline<T> {
  const { steps, threshold = 0.35, rootMargin = "0px 0px -10% 0px", autoStart = false, loop = false, loopDelay = 2400 } = options;
  const total = steps.length;
  const [step, setStep] = useState(-1);
  const [reduced, setReduced] = useState(false);
  const [element, setElement] = useState<T | null>(null);
  const timers = useRef<number[]>([]);
  const started = useRef(false);
  const forcePlay = useRef(false);

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    clear();
    setStep(-1);
    steps.forEach((offset, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          if (loop && i === total - 1) {
            timers.current.push(window.setTimeout(() => play(), loopDelay));
          }
        }, Math.max(0, offset))
      );
    });
  }, [steps, clear, loop, loopDelay, total]);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    if (prefersReducedMotion() && !forcePlay.current) {
      setReduced(true);
      setStep(total - 1);
      return;
    }
    play();
  }, [play, total]);

  const replay = useCallback(() => {
    forcePlay.current = true;
    started.current = false;
    setReduced(false);
    start();
  }, [start]);

  const jumpTo = useCallback((s: number) => {
    clear();
    started.current = true;
    setStep(Math.max(-1, Math.min(total - 1, s)));
  }, [clear, total]);

  const ref = useCallback((el: T | null) => setElement(el), []);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (autoStart) {
      start();
      return clear;
    }
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      start();
      return clear;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    io.observe(element);
    return () => {
      io.disconnect();
      clear();
    };
  }, [element, autoStart, start, clear, threshold, rootMargin]);

  return { ref, step, done: step >= total - 1, reduced, replay, jumpTo, total };
}

/** Helper: is a given step index reached? */
export function reached(step: number, i: number): boolean {
  return step >= i;
}

/** Build a steps array from a base delay and an interval: seq(0, 150, 5) → [0,150,300,450,600]. */
export function seq(start: number, interval: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i * interval);
}
