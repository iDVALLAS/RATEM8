"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/lib/copy";
import { US_STATES, usStateName } from "@/lib/us-states";
import { useMloContext } from "@/components/mlo/MloContext";
import ApplyCta from "@/components/mlo/ApplyCta";
import BookingCTA from "@/components/BookingCTA";
import TrustLine from "@/components/TrustLine";
import {
  PREP_FIELDS,
  answer,
  back,
  currentField,
  editField,
  isDone,
  start,
  summaryRows,
  summaryText,
  type PrepError,
  type PrepFieldId,
  type PrepState,
} from "@/lib/prep/machine";

/**
 * PrepFlow — "Prep my application with M8" in text chat (v18, Item 2b).
 *
 * Drives lib/prep/machine.ts one question at a time as M8 bubbles with
 * tappable answers. Nothing leaves the browser: no fetch of answers, no
 * storage. The one network call is the existing property-state choice
 * (/api/route-choice) so the hand-off goes to the loan officer licensed
 * for that state. The summary hands off to the matched MLO's own secure
 * application via ApplyCta; that application is the official one.
 */
type FieldCopy = { prompt: string; hint?: string; placeholder?: string; options?: ReadonlyArray<{ value: string; label: string }> };
const P = copy.prep;
const fieldCopy = (id: PrepFieldId) => (P.fields as Record<PrepFieldId, FieldCopy>)[id];
const labelOf = (id: PrepFieldId, v: string) => (id === "state" ? usStateName(v) ?? v : fieldCopy(id).options?.find((o) => o.value === v)?.label ?? v);

export default function PrepFlow() {
  const ctx = useMloContext();
  const router = useRouter();
  const prefillState = ctx.propertyState ?? ctx.stateCode ?? undefined;
  const [s, setS] = useState<PrepState>(() => start(prefillState ? { state: prefillState } : {}));
  const [error, setError] = useState<PrepError | null>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const routingOn = !!ctx.status && ctx.status !== "off";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [s.step]);

  const submit = (value: string, allowed?: readonly string[]) => {
    const f = currentField(s);
    const r = answer(s, value, allowed);
    setError(r.error ?? null);
    if (r.error) return;
    setS(r.state);
    setText("");
    // Licensing follows the property: keep routing in step with the answer.
    if (f?.id === "state" && routingOn && value !== ctx.propertyState) {
      fetch("/api/route-choice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyState: value, mloId: null }) })
        .then((res) => res.ok && router.refresh())
        .catch(() => undefined);
    }
  };

  const f = currentField(s);
  const done = isDone(s);
  const rows = useMemo(() => summaryRows(s, (id) => fieldCopy(id).prompt, labelOf), [s]);

  return (
    <section className="prep" aria-labelledby="prep-h">
      <p className="code-label" id="prep-h">
        {P.eyebrow}
      </p>
      <div className="m8chat-thread prep__thread" role="log" aria-live="polite" aria-relevant="additions">
        <div className="bubble bubble--m8">{P.intro}</div>
        {PREP_FIELDS.slice(0, s.step).map((fld) =>
          s.answers[fld.id] ? (
            <div key={fld.id} className="prep__pair">
              <div className="bubble bubble--m8">{fieldCopy(fld.id).prompt}</div>
              <div className="bubble bubble--user">{labelOf(fld.id, s.answers[fld.id] as string)}</div>
            </div>
          ) : null,
        )}

        {!done && f ? (
          <div className="prep__ask">
            <div className="bubble bubble--m8">
              {fieldCopy(f.id).prompt}
              {fieldCopy(f.id).hint ? <span className="prep__hint">{fieldCopy(f.id).hint}</span> : null}
            </div>
            <p className="mono-label prep__progress">{P.progress.replace("{n}", String(s.step + 1)).replace("{total}", String(PREP_FIELDS.length))}</p>

            {f.kind === "choice" ? (
              <div className="prep__options" role="group" aria-label={fieldCopy(f.id).prompt}>
                {fieldCopy(f.id).options!.map((o) => (
                  <button key={o.value} type="button" className={`prep__opt ${s.answers[f.id] === o.value ? "is-on" : ""}`} onClick={() => submit(o.value, fieldCopy(f.id).options!.map((x) => x.value))}>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}

            {f.kind === "state" ? (
              <form
                className="prep__row"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(text || s.answers.state || "", US_STATES.map((x) => x.code));
                }}
              >
                <select className="beacon-panel__select prep__select" aria-label={fieldCopy("state").prompt} value={text || s.answers.state || ""} onChange={(e) => setText(e.target.value)}>
                  <option value="">{copy.routing.pickerPlaceholder}</option>
                  {US_STATES.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="m8chat-btn m8chat-btn--primary">
                  {P.next}
                </button>
              </form>
            ) : null}

            {f.kind === "text" ? (
              <form
                className="prep__col"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(text);
                }}
              >
                <textarea className="prep__text" rows={3} maxLength={500} placeholder={fieldCopy(f.id).placeholder} aria-label={fieldCopy(f.id).prompt} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="prep__row">
                  <button type="submit" className="m8chat-btn m8chat-btn--primary">
                    {P.next}
                  </button>
                  <button type="button" className="m8chat-linkbtn" onClick={() => submit("")}>
                    {P.skip}
                  </button>
                </div>
              </form>
            ) : null}

            {error === "sensitive" ? (
              <p className="prep__warn" role="alert">
                {P.sensitiveWarning}
              </p>
            ) : null}
            {s.step > 0 ? (
              <button type="button" className="m8chat-linkbtn" onClick={() => setS(back(s))}>
                {P.back}
              </button>
            ) : null}
          </div>
        ) : null}

        {done ? (
          <div className="prep__summary card">
            <h2 className="prep__summary-h">{P.summaryHeading}</h2>
            <p className="prep__summary-note">{P.summaryNote}</p>
            <dl className="prep__rows">
              {rows.map((r) => (
                <div key={r.id} className="prep__rowitem">
                  <dt>{r.label}</dt>
                  <dd>
                    {r.value}{" "}
                    <button type="button" className="m8chat-linkbtn" onClick={() => setS(editField(s, r.id))} aria-label={`${P.edit}: ${r.label}`}>
                      {P.edit}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="prep__handoff">
              {ctx.status === "unlicensed" ? <p className="prep__summary-note">{P.unlicensedNote.replace("{state}", ctx.stateName ?? "")}</p> : null}
              {ctx.status !== "matched" && ctx.status !== "unlicensed" && routingOn ? <p className="prep__summary-note">{P.noMatch}</p> : null}
              <ApplyCta variant="primary" />
              <BookingCTA kind="borrower" variant="secondary" intake={false}>
                {P.talkCta}
              </BookingCTA>
              <div className="prep__row">
                <button
                  type="button"
                  className="m8chat-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(summaryText(rows, P.summaryHeading)).then(() => setCopied(true), () => setCopied(false));
                  }}
                >
                  {copied ? P.copied : P.copySummary}
                </button>
                <button type="button" className="m8chat-linkbtn" onClick={() => setS(start())}>
                  {P.restart}
                </button>
              </div>
              <TrustLine className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)" }} />
            </div>
          </div>
        ) : null}
        <div ref={bottom} />
      </div>
    </section>
  );
}
