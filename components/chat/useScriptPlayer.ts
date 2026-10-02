"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbState } from "@/components/Orb";
import { prefersReducedMotion } from "@/lib/useSceneTimeline";

/**
 * useScriptPlayer — plays `copy.chat.script` as a timed conversation.
 *
 *   user bubble  → appears whole, orb "listening", short pause
 *   m8 bubble    → orb "thinking" for THINK_MS, then "speaking" while the
 *                  text types out (~PER_CHAR_MS per char, whole message
 *                  capped at MAX_TYPE_MS), short pause
 *
 * Under prefers-reduced-motion the whole script renders at once and the
 * orb stays idle. `replay()` restarts and forces playback even under
 * reduced motion (the user asked for it), matching useSceneTimeline.
 *
 * No network. No storage. Pure timers, all cleared on unmount/replay.
 */

export type ScriptLine = { from: string; text: string };

export type ShownLine = {
  id: number;
  from: "m8" | "user";
  /** Full text (for the screen-reader copy). */
  text: string;
  /** Text typed so far (for the visible copy). */
  visible: string;
  typing: boolean;
};

const THINK_MS = 600;
const PER_CHAR_MS = 18;
const MAX_TYPE_MS = 2000;
const AFTER_USER_MS = 1100;
const AFTER_M8_MS = 700;
const LEAD_IN_MS = 400;

function whole(script: ScriptLine[]): ShownLine[] {
  return script.map((m, i) => ({
    id: i,
    from: m.from === "m8" ? "m8" : "user",
    text: m.text,
    visible: m.text,
    typing: false,
  }));
}

export function useScriptPlayer(script: ScriptLine[], active: boolean) {
  const [shown, setShown] = useState<ShownLine[]>([]);
  const [orb, setOrb] = useState<OrbState>("idle");
  const [reduced, setReduced] = useState(false);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const force = useRef(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!active) return;

    if (prefersReducedMotion() && !force.current) {
      setShown(whole(script));
      setOrb("idle");
      setDone(true);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const play = async () => {
      setShown([]);
      setDone(false);
      setOrb("idle");
      await sleep(LEAD_IN_MS);

      for (let i = 0; i < script.length; i++) {
        if (cancelled) return;
        const line = script[i];

        if (line.from !== "m8") {
          setShown((s) => [...s, { id: i, from: "user", text: line.text, visible: line.text, typing: false }]);
          setOrb("listening");
          await sleep(AFTER_USER_MS);
          continue;
        }

        setOrb("thinking");
        await sleep(THINK_MS);
        if (cancelled) return;

        setOrb("speaking");
        const len = line.text.length;
        const perChar = Math.min(PER_CHAR_MS, MAX_TYPE_MS / Math.max(1, len));
        setShown((s) => [...s, { id: i, from: "m8", text: line.text, visible: "", typing: true }]);

        const start = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            if (cancelled) return resolve();
            const n = Math.min(len, Math.floor((performance.now() - start) / perChar));
            setShown((s) =>
              s.map((m) => (m.id === i ? { ...m, visible: line.text.slice(0, n), typing: n < len } : m))
            );
            if (n >= len) return resolve();
            timers.push(window.setTimeout(tick, Math.max(16, perChar)));
          };
          tick();
        });

        await sleep(AFTER_M8_MS);
      }

      if (!cancelled) {
        setOrb("idle");
        setDone(true);
      }
    };

    void play();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [active, run, script]);

  const replay = useCallback(() => {
    force.current = true;
    setReduced(false);
    setRun((r) => r + 1);
  }, []);

  return { shown, orb, reduced, done, replay };
}
