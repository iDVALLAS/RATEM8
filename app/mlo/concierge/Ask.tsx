"use client";

import { useState } from "react";
import { askAction } from "./actions";

/** "Ask your Concierge" (D8): a question about the book, answered from Today, drafts and reminders. */
export default function Ask() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mlo-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setA(await askAction(q));
        setBusy(false);
      }}
    >
      <label className="mlo-field">
        <span>Ask about your clients (for example: “Who should I call this week?”)</span>
        <input className="mlo-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} />
      </label>
      <button type="submit" className="mlo-btn" disabled={busy || !q.trim()}>{busy ? "Thinking…" : "Ask"}</button>
      {a ? <p className="mlo-note" role="status" style={{ whiteSpace: "pre-wrap" }}>{a}</p> : null}
    </form>
  );
}
