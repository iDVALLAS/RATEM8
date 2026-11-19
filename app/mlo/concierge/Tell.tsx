"use client";

import { useState } from "react";
import { tellAction } from "./actions";

/** "Tell your Concierge" (D15): a request in plain English becomes drafts and reminders on the desk. Nothing is sent. */
export default function Tell() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<{ answer: string; drafts: number; reminders: number; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mlo-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setA(await tellAction(q));
        setBusy(false);
      }}
    >
      <label className="mlo-field">
        <span>Tell it what you want done (for example: “Draft a check-in to my past clients from 2021 who I haven&apos;t talked to in 6 months”). You approve everything before it&apos;s sent.</span>
        <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} rows={2} />
      </label>
      <div><button type="submit" className="mlo-btn" disabled={busy || !q.trim()}>{busy ? "Working on it…" : "Prepare it"}</button></div>
      {a ? (
        <div role="status">
          <p className="mlo-note" style={{ whiteSpace: "pre-wrap" }}>{a.answer}</p>
          {a.drafts || a.reminders ? <p className="mlo-note"><a href="/mlo/concierge#drafts">See the {a.drafts} draft{a.drafts === 1 ? "" : "s"}</a>{a.reminders ? ` and ${a.reminders} reminder${a.reminders === 1 ? "" : "s"}` : ""} (refresh the page).</p> : null}
          {a.skipped.length ? <p className="mlo-note">Left out: {a.skipped.slice(0, 6).join("; ")}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
