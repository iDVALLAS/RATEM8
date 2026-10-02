"use client";

import { useEffect, useMemo } from "react";
import Scene from "@/components/motion/Scene";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import Orb, { type OrbState } from "@/components/Orb";
import SampleBadge from "@/components/SampleBadge";
import { copy } from "@/lib/copy";
import { AI_DISCLOSURE } from "@/lib/config";
import { JOIN_BRIEF, JOIN_TEXT_EQUIVALENTS } from "@/lib/content/join";
import JoinPath, { type JoinPathProps } from "./JoinPath";
import { useSceneRun } from "./useSceneRun";

const S = copy.join.scenes[2];
const CHAT = copy.join.intakeChat;

type Ev =
  | { kind: "phone" }
  | { kind: "typing"; i: number }
  | { kind: "bubble"; i: number }
  | { kind: "brief-gen" }
  | { kind: "brief-done" };

/**
 * Build the event list once from the scripted chat: M8 bubbles are
 * preceded by a ~500 ms typing indicator; the brief card then
 * "generates" (bar fills) and flips to "drafted".
 */
function buildTimeline(): { events: Ev[]; steps: number[] } {
  const events: Ev[] = [];
  const steps: number[] = [];
  let t = 0;
  const push = (ev: Ev, at: number) => {
    events.push(ev);
    steps.push(at);
  };
  push({ kind: "phone" }, 0);
  t = 500;
  CHAT.forEach((m, i) => {
    if (m.from === "m8") {
      push({ kind: "typing", i }, t);
      t += 500;
      push({ kind: "bubble", i }, t);
      t += 1000;
    } else {
      push({ kind: "bubble", i }, t);
      t += 800;
    }
  });
  push({ kind: "brief-gen" }, t);
  t += 1100;
  push({ kind: "brief-done" }, t);
  return { events, steps };
}

const TL = buildTimeline();

function orbStateAt(step: number): OrbState {
  const ev = TL.events[step];
  if (!ev) return "idle";
  switch (ev.kind) {
    case "phone":
      return "listening";
    case "typing":
    case "brief-gen":
      return "thinking";
    case "bubble":
      return CHAT[ev.i].from === "m8" ? "speaking" : "listening";
    default:
      return "idle";
  }
}

const idxOf = (pred: (e: Ev) => boolean) => TL.events.findIndex(pred);

/** `// 03 — intake`: a phone mockup plays the scripted chat, then the brief drafts. */
export default function SceneIntake({ onStart, onOrb, path }: { onStart: () => void; onOrb: (s: OrbState) => void; path: JoinPathProps }) {
  return (
    <Scene
      label={S.label}
      counter="03 / 05"
      steps={TL.steps}
      background="night"
      className="join-intake-scene sheet-item"
      badge={<SampleBadge />}
      textEquivalent={JOIN_TEXT_EQUIVALENTS[2]}
    >
      {({ step }) => <IntakeBody step={step} onStart={onStart} onOrb={onOrb} path={path} />}
    </Scene>
  );
}

function IntakeBody({ step, onStart, onOrb, path }: { step: number; onStart: () => void; onOrb: (s: OrbState) => void; path: JoinPathProps }) {
  const run = useSceneRun(step, onStart);
  const orb = useMemo(() => orbStateAt(step), [step]);
  useEffect(() => {
    onOrb(orb);
  }, [orb, onOrb]);

  const genIdx = idxOf((e) => e.kind === "brief-gen");
  const doneIdx = idxOf((e) => e.kind === "brief-done");
  const briefState = step >= doneIdx ? "is-drafted" : step >= genIdx ? "is-generating" : "";

  return (
    <>
    <div className="join-scene__inner sheet-fill">
      <div className="join-intake">
        <div>
          <SlideHeadline runKey={run} as="h2" lines={splitLines(S.title)} accent="first conversation." dim className="join-scene__title" />
          <p className={`join-scene__body step-in ${step >= 1 ? "is-on" : ""}`}>{S.body}</p>
          <div className={`join-orb-status step-in ${step >= 1 ? "is-on" : ""}`}>
            <Orb size="mark" state={orb} />
            <span className="mono-label">{`// m8: ${orb}`}</span>
          </div>
        </div>

        <div className={`phone step-scale ${step >= 0 ? "is-on" : ""}`} aria-hidden="true">
          <div className="phone__notch" />
          <div className="join-phone__header">
            <Orb size="mark" px={16} state={orb} />
            <span className="mono-label">M8 · {AI_DISCLOSURE}</span>
          </div>
          <div className="join-phone__stream">
            {CHAT.map((m, i) => {
              const bubbleIdx = idxOf((e) => e.kind === "bubble" && e.i === i);
              const typingIdx = idxOf((e) => e.kind === "typing" && e.i === i);
              const showTyping = m.from === "m8" && step === typingIdx;
              const showBubble = step >= bubbleIdx;
              if (showTyping) {
                return (
                  <span key={`t-${i}`} className="bubble bubble--m8 bubble--typing">
                    <i />
                    <i />
                    <i />
                  </span>
                );
              }
              if (!showBubble) return null;
              return (
                <span key={`b-${i}`} className={`bubble ${m.from === "m8" ? "bubble--m8" : "bubble--user"} step-in is-on`}>
                  {m.text}
                </span>
              );
            })}
          </div>
          {step >= genIdx ? (
            <div className={`join-brief ${briefState}`}>
              <span>{step >= doneIdx ? JOIN_BRIEF.drafted : copy.join.briefGenerating}</span>
              <div className="join-brief__track">
                <div className="join-brief__bar" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    <JoinPath {...path} />
    </>
  );
}
