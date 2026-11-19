"use client";

import { useMemo, useState } from "react";
import { CHANNEL_LABELS, CHANNELS, fill, KIND_LABELS, KINDS, VARIABLE_LABELS, variablesOf, type Template } from "@/lib/templates/library";
import { answerAction, writeAction } from "./actions";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="mlo-btn mlo-btn--ghost"
      style={{ marginTop: 0 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** D38: fill in a template's fields and copy the result. Your own details come from your record. */
export function UseTemplate({ t, mine }: { t: Template; mine: Record<string, string> }) {
  const fields = useMemo(() => variablesOf(`${t.subject ?? ""} ${t.body}`).filter((v) => !(v in mine) || !mine[v]), [t, mine]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const all = { ...mine, ...vals };
  const subject = t.subject ? fill(t.subject, all) : "";
  const body = fill(t.body, all);
  const out = subject ? `Subject: ${subject}\n\n${body}` : body;
  return (
    <details className="mlo-details">
      <summary>Use it</summary>
      {fields.length ? (
        <div className="tp-fields">
          {fields.map((f) => (
            <label key={f} className="mlo-field"><span>{VARIABLE_LABELS[f] ?? f}</span><input className="mlo-input" value={vals[f] ?? ""} maxLength={120} onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value }))} /></label>
          ))}
        </div>
      ) : null}
      <pre className="tp-out">{out}</pre>
      <div className="mlo-row-form"><Copy text={out} />{/\[[a-zA-Z]+\]/.test(out) ? <span className="mlo-note">Fill in the [fields] before sending.</span> : null}</div>
    </details>
  );
}

/** D38: paste what someone said; M8 offers honest replies. */
export function AnswerThis() {
  const [said, setSaid] = useState("");
  const [who, setWho] = useState("client");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Awaited<ReturnType<typeof answerAction>> | null>(null);
  return (
    <form
      className="mlo-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setR(await answerAction(said, who));
        setBusy(false);
      }}
    >
      <label className="mlo-field"><span>What did they say?</span><textarea className="mlo-textarea" rows={3} maxLength={1500} value={said} onChange={(e) => setSaid(e.target.value)} placeholder="“Your rate is higher than the one my bank gave me.”" /></label>
      <div className="mlo-row-form">
        <select className="mlo-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who said it">
          <option value="client">A client or buyer</option>
          <option value="agent">A real estate agent</option>
        </select>
        <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={busy || said.trim().length < 4}>{busy ? "Thinking…" : "Help me answer"}</button>
      </div>
      {r && !r.ok ? <div className="mlo-flash mlo-flash--err" role="status">{r.error}</div> : null}
      {r && r.ok ? (
        <ol className="tp-replies" role="status">
          {r.replies.map((x, i) => (
            <li key={i} className="cc-card">
              <p style={{ whiteSpace: "pre-wrap" }}>{x.reply}</p>
              <p className="mlo-note">{x.why}</p>
              <Copy text={x.reply} />
            </li>
          ))}
          {r.by === "library" ? <li className="mlo-note">From the library (M8 writes fresh answers once the AI key is in Vercel).</li> : null}
        </ol>
      ) : null}
    </form>
  );
}

/** D38: describe it and M8 drafts it into the form, or just type your own. */
export function MakeOne({ save, canShare }: { save: (fd: FormData) => void | Promise<void>; canShare: boolean }) {
  const [what, setWhat] = useState("");
  const [kind, setKind] = useState("open_house");
  const [channel, setChannel] = useState("text");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mlo-grid">
      <div className="mlo-grid">
        <label className="mlo-field"><span>Tell M8 what you need (optional)</span><input className="mlo-input" value={what} maxLength={1000} onChange={(e) => setWhat(e.target.value)} placeholder="A text inviting past clients to an open house I'm co-hosting" /></label>
        <div className="mlo-row-form">
          <button
            type="button"
            className="mlo-btn mlo-btn--ghost"
            style={{ marginTop: 0 }}
            disabled={busy || what.trim().length < 8}
            onClick={async () => {
              setBusy(true);
              const r = await writeAction(what, kind, channel);
              setBusy(false);
              if (r.ok) {
                setTitle(r.title);
                setSubject(r.subject);
                setBody(r.body);
                setMsg(r.by === "library" ? "Started from the closest one in the library. Edit it, then save." : "Here's a draft. Edit it, then save.");
              } else setMsg(r.error);
            }}
          >
            {busy ? "Writing…" : "Write it with M8"}
          </button>
          {msg ? <span className="mlo-note" role="status">{msg}</span> : null}
        </div>
      </div>
      <form action={save} className="mlo-grid">
        <div className="mlo-row-form">
          <select name="kind" className="mlo-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">{KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select>
          <select name="channel" className="mlo-select" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}</select>
        </div>
        <label className="mlo-field"><span>Name</span><input name="title" className="mlo-input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        {channel === "email" ? <label className="mlo-field"><span>Subject</span><input name="subject" className="mlo-input" maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} /></label> : <input type="hidden" name="subject" value="" />}
        {kind === "rebuttal" ? <label className="mlo-field"><span>What they say</span><input name="objection" className="mlo-input" maxLength={300} /></label> : <input type="hidden" name="objection" value="" />}
        <label className="mlo-field"><span>Message (use fields like {"{first}"}, {"{address}"}, {"{date}"}, {"{agentFirst}"})</span><textarea name="body" className="mlo-textarea" rows={6} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        {canShare ? <label className="mlo-check"><input type="checkbox" name="shared" value="yes" /> <span>Share with everyone on the team</span></label> : null}
        <button type="submit" className="mlo-btn">Save template</button>
      </form>
    </div>
  );
}
