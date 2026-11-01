"use client";

import { useId, useState } from "react";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { fillMlo } from "@/lib/mlo-match";
import { useMloContext, useNamedMlo, MloBookingButton } from "@/components/mlo/MloContext";
import MloAvatar from "@/components/mlo/MloAvatar";

/**
 * MloChatCard — the loan officer card pinned at the top of /chat (C1).
 *
 * Shows the matched MLO's photo (36px), name, NMLS number and the sponsor
 * that holds their license in the routed state, all from one MloContext
 * value. Each state routes to its assigned MLO (CONFIG.routing). The
 * naming rule is lib/mlo-match.ts: without a nameable match the card stays
 * generic, and the nav's location line (LocationBeacon, on every page) asks
 * where the property is and says why an MLO was matched.
 *
 * "Talk to …" opens a handoff panel: the MLO's booking link and a short
 * question form that posts to /api/chat-question (no SSN/DOB/account
 * numbers; the route refuses them). C4 turns this into the request_handoff
 * tool's contact request.
 */
export default function MloChatCard() {
  const ctx = useMloContext();
  const mlo = useNamedMlo();
  const t = copy.chat.live.card;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const sponsor = mlo ? ctx.license?.sponsor : null;

  return (
    <section className="mlo-chat-card" aria-label={t.eyebrow}>
      <div className="mlo-chat-card__row">
        {mlo ? <MloAvatar mlo={mlo} size={36} /> : <span className="mlo-chat-card__dot" aria-hidden="true" />}
        <div className="mlo-chat-card__who">
          <p className="mono-label">{t.eyebrow}</p>
          {mlo ? (
            <>
              <p className="mlo-chat-card__name">
                {mlo.name} <span className="mlo-chat-card__nmls">{t.nmls.replace("{nmls}", mlo.nmls)}</span>
              </p>
              {sponsor ? (
                <p className="mlo-chat-card__sponsor">
                  {t.sponsor.replace("{sponsor}", sponsor.name).replace("{label}", sponsor.idLabel).replace("{id}", sponsor.idNumber)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mlo-chat-card__name">
              {ctx.status === "unlicensed" ? t.unlicensed.replace("{state}", ctx.stateName ?? "") : t.generic}
            </p>
          )}
        </div>
        {ctx.status !== "unlicensed" ? (
          <button
            type="button"
            className="mlo-chat-card__talk"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {mlo ? fillMlo(t.talkNamed, mlo) : t.talk}
          </button>
        ) : null}
      </div>
      {open ? <HandoffPanel id={panelId} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function HandoffPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const mlo = useNamedMlo();
  const h = copy.chat.live.handoff;
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setStatus("sending");
    setProblem(null);
    try {
      const res = await fetch("/api/chat-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, email: email || null }),
      });
      if (res.ok) {
        setStatus("sent");
        setQuestion("");
        return;
      }
      // 400s carry a message the borrower can act on (e.g. an SSN was refused).
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setProblem(res.status === 400 && body?.error ? body.error : null);
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div id={id} className="mlo-chat-card__panel" role="region" aria-label={mlo ? fillMlo(h.titleNamed, mlo) : h.title}>
      <div className="mlo-chat-card__panel-head">
        <p className="mlo-chat-card__panel-title">{mlo ? fillMlo(h.titleNamed, mlo) : h.title}</p>
        <button type="button" className="mlo-chat-card__close" onClick={onClose} aria-label={h.close}>
          ×
        </button>
      </div>
      <MloBookingButton fallbackUrl={CONFIG.calendly.borrower} variant="primary">
        {h.book}
      </MloBookingButton>
      <p className="mono-label mt-3">{h.or}</p>
      {status === "sent" ? (
        <p className="mlo-chat-card__sent" role="status">
          {mlo ? fillMlo(h.sentNamed, mlo) : h.sent}
        </p>
      ) : (
        <form onSubmit={submit} className="mlo-chat-card__form">
          <label className="sr-only" htmlFor={`${id}-q`}>
            {h.question}
          </label>
          <textarea
            id={`${id}-q`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={h.question}
            rows={3}
            maxLength={4000}
            required
          />
          <label className="sr-only" htmlFor={`${id}-e`}>
            {h.email}
          </label>
          <input id={`${id}-e`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={h.email} autoComplete="email" />
          <p className="mlo-chat-card__note">{h.note}</p>
          <button type="submit" className="mlo-chat-card__submit" disabled={status === "sending" || !question.trim()}>
            {status === "sending" ? h.sending : h.submit}
          </button>
          {status === "error" ? (
            <p className="mlo-chat-card__error" role="alert">
              {problem ?? h.error.replace("{email}", CONFIG.contactEmail)}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
