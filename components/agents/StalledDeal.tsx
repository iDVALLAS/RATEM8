"use client";

import Scene from "@/components/motion/Scene";
import Orb, { type OrbState } from "@/components/Orb";
import SampleBadge from "@/components/SampleBadge";
import { copy } from "@/lib/copy";
import { agentsContent } from "@/lib/content/agents";
import "./agents.css";

/**
 * StalledDeal — the /agents centerpiece: a stalled deal that unsticks.
 *
 *   // 01 — stalled   buyer card, `financing: unclear`, flickering
 *   // 02 — M8        the orb slides in and reads the situation
 *   // 03 — unstuck   `financing: documented`, timeline lights up,
 *                     the card completes with a drafted brief
 *
 * One Scene, one timeline. Replayable; reduced motion shows the final
 * state. The address is fictional and labeled as a sample.
 */

// ms offsets from scene start, one per step.
const STEPS = [
  0, //    0  card lands, first dot lit                      (beat 01)
  1400, // 1  orb slides in, listening; "reading the situation" (beat 02)
  2100, // 2  orb thinking
  3200, // 3  status flips to documented; flicker stops         (beat 03)
  3350, // 4  dot: pre-approval
  3500, // 5  dot: LE reviewed
  3650, // 6  dot: lock
  3800, // 7  dot: clear to close
  4100, // 8  card completes: accent border + brief chip; orb idle
];

const FLIP = 3; // the step at which the deal unsticks
const FIRST_DOT_SEQ = 4; // dots 1..n light from this step, 150 ms apart
const DONE = 8;

function beatFor(step: number): number {
  if (step < 1) return 0;
  if (step < FLIP) return 1;
  return 2;
}

function orbStateFor(step: number): OrbState {
  if (step === 1) return "listening";
  if (step === 2) return "thinking";
  return "idle";
}

export default function StalledDeal() {
  const scenes = copy.agentsPage.scenes;
  const timeline = copy.agentsPage.timeline;
  const c = agentsContent.scene;

  return (
    <Scene
      label={c.sceneLabel}
      steps={STEPS}
      background="forest"
      badge={<SampleBadge />}
      textEquivalent={c.textEquivalent}
      id="stalled-deal"
    >
      {({ step }) => {
        const beat = beatFor(step);
        const flipped = step >= FLIP;
        const done = step >= DONE;
        const orbOn = step >= 1;
        const orbState = orbStateFor(step);

        return (
          <div className="ag-stage-wrap">
            {/* Beat strip + running counter */}
            <div className="ag-beats" aria-hidden="true">
              {scenes.map((s, i) => (
                <span key={s.label} className={`ag-beat ${i === beat ? "is-active" : i < beat ? "is-past" : ""}`}>
                  {s.label}
                </span>
              ))}
              <span className="ag-counter">
                {String(beat + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}
              </span>
            </div>

            <div className="ag-stage">
              {/* The orb: slides in on beat 02, settles to idle on 03 */}
              <div className={`ag-orb step-slide-r ${orbOn ? "is-on" : ""}`}>
                <Orb size="ambient" state={orbState} />
              </div>

              {/* The buyer card */}
              <div className={`card ag-card step-in ${step >= 0 ? "is-on" : ""} ${done ? "is-done" : ""}`}>
                <div className="ag-card__head">
                  <div>
                    <div className="mono-label">{c.cardLabel}</div>
                    <div className="ag-card__addr">
                      <span className="ag-card__title">{c.address}</span>
                      <span className="ag-tag">{c.sampleTag}</span>
                    </div>
                  </div>
                </div>

                <div className={`ag-status ${flipped ? "ag-status--ok" : "ag-status--warn"}`} role="status" aria-live="polite">
                  <span className={`ag-status__value ${!flipped && step >= 0 ? "is-flickering" : ""}`}>
                    <span className="ag-status__dot" aria-hidden="true" />
                    {flipped ? scenes[2].status : scenes[0].status}
                  </span>
                </div>

                <div className={`ag-orb-line step-in ${orbOn && !flipped ? "is-on" : ""}`} aria-hidden={!orbOn || flipped}>
                  <span className={step === 1 || step === 2 ? "tw-cursor" : ""}>{c.orbLine}</span>
                </div>

                <div className="ag-tl">
                  <ol className="tl" aria-label="Deal timeline">
                    {timeline.map((label, i) => {
                      const lit = i === 0 ? step >= 0 : step >= FIRST_DOT_SEQ + (i - 1);
                      return (
                        <li key={label} className="tl-step">
                          <span className={`tl-dot ${lit ? "is-on" : ""}`} aria-hidden="true" />
                          <span className="tl-label">{label}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className={`step-scale ${done ? "is-on" : ""}`} aria-hidden={!done}>
                  <span className="ag-chip">{c.briefChip}</span>
                </div>
              </div>
            </div>

            <p className="ag-beat-title" aria-hidden="true">
              {scenes[beat].title}
            </p>
          </div>
        );
      }}
    </Scene>
  );
}
