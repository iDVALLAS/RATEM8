"use client";

import { useCallback, useState } from "react";
import { useMic } from "@/components/chat/useMic";
import { debriefAction } from "../actions";

type Result = { ok: true; saved: boolean; summary: string | null; needs: number; reminders: number; draft: boolean; leftOut: number } | { ok: false; error: string };

/**
 * D16: after a call, type or dictate your own note. Your voice becomes text
 * in the box (nothing is recorded or sent until you press Save); no client
 * audio is ever captured.
 */
export default function Debrief({ contactId, micOn }: { contactId: string; micOn: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [r, setR] = useState<Result | null>(null);
  const onText = useCallback((t: string) => setNote((n) => (n ? `${n} ${t}` : t)), []);
  const mic = useMic(onText, setMsg, { endpoint: "/api/cc/loa/listen" });
  return (
    <form
      className="mlo-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setR(await debriefAction(contactId, note));
        setBusy(false);
      }}
    >
      <label className="mlo-field">
        <span>What happened on the call? (your words: plans they mentioned, what you promised to do, when to follow up)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={3000} rows={3} placeholder="Talked to Ann. They want to redo the kitchen next spring and might sell in two years. I'll price a cash-out vs a HELOC and call her back next week." />
      </label>
      <div className="mlo-row-form">
        {micOn ? (
          <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} disabled={mic.state === "working"} onClick={() => (mic.state === "listening" ? void mic.stop() : void mic.start())}>
            {mic.state === "listening" ? `Stop (${mic.seconds}s)` : mic.state === "working" ? "Writing it down…" : "Dictate"}
          </button>
        ) : null}
        <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={busy || note.trim().length < 8}>{busy ? "Saving…" : "Save the note"}</button>
      </div>
      {msg ? <p className="mlo-note" role="status">{msg}</p> : null}
      {r ? (
        <div className="mlo-flash mlo-flash--ok" role="status">
          {r.ok ? (
            <>
              <p>{r.saved ? "Saved to their notes." : "Nothing to save."}{r.leftOut ? ` ${r.leftOut} sentence${r.leftOut === 1 ? "" : "s"} about personal topics left out.` : ""}</p>
              {r.summary ? <p>{r.summary}</p> : null}
              {r.needs || r.reminders || r.draft ? <p>{[r.needs ? `${r.needs} note${r.needs === 1 ? "" : "s"} to keep` : "", r.reminders ? `${r.reminders} reminder${r.reminders === 1 ? "" : "s"}` : "", r.draft ? "a follow-up text on your Concierge desk" : ""].filter(Boolean).join(", ")}. Refresh to see them.</p> : null}
            </>
          ) : (
            <p>{r.error}</p>
          )}
        </div>
      ) : null}
    </form>
  );
}
