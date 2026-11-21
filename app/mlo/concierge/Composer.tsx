"use client";

import { useState } from "react";
import { askAction, tellAction } from "./actions";
import { CONCIERGE } from "@/lib/content/cc-pages";

type Told = { answer: string; drafts: number; reminders: number; skipped: string[] };

/**
 * D76: one box for the Concierge. [Ask] answers a question about your book
 * (D8); [Draft it] turns a request into drafts and reminders on your desk
 * (D15). Nothing is sent from here.
 */
export default function Composer() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [told, setTold] = useState<Told | null>(null);
  const [busy, setBusy] = useState<"ask" | "tell" | null>(null);
  const run = async (kind: "ask" | "tell") => {
    if (!q.trim() || busy) return;
    setBusy(kind);
    setAnswer(null);
    setTold(null);
    try {
      if (kind === "ask") setAnswer(await askAction(q));
      else setTold(await tellAction(q));
    } finally {
      setBusy(null);
    }
  };
  return (
    <form
      className="mlo-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void run("ask");
      }}
    >
      <label className="mlo-field">
        <span>{CONCIERGE.composerLabel}</span>
        <textarea className="mlo-textarea" value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} rows={2} />
      </label>
      <div className="mlo-row-form">
        <button type="submit" className="mlo-btn" disabled={!!busy || !q.trim()}>{busy === "ask" ? "Thinking…" : "Ask"}</button>
        <button type="button" className="mlo-btn mlo-btn--ghost" disabled={!!busy || !q.trim()} onClick={() => void run("tell")}>{busy === "tell" ? "Working on it…" : "Draft it"}</button>
      </div>
      {answer ? <p className="mlo-note" role="status" style={{ whiteSpace: "pre-wrap" }}>{answer}</p> : null}
      {told ? (
        <div role="status">
          <p className="mlo-note" style={{ whiteSpace: "pre-wrap" }}>{told.answer}</p>
          {told.drafts || told.reminders ? <p className="mlo-note"><a href="/mlo/concierge#drafts">See the {told.drafts} draft{told.drafts === 1 ? "" : "s"}</a>{told.reminders ? ` and ${told.reminders} reminder${told.reminders === 1 ? "" : "s"}` : ""} (refresh the page).</p> : null}
          {told.skipped.length ? <p className="mlo-note">Left out: {told.skipped.slice(0, 6).join("; ")}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
