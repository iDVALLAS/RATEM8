"use client";

import { useState } from "react";
import Scene from "@/components/motion/Scene";
import Stage from "@/components/motion/Stage";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import Bento, { BentoSlot } from "@/components/motion/Bento";
import Orb, { type OrbState } from "@/components/Orb";
import SampleBadge from "@/components/SampleBadge";
import BookingCTA from "@/components/BookingCTA";
import { copy } from "@/lib/copy";
import { SAMPLE_SENTENCE } from "@/lib/config";
import { seq } from "@/lib/useSceneTimeline";
import SampleDoc, { type FieldState } from "./SampleDoc";
import PointsToggle, { type ToggleValue } from "./PointsToggle";
import { SAMPLE_FIELDS, type SampleFieldId } from "./sample";
import { SL } from "./strings";
import "./second-look.css";

/**
 * SecondLookDemo — Layer 1. Five chained, scroll-triggered Scenes over
 * a FICTIONAL Loan Estimate. Every frame carries <SampleBadge />.
 *
 * Each Scene has its own replay control (built into Scene). The
 * "replay all" control remounts all five (via `runId`), which restarts
 * each one the moment it is back in the viewport, and resets the toggle.
 *
 * The five Scenes are stacked sheets on the ambient stage; chapters
 * alternate night → forest → night → forest → paper.
 */

const scenes = copy.secondLook.scenes;
const decoded = copy.secondLook.decoded;
/** Accent phrase per scene title (presentation only; titles are verbatim). */
const ACCENTS = ["Drop", "reads", "Decoded.", "or credit?", "licensed human"];

function OrbStrip({ state }: { state: OrbState }) {
  return (
    <div className="sl-orb">
      <Orb size="ambient" state={state} />
      <span className={`sl-orb__state ${state !== "idle" ? "is-active" : ""}`}>
        {SL.orbPrefix} {state}
      </span>
    </div>
  );
}

function SceneHead({ i, dim = true }: { i: number; dim?: boolean }) {
  return (
    <>
      <SlideHeadline as="h2" lines={splitLines(scenes[i].title)} accent={ACCENTS[i]} dim={dim} className="sl-scene__title" />
      <p className="sl-scene__body">{scenes[i].body}</p>
    </>
  );
}

/* ─── Step maps ─────────────────────────────────────────────── */

// 02 — read: [start, scan on, (reading, found) × 7]
const READ_STEPS = [0, 300, ...SAMPLE_FIELDS.flatMap((_, i) => [700 + i * 300, 700 + i * 300 + 200])];
const readFieldState = (step: number, i: number): FieldState =>
  step >= 3 + 2 * i ? "found" : step >= 2 + 2 * i ? "reading" : "idle";

const TEXT_EQ = {
  drop: `${scenes[0].title} A dashed drop slot appears. A tilted sample Loan Estimate for a fictional borrower slides in from the left and settles flat. The M8 orb wakes from idle to listening. ${SAMPLE_SENTENCE}`,
  read: `${scenes[1].title} A green scan line sweeps down the sample document. Seven fields light up in sequence, each tagged "reading…" then "found": interest rate 6.500%, APR 6.712%, points $4,000, lender credits $0, Section A origination charges $5,195, Section B and C services $3,880, cash to close $47,250. The orb is thinking. ${SAMPLE_SENTENCE}`,
  decoded: `${scenes[2].title} A dashed grid fills card by card: ${decoded.trueCost.title} — ${decoded.trueCost.body} ${decoded.negotiable.title} — ${decoded.negotiable.body} ${decoded.cashToClose.title} — ${decoded.cashToClose.body} ${decoded.toggle.title} — ${decoded.toggle.body} ${decoded.questions.title}: ${decoded.questions.items.join(" ")} The orb is speaking. ${SAMPLE_SENTENCE}`,
  toggle: `${scenes[3].title} An interactive switch, "${copy.secondLook.toggleLabels.points}" or "${copy.secondLook.toggleLabels.credit}", updates the monthly principal-and-interest payment, the upfront cost, and the break-even month using deterministic math on a fictional $400,000 loan. A row of eight timeline dots (months 0 to 84) lights up in sequence to the break-even month. ${SAMPLE_SENTENCE}`,
  handoff: `${scenes[4].title} The orb settles back to idle. A card reads: ${copy.secondLook.handoff.title} ${copy.secondLook.handoff.body} A booking button follows.`,
};

export default function SecondLookDemo() {
  const [runId, setRunId] = useState(0);
  const [toggle, setToggle] = useState<ToggleValue>(0);

  const replayAll = () => {
    setToggle(0);
    setRunId((n) => n + 1);
  };

  return (
    <Stage className="sl-demo" key={runId}>
      {/* ── 01 — drop ── */}
      <Scene
        label={scenes[0].label}
        counter="01 / 05"
        steps={[0, 400, 1100]}
        background="night"
        badge={<SampleBadge />}
        textEquivalent={TEXT_EQ.drop}
        className="sl-scene sheet-item"
      >
        {({ step, reduced }) => (
          <div className="sl-scene__inner sheet-fill">
            <div className="sl-grid">
              <div>
                <SceneHead i={0} />
                <OrbStrip state={step >= 2 ? "listening" : "idle"} />
              </div>
              <div className="dashed-box sl-slot">
                <div className={`sl-slot__hint mono-label ${step >= 1 ? "is-hidden" : ""}`} aria-hidden="true">
                  {SL.dropHint}
                </div>
                <div className={`sl-doc-wrap step-slide-l ${step >= 1 ? "is-on" : ""}`}>
                  <div className={`sl-doc-tilt ${reduced || step >= 2 ? "is-flat" : ""}`}>
                    <SampleDoc fieldState={{}} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Scene>

      {/* ── 02 — read ── */}
      <Scene
        label={scenes[1].label}
        counter="02 / 05"
        steps={READ_STEPS}
        background="forest"
        badge={<SampleBadge />}
        textEquivalent={TEXT_EQ.read}
        className="sl-scene sheet-item"
      >
        {({ step, reduced }) => {
          const fieldState = Object.fromEntries(
            SAMPLE_FIELDS.map((f, i) => [f.id, readFieldState(step, i)])
          ) as Record<SampleFieldId, FieldState>;
          return (
            <div className="sl-scene__inner sheet-fill">
              <div className="sl-grid">
                <div>
                  <SceneHead i={1} />
                  <OrbStrip state={step >= 1 && step < READ_STEPS.length - 1 ? "thinking" : step >= 1 ? "listening" : "idle"} />
                  <div className="mono-label" style={{ marginTop: 20, marginBottom: 8 }}>
                    {SL.readList}
                  </div>
                  <ol className="sl-questions" aria-hidden="true">
                    {SAMPLE_FIELDS.map((f, i) => {
                      const s = readFieldState(step, i);
                      return (
                        <li key={f.id} className={`step-in ${s !== "idle" ? "is-on" : ""}`} style={{ color: s === "found" ? "var(--fg)" : undefined }}>
                          <span>
                            {f.label}
                            {s === "found" ? <b style={{ fontWeight: 500, marginLeft: 8 }}>{f.value}</b> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="sl-slot dashed-box">
                  <div className="sl-doc-wrap">
                    <SampleDoc fieldState={fieldState} scan={step >= 1 && !reduced} />
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </Scene>

      {/* ── 03 — decoded ── */}
      <Scene
        label={scenes[2].label}
        counter="03 / 05"
        steps={seq(0, 150, 6)}
        background="night"
        badge={<SampleBadge />}
        textEquivalent={TEXT_EQ.decoded}
        className="sl-scene sheet-item"
      >
        {({ step, reduced }) => (
          <div className="sl-scene__inner sheet-fill">
            <SceneHead i={2} />
            <OrbStrip state={step >= 1 ? "speaking" : "idle"} />
            <Bento cols={2} className="mt-5">
              <BentoSlot filled={step >= 1} label="// true cost" className="float-card">
                <div className="sl-card-title">{decoded.trueCost.title}</div>
                <div className="sl-kv">
                  <span>{SL.live.labels.rate}</span>
                  <b>6.500%</b>
                </div>
                <div className="sl-kv">
                  <span>{SL.live.labels.apr}</span>
                  <b>6.712%</b>
                </div>
                <p className="sl-card-body" style={{ marginTop: 8 }}>
                  {decoded.trueCost.body}
                </p>
              </BentoSlot>
              <BentoSlot filled={step >= 2} label="// negotiable vs. fixed" className="float-card">
                <div className="sl-card-title">{decoded.negotiable.title}</div>
                <div className="sl-kv">
                  <span>{SL.live.labels.sectionA}</span>
                  <b>$5,195</b>
                </div>
                <div className="sl-kv">
                  <span>{SL.live.labels.sectionBC}</span>
                  <b>$3,880</b>
                </div>
                <p className="sl-card-body" style={{ marginTop: 8 }}>
                  {decoded.negotiable.body}
                </p>
              </BentoSlot>
              <BentoSlot filled={step >= 3} label="// cash to close" className="float-card">
                <div className="sl-card-title">{decoded.cashToClose.title}</div>
                <div className="sl-kv">
                  <span>{SL.live.labels.cashToCloseField}</span>
                  <b>$47,250</b>
                </div>
                <p className="sl-card-body" style={{ marginTop: 8 }}>
                  {decoded.cashToClose.body}
                </p>
              </BentoSlot>
              <BentoSlot filled={step >= 4} label="// points vs. credit" className="float-card">
                <div className="sl-card-title">{decoded.toggle.title}</div>
                <p className="sl-card-body" style={{ marginBottom: 12 }}>
                  {decoded.toggle.body}
                </p>
                <PointsToggle value={toggle} onChange={setToggle} reduced={reduced} compact idPrefix="sl-pvc-3" />
              </BentoSlot>
              <BentoSlot filled={step >= 5} label="// questions" span="sm:col-span-2" className="float-card">
                <div className="sl-card-title">{decoded.questions.title}</div>
                <ol className="sl-questions">
                  {decoded.questions.items.map((q) => (
                    <li key={q}>
                      <span>{q}</span>
                    </li>
                  ))}
                </ol>
              </BentoSlot>
            </Bento>
          </div>
        )}
      </Scene>

      {/* ── 04 — toggle ── */}
      <Scene
        label={scenes[3].label}
        counter="04 / 05"
        steps={[0, 300, 700]}
        background="forest"
        badge={<SampleBadge />}
        textEquivalent={TEXT_EQ.toggle}
        className="sl-scene sheet-item"
      >
        {({ step, reduced }) => (
          <div className="sl-scene__inner sheet-fill">
            <div className="sl-grid">
              <div>
                <SceneHead i={3} />
                <OrbStrip state={step >= 1 ? "listening" : "idle"} />
                <p className="mono-label" style={{ marginTop: 16 }}>
                  {SAMPLE_SENTENCE}
                </p>
              </div>
              <div className={`card step-in ${step >= 1 ? "is-on" : ""}`}>
                <div className="bento-slot__label">{"// points vs. credit"}</div>
                <PointsToggle value={toggle} onChange={setToggle} reduced={reduced} active={step >= 2} idPrefix="sl-pvc-4" />
              </div>
            </div>
          </div>
        )}
      </Scene>

      {/* ── 05 — handoff ── */}
      <Scene
        label={scenes[4].label}
        counter="05 / 05"
        steps={[0, 400]}
        background="paper"
        badge={<SampleBadge />}
        textEquivalent={TEXT_EQ.handoff}
        className="sl-scene sheet-item"
      >
        {({ step }) => (
          <div className="sl-scene__inner sheet-fill">
            <div className="sl-grid">
              <div>
                <SceneHead i={4} dim={false} />
                <OrbStrip state="idle" />
                <button type="button" className="sl-replay-all" onClick={replayAll} style={{ marginTop: 12 }}>
                  ↻ {SL.replayAll}
                </button>
              </div>
              <div className={`card sl-handoff step-in ${step >= 1 ? "is-on" : ""}`}>
                <div className="sl-card-title">{copy.secondLook.handoff.title}</div>
                <p className="sl-card-body" style={{ marginBottom: 16 }}>
                  {copy.secondLook.handoff.body}
                </p>
                <BookingCTA kind="secondLook" variant="pill">
                  {copy.secondLook.handoff.cta}
                </BookingCTA>
              </div>
            </div>
          </div>
        )}
      </Scene>
    </Stage>
  );
}
