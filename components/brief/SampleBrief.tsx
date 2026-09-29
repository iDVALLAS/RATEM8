"use client";

import Scene from "@/components/motion/Scene";
import Stage from "@/components/motion/Stage";
import SampleBadge from "@/components/SampleBadge";
import OptionsRow from "./OptionsRow";
import { briefContent as c, briefSample as s } from "@/lib/content/sample-brief";
import { NOT_A_COMMITMENT, SAMPLE_SENTENCE } from "@/lib/config";
import { seq } from "@/lib/useSceneTimeline";
import "./brief.css";

/**
 * SampleBrief — the Rate Strategy Brief as a paper document that
 * "opens" on scroll. Step 0 unfolds the page (`.step-scale`); steps 1–5
 * bring each section in. Every section carries a SampleBadge.
 */
const STEPS = seq(0, 220, 6);

export default function SampleBrief() {
  return (
    <Stage>
    <Scene
      label={c.sceneLabel}
      steps={STEPS}
      background="night"
      badge={<SampleBadge />}
      textEquivalent={c.textEquivalent}
      className="br-scene sheet-item"
      threshold={0.15}
    >
      {({ step }) => (
        <div className="px-4 pt-6 sm:px-6 sheet-fill">
          <article className={`doc br-doc step-scale ${step >= 0 ? "is-on" : ""}`} aria-label={`${c.docTitle} (sample)`}>
            <header className="br-doc__head">
              <div>
                <p className="br-doc__title">{c.docTitle}</p>
                <p className="br-doc__for mt-2">
                  {c.preparedFor}
                  <b>
                    {s.borrower} · {s.date}
                  </b>
                </p>
              </div>
              <SampleBadge />
            </header>

            {/* 1. Your situation */}
            <Section n={1} step={step} title={c.sections.situation}>
              <dl className="br-kv">
                {s.situation.map(([k, v]) => (
                  <div key={k} className="doc__row">
                    <dt>{k}</dt>
                    <dd>
                      <b>{v}</b>
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            {/* 2. Three options compared */}
            <Section n={2} step={step} title={c.sections.options} sub={c.sections.optionsSub}>
              <OptionsRow options={s.options} />
            </Section>

            {/* 3. Tradeoffs */}
            <Section n={3} step={step} title={c.sections.tradeoffs}>
              <div className="prose-m8" style={{ color: "inherit", fontSize: "inherit", lineHeight: 1.55, fontWeight: 400 }}>
                {s.tradeoffs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Section>

            {/* 4. Questions to ask */}
            <Section n={4} step={step} title={c.sections.questions}>
              <ol className="br-list br-list--num">
                {s.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </Section>

            {/* 5. Next steps */}
            <Section n={5} step={step} title={c.sections.next}>
              <ul className="br-list br-list--disc">
                {s.nextSteps.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p className="br-doc__foot">
                {SAMPLE_SENTENCE} {NOT_A_COMMITMENT}
              </p>
            </Section>
          </article>
        </div>
      )}
    </Scene>
    </Stage>
  );
}

function Section({ n, step, title, sub, children }: { n: number; step: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className={`br-sec step-in ${step >= n ? "is-on" : ""}`} aria-label={`${title} (sample)`}>
      <div className="br-sec__head">
        <h3 className="br-sec__title">
          <span className="doc__section" style={{ display: "block", margin: "0 0 2px" }}>
            {String(n).padStart(2, "0")}
          </span>
          {title}
        </h3>
        <SampleBadge />
      </div>
      {sub ? <p className="br-sec__sub">{sub}</p> : null}
      {children}
    </section>
  );
}
