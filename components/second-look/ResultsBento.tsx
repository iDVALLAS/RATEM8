"use client";

import Bento, { BentoSlot } from "@/components/motion/Bento";
import { copy } from "@/lib/copy";
import { seq, useSceneTimeline } from "@/lib/useSceneTimeline";
import type { SecondLookField, SecondLookResult } from "@/lib/second-look/schema";
import { SL } from "./strings";

/**
 * ResultsBento — renders the validated /api/second-look JSON into the
 * same dashed-to-filled bento layout as the Layer 1 demo. Explanation
 * of the borrower's own document only; no comparison, no pricing.
 */

function Field({ label, f }: { label: string; f: SecondLookField }) {
  return (
    <div>
      <div className="sl-kv">
        <span>{label}</span>
        <b>{f.value ?? SL.live.labels.notFound}</b>
      </div>
      <p className="sl-card-body" style={{ marginTop: 6, marginBottom: 10 }}>
        {f.explanation}
      </p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="mono-label" style={{ marginBottom: 6 }}>
        {title}
      </div>
      {items.length === 0 ? (
        <p className="sl-card-body">{SL.live.labels.none}</p>
      ) : (
        <ul className="sl-card-body" style={{ paddingLeft: 18, listStyle: "disc" }}>
          {items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResultsBento({ result, disclaimer }: { result: SecondLookResult; disclaimer: string }) {
  const { ref, step } = useSceneTimeline<HTMLDivElement>({ steps: seq(0, 150, 5), autoStart: true });
  const L = SL.live.labels;
  const d = copy.secondLook.decoded;
  return (
    <div ref={ref} data-step={step}>
      <Bento cols={2}>
        <BentoSlot filled={step >= 0} label={L.trueCost}>
          <div className="sl-card-title">{d.trueCost.title}</div>
          <Field label={L.rate} f={result.rate} />
          <Field label={L.apr} f={result.apr} />
        </BentoSlot>
        <BentoSlot filled={step >= 1} label={L.negotiable}>
          <div className="sl-card-title">{d.negotiable.title}</div>
          <Field label={L.sectionA} f={result.sectionA} />
          <Field label={L.sectionBC} f={result.sectionBC} />
          <List title={L.negotiableFees} items={result.negotiableFees} />
          <List title={L.fixedFees} items={result.fixedFees} />
        </BentoSlot>
        <BentoSlot filled={step >= 2} label={L.cashToClose}>
          <div className="sl-card-title">{d.cashToClose.title}</div>
          <Field label={L.cashToCloseField} f={result.cashToClose} />
        </BentoSlot>
        <BentoSlot filled={step >= 3} label={L.pointsCredit}>
          <div className="sl-card-title">{d.toggle.title}</div>
          <Field label={L.points} f={result.points} />
          <Field label={L.lenderCredits} f={result.lenderCredits} />
        </BentoSlot>
        <BentoSlot filled={step >= 4} label={L.questions} span="sm:col-span-2">
          <div className="sl-card-title">{d.questions.title}</div>
          {result.questions.length === 0 ? (
            <p className="sl-card-body">{L.none}</p>
          ) : (
            <ol className="sl-questions">
              {result.questions.map((q) => (
                <li key={q}>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          )}
        </BentoSlot>
      </Bento>
      <div className="card sl-summary">
        <div className="mono-label">{SL.live.summary}</div>
        <p className="sl-card-body" style={{ marginTop: 8 }}>
          {result.summary}
        </p>
        <div className="sl-confidence mono-label">
          <span>{SL.live.confidence}:</span>
          <span style={{ color: "var(--fg)" }}>{result.confidence}</span>
        </div>
      </div>
      <p className="sl-note">{disclaimer}</p>
    </div>
  );
}
