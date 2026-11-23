"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { LeadAnswer } from "@/lib/concierge/desk";
import { LEAD_ASK, LEADS } from "@/lib/content/cc-pages";
import { addLeadStepsAction, askLeadAction } from "./actions";

type Answer = Extract<LeadAnswer, { ok: true }>;

/**
 * D85: "Ask your Concierge" at the top of Lead sources. The AI disclosure comes first; the three suggested questions
 * are real buttons. The answer card shows the answer, a table from the lead-source pack (never from the AI's words),
 * the steps "Add the steps to Today" creates (worked out again on the server), "Show the math", and "Save as my
 * 90-day plan", which waits for the budget planner.
 */
export default function AskPanel({ period, example }: { period: string; example: boolean }) {
  const a = LEADS.ask;
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    setError(null);
    start(async () => {
      const r = await askLeadAction(q, period);
      if (r.ok) setAnswer(r);
      else {
        setAnswer(null);
        setError(r.error);
      }
    });
  };

  return (
    <section className="mlo-section cc-leadask" id="ask" aria-labelledby="leads-ask">
      <h2 id="leads-ask" className="sr-only">{a.label}</h2>
      <p className="mlo-note cc-leadask__ai" id="leads-ask-ai">{example ? LEAD_ASK.disclosureExample : LEAD_ASK.disclosure}</p>
      <form
        className="mlo-row-form cc-leadask__form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input className="mlo-input" type="text" name="question" value={text} onChange={(e) => setText(e.target.value)} placeholder={a.placeholder} aria-label={a.label} aria-describedby="leads-ask-ai" maxLength={300} autoComplete="off" />
        <button type="submit" className="mlo-btn" disabled={pending}>{pending ? LEAD_ASK.working : a.button}</button>
      </form>
      <ul className="cc-leadask__try" aria-label={a.tryLabel}>
        {a.suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              className="cc-leadask__q"
              disabled={pending}
              onClick={() => {
                setText(s);
                ask(s);
              }}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mlo-flash mlo-flash--err cc-leadask__err" role="alert">{error}</p> : null}
      <div aria-live="polite">{answer ? <AnswerCard key={`${answer.question}|${answer.by}|${answer.period}`} answer={answer} /> : null}</div>
    </section>
  );
}

function AnswerCard({ answer }: { answer: Answer }) {
  const L = LEAD_ASK;
  const [math, setMath] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; line: string } | null>(null);
  const [adding, startAdd] = useTransition();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  const add = addLeadStepsAction.bind(null, answer.period, answer.intent, answer.budgetCents ?? 0);
  const refused = answer.by === "refused";
  const t = answer.table;
  return (
    <article className="cc-leadans" aria-labelledby="leads-ans-h" data-by={answer.by} data-intent={answer.intent} data-example={answer.example ? "true" : "false"}>
      <h3 id="leads-ans-h" className="cc-leadans__h" tabIndex={-1} ref={head}>{L.heading}</h3>
      <p className="cc-leadans__q"><span className="mlo-note">{L.you}</span> {answer.question}</p>
      <div className="cc-leadans__body">
        {answer.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {answer.note ? <p className="mlo-note cc-leadans__note">{answer.note}</p> : null}
      {t ? (
        <>
          <div className="mlo-scroll cc-leadans__wide">
            <table className="mlo-table cc-leadans__tbl">
              <caption>{t.caption}</caption>
              <thead>
                <tr>
                  {t.cols.map((c, i) => (
                    <th key={c} scope="col" className={i ? "cc-num" : undefined}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.key} data-source={r.key}>
                    <th scope="row">{r.label}</th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={`cc-num${r.warn[i] ? " cc-num--warn" : ""}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="cc-leadans__cards" aria-label={t.caption}>
            {t.rows.map((r) => (
              <li key={r.key} className="cc-scard" data-source={r.key}>
                <h4 className="cc-scard__name">{r.label}</h4>
                <dl className="cc-scard__stats">
                  {r.cells.map((c, i) => (
                    <div key={i}>
                      <dt>{t.cols[i + 1]}</dt>
                      <dd className={r.warn[i] ? "cc-num--warn" : undefined}>{c || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!refused && answer.steps.length ? (
        <>
          <h4 className="cc-leadans__sub">{L.stepsTitle}</h4>
          <ol className="cc-leadans__steps">
            {answer.steps.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <span className="mlo-note">{s.why}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {refused ? null : (
        <>
          <div className="mlo-actions cc-leadans__acts">
            <button type="button" className="mlo-btn mlo-btn--ghost" disabled aria-describedby="leads-save-off">{L.save}</button>
            {answer.steps.length ? (
              <form action={() => startAdd(async () => setMsg(await add()))}>
                <button type="submit" className="mlo-btn" disabled={adding}>{adding ? L.adding : L.addSteps}</button>
              </form>
            ) : null}
            <button type="button" className="mlo-btn mlo-btn--ghost" aria-expanded={math} aria-controls="leads-math" onClick={() => setMath((m) => !m)}>{math ? L.hideMath : L.showMath}</button>
          </div>
          <p className="mlo-note cc-leadans__off" id="leads-save-off">{L.saveOff}</p>
          {msg ? <p className={`mlo-flash${msg.ok ? "" : " mlo-flash--err"} cc-leadans__msg`} role="status">{msg.line}{msg.ok ? <> <a href="/mlo#lead-steps">{L.today.see}</a></> : null}</p> : null}
          <div id="leads-math" className="cc-leadans__math" hidden={!math}>
            <h4 className="cc-leadans__sub">{L.mathTitle}</h4>
            <ul>
              {answer.math.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </article>
  );
}
