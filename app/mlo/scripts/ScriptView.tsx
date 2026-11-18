import type { SavedScript } from "@/lib/scripts/store";
import { OUTCOME_LABELS, OUTCOMES } from "@/lib/scripts/store";
import { outcomeAction } from "./actions";
import { PrintButton } from "./Buttons";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** One call script, laid out to read from during a call, with "how did it go?" underneath (D9). */
export default function ScriptView({ saved, back }: { saved: SavedScript; back: string }) {
  const s = saved.script;
  return (
    <article className="cs-script" aria-label={`Call script: ${s.title}`}>
      <header className="cs-head">
        <p className="cs-eyebrow">{s.title} · {saved.contactName} · {when(saved.createdAt)} · {s.source === "model" ? "written by AI, checked" : "plain template"}</p>
        <PrintButton />
      </header>

      {s.compliance[0]?.startsWith("Don't call right now") ? <p className="cs-stop" role="alert">{s.compliance[0]}</p> : null}

      {s.prep.length ? (
        <section className="cs-block">
          <h3>Before you dial</h3>
          <ul>{s.prep.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      ) : null}

      <section className="cs-block cs-block--say">
        <h3>Open</h3>
        <p className="cs-say">{s.opener}</p>
        <p className="cs-say">{s.reason}</p>
      </section>

      <section className="cs-block">
        <h3>Ask</h3>
        <ol>{s.questions.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </section>

      <section className="cs-block">
        <h3>Listen for</h3>
        <ul>{s.listenFor.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </section>

      {s.points.length ? (
        <section className="cs-block">
          <h3>Talking points</h3>
          <ul>{s.points.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      ) : null}

      {s.objections.length ? (
        <section className="cs-block">
          <h3>If they say…</h3>
          <dl className="cs-objections">
            {s.objections.map((o, i) => (
              <div key={i}>
                <dt>“{o.they}”</dt>
                <dd>{o.you}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="cs-block cs-block--say">
        <h3>Close</h3>
        <p className="cs-say">{s.close}</p>
      </section>

      <div className="mlo-grid mlo-grid--2">
        <section className="cs-block">
          <h3>Voicemail</h3>
          <p>{s.voicemail}</p>
        </section>
        <section className="cs-block">
          <h3>Text after the call ({s.followUpPurpose === "service" ? "about their loan" : "a check-in"})</h3>
          <p>{s.followUp}</p>
          <p className="mlo-note">Send it from their Conversation, where your contact rules check it first.</p>
        </section>
      </div>

      <section className="cs-block cs-block--rules">
        <h3>Rules for this call</h3>
        <ul>{s.compliance.map((x, i) => <li key={i}>{x}</li>)}</ul>
        {s.dropped ? <p className="mlo-note">{s.dropped} line{s.dropped === 1 ? "" : "s"} the AI wrote didn&apos;t pass the checks and {s.dropped === 1 ? "was" : "were"} replaced.</p> : null}
      </section>

      <section className="cs-block cs-noprint">
        <h3>How did it go?</h3>
        {saved.outcome ? (
          <p className="mlo-note">Logged {when(saved.outcome.at)}: {OUTCOME_LABELS[saved.outcome.result]}{saved.outcome.helpful === null ? "" : saved.outcome.helpful ? " · the script helped" : " · the script didn't help"}{saved.outcome.note ? ` · ${saved.outcome.note}` : ""}</p>
        ) : (
          <form action={outcomeAction} className="mlo-grid">
            <input type="hidden" name="id" value={saved.id} />
            <input type="hidden" name="back" value={back} />
            <div className="mlo-grid mlo-grid--2">
              <label className="mlo-field"><span>What happened</span>
                <select name="result" defaultValue="reached" required>
                  {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
                </select>
              </label>
              <label className="mlo-field"><span>Did the script help?</span>
                <select name="helpful" defaultValue="">
                  <option value="">Skip</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <label className="mlo-field"><span>A note for next time (optional; no account numbers or SSNs)</span><input name="note" maxLength={400} /></label>
            <p className="mlo-note">A call you log shows on their conversation and counts toward the daily call limit. “Asked not to be contacted” records a stop for calls and texts.</p>
            <div><button type="submit" className="mlo-btn">Log it</button></div>
          </form>
        )}
      </section>
    </article>
  );
}
