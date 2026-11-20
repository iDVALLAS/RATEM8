"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMic } from "@/components/chat/useMic";
import { receiptAction, tellAction } from "./actions";

/**
 * D37: tell M8 what you spent, earned or drove, by typing or by voice, or
 * snap a receipt. Everything becomes a draft to confirm below.
 */
export default function Tell({ micOn, aiOn }: { micOn: boolean; aiOn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"tell" | "receipt" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onText = useCallback((t: string) => setText((n) => (n ? `${n} ${t}` : t)), []);
  const mic = useMic(onText, (m) => setMsg(m ? { ok: false, text: m } : null), { endpoint: "/api/cc/loa/listen" });
  const done = (r: { ok: true; drafts: number; by: string } | { ok: false; error: string }, what: string) => {
    setMsg(r.ok ? { ok: true, text: `${r.drafts} ${r.drafts === 1 ? "draft" : "drafts"} ${what}. Check and confirm below.` } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };
  return (
    <div className="mlo-grid">
      <form
        className="mlo-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy("tell");
          const r = await tellAction(text);
          setBusy(null);
          if (r.ok) setText("");
          done(r, "made");
        }}
      >
        <label className="mlo-field">
          <span>Tell M8 what you spent, earned or drove</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} className="mlo-textarea" placeholder={"$84 lunch with an agent at Daniel's yesterday\nDrove 32 miles to a closing in Bellevue\nNMLS renewal $30, E&O insurance $1,100"} />
        </label>
        <div className="mlo-row-form">
          <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={busy !== null || text.trim().length < 3}>{busy === "tell" ? "Reading…" : "Add"}</button>
          {micOn ? (
            <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} disabled={mic.state === "working"} onClick={() => (mic.state === "listening" ? void mic.stop() : void mic.start())}>
              {mic.state === "listening" ? `Stop (${mic.seconds}s)` : mic.state === "working" ? "Writing it down…" : "Say it"}
            </button>
          ) : null}
          <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} disabled={busy !== null} onClick={() => fileRef.current?.click()}>{busy === "receipt" ? "Reading the receipt…" : "Snap a receipt"}</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy("receipt");
              const fd = new FormData();
              fd.set("receipt", f);
              const r = await receiptAction(fd);
              setBusy(null);
              e.target.value = "";
              done(r, aiOn ? "read from the receipt" : "saved with the receipt (fill in the amount)");
            }}
          />
        </div>
        <p className="mlo-note">{aiOn ? "M8 sorts each one onto its Schedule C line. Nothing counts until you confirm it." : "Without the AI key, M8 finds amounts, miles and dates itself; receipts are kept for you to fill in."} Card and account numbers are removed before anything is read.</p>
      </form>
      {msg ? <div className={`mlo-flash ${msg.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role="status">{msg.text}</div> : null}
    </div>
  );
}
