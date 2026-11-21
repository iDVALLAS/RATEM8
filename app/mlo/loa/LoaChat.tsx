"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMic } from "@/components/chat/useMic";

type Msg = { role: "user" | "assistant"; text: string; sources?: { title: string; url: string }[] };

/**
 * D62: talk to your LOA. Type, or press the mic and speak (it stops when you
 * pause). With "Talk mode" on, answers are read aloud and the mic opens
 * again after each one, so it's a conversation. Pick a loan to ask about its
 * file, and a lender to check just that lender's overlays.
 */
export default function LoaChat({ loans, lenders, defaultLoanId, mic, voice }: { loans: { id: string; label: string }[]; lenders: string[]; defaultLoanId: string | null; mic: boolean; voice: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loanId, setLoanId] = useState(defaultLoanId ?? "");
  const [lender, setLender] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [talk, setTalk] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const talkRef = useRef(talk);
  talkRef.current = talk;

  // D76: the log scrolls inside its own box, and only once there's a conversation, so opening the page never jumps.
  useEffect(() => {
    const el = log.current;
    if (!el || (msgs.length === 0 && !busy)) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const speak = useCallback(async (t: string) => {
    if (!voice) return;
    try {
      const res = await fetch("/api/cc/loa/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = (audio.current ??= new Audio());
      a.src = url;
      setSpeaking(true);
      await new Promise<void>((done) => {
        a.onended = a.onerror = () => done();
        a.play().catch(() => done());
      });
      URL.revokeObjectURL(url);
    } finally {
      setSpeaking(false);
    }
  }, [voice]);

  const send = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setErr("");
    setText("");
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/cc/loa/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, loanId: loanId || null, lender: lender || null, history }) });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; sources?: Msg["sources"]; error?: string } | null;
      if (!res.ok || !b?.ok || !b.text) throw new Error(b?.error ?? "Your LOA didn't answer. Try again.");
      setMsgs((m) => [...m, { role: "assistant", text: b.text!, sources: b.sources ?? [] }]);
      if (talkRef.current) {
        await speak(b.text);
        if (talkRef.current) micRef.current?.();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Your LOA didn't answer.");
    } finally {
      setBusy(false);
    }
  }, [busy, msgs, loanId, lender, speak]);

  const m = useMic((heard) => (talkRef.current ? void send(heard) : setText((t) => (t ? `${t} ${heard}` : heard))), (e) => setErr(e), { auto: true, endpoint: "/api/cc/loa/listen", onSilence: () => setTalk(false) });
  const micRef = useRef<(() => void) | null>(null);
  micRef.current = () => void m.start();

  return (
    <div className="loa-chat">
      <div className="mlo-row-form">
        <label className="mlo-field" style={{ minWidth: 0, flex: 1 }}>
          <span>About a loan (optional)</span>
          <select className="mlo-select" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
            <option value="">No loan: a general question</option>
            {loans.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="mlo-field" style={{ minWidth: 0, flex: 1 }}>
          <span>Lender overlays to check</span>
          <select className="mlo-select" value={lender} onChange={(e) => setLender(e.target.value)}>
            <option value="">{lenders.length ? "All on file" : "None on file yet"}</option>
            {lenders.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="loa-log" aria-live="polite" ref={log}>
        {msgs.length === 0 ? <p className="mlo-note">Ask anything a senior processor would know. For example: &ldquo;Can they use a gift for the whole down payment on a 2-unit?&rdquo;, &ldquo;What&apos;s still open on the Garcia file?&rdquo;, &ldquo;When does the CD have to go out?&rdquo;</p> : null}
        {msgs.map((x, i) => (
          <div key={i} className={`loa-msg loa-msg--${x.role}`}>
            <p>{x.text}</p>
            {x.sources?.length ? <p className="loa-src">{x.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>)}</p> : null}
            {x.role === "assistant" && voice ? <button type="button" className="loa-hear" onClick={() => void speak(x.text)} disabled={speaking}>Hear it</button> : null}
          </div>
        ))}
        {busy ? <p className="mlo-note">Your LOA is looking it up…</p> : null}
      </div>

      <form className="loa-ask" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea className="mlo-textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your LOA…" aria-label="Your question" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
        <div className="mlo-row-form">
          {mic ? (
            <button type="button" className={`mlo-btn mlo-btn--ghost loa-mic ${m.state === "listening" ? "is-on" : ""}`} onClick={() => (m.state === "listening" ? void m.stop() : void m.start())} disabled={busy || m.state === "working"} aria-pressed={m.state === "listening"}>
              {m.state === "listening" ? `Listening… ${m.seconds}s` : m.state === "working" ? "Hearing…" : "🎙 Speak"}
            </button>
          ) : null}
          <button type="submit" className="mlo-btn" disabled={busy || !text.trim()}>Ask</button>
          {mic && voice ? (
            <label className="mlo-check" style={{ padding: 0 }}>
              <input type="checkbox" checked={talk} onChange={(e) => { setTalk(e.target.checked); if (e.target.checked && m.state === "idle") void m.start(); }} /> Talk mode (it answers out loud and listens again)
            </label>
          ) : null}
        </div>
      </form>
      {err ? <div className="mlo-flash mlo-flash--err" role="alert"><p>{err}</p></div> : null}
    </div>
  );
}
