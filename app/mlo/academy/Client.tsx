"use client";

import { useState } from "react";
import type { Quiz } from "@/lib/academy/course";
import { coachAction, gradeAction, practiceAction } from "./actions";

type Turn = { who: "me" | "agent"; text: string };

/** D39: the session quiz. 80% passes; the best score is kept. */
export function QuizForm({ sessionId, quiz }: { sessionId: string; quiz: Quiz[] }) {
  const [answers, setAnswers] = useState<(number | null)[]>(quiz.map(() => null));
  const [r, setR] = useState<Awaited<ReturnType<typeof gradeAction>> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="ac-quiz"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setR(await gradeAction(sessionId, answers.map((a) => a ?? -1)));
        setBusy(false);
      }}
    >
      {quiz.map((q, i) => (
        <fieldset key={i} className="ac-q">
          <legend>{i + 1}. {q.q}</legend>
          {q.options.map((o, j) => (
            <label key={j} className="mlo-check"><input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} /> <span>{o}</span></label>
          ))}
          {r && r.ok ? <p className={`mlo-note ${r.review[i].right ? "ac-right" : "ac-wrong"}`}>{r.review[i].right ? "Right. " : "Not quite. "}{r.review[i].explain}</p> : null}
        </fieldset>
      ))}
      <button type="submit" className="mlo-btn" disabled={busy || answers.some((a) => a === null)}>{busy ? "Checking…" : "Check my answers"}</button>
      {r ? <p role="status" className={`mlo-flash ${r.ok && r.passed ? "mlo-flash--ok" : "mlo-flash--err"}`}>{r.ok ? (r.passed ? `Passed: ${r.score} of ${r.total}.` : `${r.score} of ${r.total}. Read the explanations and try again.`) : r.error}</p> : null}
    </form>
  );
}

/** D39: M8 plays the agent; you practice; then M8 coaches. */
export function Practice({ sessionId, opening, tryTo }: { sessionId: string; opening: string; tryTo: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof coachAction>> | null>(null);
  const send = async () => {
    const next = [...turns, { who: "me" as const, text }];
    setTurns(next);
    setText("");
    setBusy(true);
    const r = await practiceAction(sessionId, next);
    setBusy(false);
    if (r.ok) setTurns([...next, { who: "agent", text: r.reply }]);
    else setErr(r.error);
  };
  return (
    <div className="mlo-grid">
      <p className="mlo-note">Your goal: {tryTo}</p>
      <ol className="mlo-thread">
        <li className="mlo-msg mlo-msg--in"><p>{opening}</p><span className="mlo-note">The agent (M8)</span></li>
        {turns.map((t, i) => <li key={i} className={`mlo-msg mlo-msg--${t.who === "me" ? "out" : "in"}`}><p style={{ whiteSpace: "pre-wrap" }}>{t.text}</p><span className="mlo-note">{t.who === "me" ? "You" : "The agent (M8)"}</span></li>)}
      </ol>
      <form className="mlo-grid" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label className="mlo-field"><span>What you&apos;d say</span><textarea className="mlo-textarea" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="mlo-row-form">
          <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={busy || text.trim().length < 2}>{busy ? "…" : "Say it"}</button>
          <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} disabled={busy || !turns.length} onClick={async () => { setBusy(true); setCoach(await coachAction(sessionId, turns)); setBusy(false); }}>Coach me</button>
          <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} onClick={() => { setTurns([]); setCoach(null); setErr(null); }}>Start over</button>
        </div>
      </form>
      {err ? <p className="mlo-flash mlo-flash--err" role="status">{err}</p> : null}
      {coach && !coach.ok ? <p className="mlo-flash mlo-flash--err" role="status">{coach.error}</p> : null}
      {coach && coach.ok ? (
        <div className="cc-card" role="status">
          {coach.flags.map((f, i) => <p key={i} className="mlo-flash mlo-flash--err">{f}</p>)}
          {coach.score ? <p className="cc-card__title">Score: {coach.score} of 5</p> : null}
          {coach.didWell.length ? <><p><strong>What worked</strong></p><ul className="tp-rules">{coach.didWell.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
          {coach.tryNext.length ? <><p><strong>Try next</strong></p><ul className="tp-rules">{coach.tryNext.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
        </div>
      ) : null}
    </div>
  );
}
