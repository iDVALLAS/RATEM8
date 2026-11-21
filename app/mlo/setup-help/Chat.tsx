"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Turn } from "@/lib/setup/assistant";
import { askSetupAction } from "./actions";

const STARTERS = ["What should I do next?", "Help me set up texting with Twilio", "Help me connect email", "Help me connect my loan system"];

/** Turns bare addresses in a reply into links, and keeps line breaks. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return <>{parts.map((p, i) => (i % 2 ? <a key={i} href={p.replace(/[.,;:!?]+$/, "")} target={p.includes("/mlo") ? undefined : "_blank"} rel="noopener noreferrer">{p}</a> : <span key={i}>{p}</span>))}</>;
}

/** D50: the setup assistant chat. */
export default function Chat({ firstAsk, topic }: { firstAsk: string | null; topic: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setDraft("");
    setError(null);
    start(async () => {
      const r = await askSetupAction(next, topic);
      if (!r.ok) {
        setError(r.error);
        setTurns(turns);
        setDraft(q);
        return;
      }
      setTurns([...next, { role: "assistant", text: r.reply }]);
      setNote(r.masked ? "Something you typed looked like a key or password, so it was removed before the assistant saw it. Since it was typed into a chat, make a new one in that service. The owner puts keys in the platform settings, never in a chat." : r.by === "guide" ? "The AI isn't answering right now, so these are your next steps from the checklist." : null);
    });
  };

  useEffect(() => {
    if (firstAsk && !asked.current) {
      asked.current = true;
      ask(firstAsk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstAsk]);
  useEffect(() => {
    // Braces matter: newer browsers return a promise from scrollIntoView, and an effect may only return a cleanup function.
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, pending]);

  return (
    <div className="sh-chat">
      <div className="sh-log" aria-live="polite">
        {turns.length === 0 && !pending ? (
          <div className="sh-empty">
            <p>Ask about any part of setup. It sees your checklist as it is right now, so you can say &ldquo;done&rdquo; after each step and it checks again.</p>
            <div className="sh-starters">{STARTERS.map((s) => <button key={s} type="button" className="sh-chip" onClick={() => ask(s)}>{s}</button>)}</div>
          </div>
        ) : null}
        {turns.map((t, i) => (
          <div key={i} className={`sh-msg sh-msg--${t.role}`}>
            <span className="sh-who">{t.role === "user" ? "You" : "Setup assistant"}</span>
            <div className="sh-text">{t.role === "assistant" ? <Rich text={t.text} /> : t.text}</div>
          </div>
        ))}
        {pending ? <div className="sh-msg sh-msg--assistant"><span className="sh-who">Setup assistant</span><div className="sh-text sh-typing">Checking your setup…</div></div> : null}
        <div ref={end} />
      </div>
      {note ? <p className="mlo-flash mlo-flash--ok" role="status">{note}</p> : null}
      {error ? <p className="mlo-flash mlo-flash--err" role="alert">{error}</p> : null}
      <form
        className="sh-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label className="sr-only" htmlFor="sh-q">Your question</label>
        <textarea
          id="sh-q"
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
          placeholder="Ask, or say “done” when you finish a step"
          className="mlo-textarea"
        />
        <button type="submit" className="mlo-btn" disabled={pending || !draft.trim()}>Send</button>
      </form>
      <p className="mlo-note">AI assistant: it can be wrong, so check each step against what you see. Never paste passwords or keys here.</p>
    </div>
  );
}
