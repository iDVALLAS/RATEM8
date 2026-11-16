"use client";

import { useState } from "react";
import type { ChatAction, M8Message } from "@/lib/m8/shared";
import { copy } from "@/lib/copy";
import { useNamedMlo } from "@/components/mlo/MloContext";
import { CALL_HOURS, inCallHours, telHref } from "@/lib/call-hours";
import { hasBooking } from "@/lib/config";
import { leChatMessage } from "@/lib/second-look/chat";
import type { SecondLookResult } from "@/lib/second-look/schema";

const a = copy.chat.live.actions;

/**
 * ActionCards — the boxes M8 puts under a reply (C19, show_options):
 *  - call_loan_officer: during call hours, "Call {first} now" (a phone
 *    link, with the number written out for computers); outside them,
 *    "Have {first} call me" (their number → /api/m8-callback → an email
 *    to the loan officer). "Book a time" always under it.
 *  - book_time: the loan officer's booking link.
 * Nothing renders without a nameable loan officer (a licensed state).
 */
export default function ActionCards({ actions, recent, onSend }: { actions: ChatAction[]; recent: M8Message[]; onSend?: (text: string) => void }) {
  const mlo = useNamedMlo();
  const upload = actions.includes("upload_loan_estimate") && onSend ? <UploadBox lo={mlo?.firstName ?? a.uploadFallbackLo} onSend={onSend} /> : null;
  if (!mlo) return upload ? <div className="m8-actions">{upload}</div> : null;
  const first = mlo.firstName;
  const fill = (s: string) => s.replaceAll("{first}", first).replaceAll("{hours}", CALL_HOURS.label).replaceAll("{phone}", mlo.phone ?? "");
  const tel = telHref(mlo.phone);
  const book = hasBooking(mlo.calendly) ? mlo.calendly : null;
  const wantsCall = actions.includes("call_loan_officer");

  return (
    <div className="m8-actions">
      {upload}
      {wantsCall && tel && inCallHours() ? (
        <a className="m8-action m8-action--primary" href={tel}>
          <PhoneIcon />
          <span>
            <strong>{fill(a.callNow)}</strong>
            <small>
              {mlo.phone} · {fill(a.callHours)}
            </small>
          </span>
        </a>
      ) : wantsCall ? (
        <CallBack fill={fill} recent={recent} />
      ) : null}
      {wantsCall || actions.includes("book_time") ? (
        book ? (
          <a className="m8-action" href={book} target="_blank" rel="noopener noreferrer">
            <CalendarIcon />
            <span>
              <strong>{fill(a.book)}</strong>
            </span>
          </a>
        ) : (
          <p className="m8-action m8-action--muted">
            <CalendarIcon />
            <span>{a.bookSoon}</span>
          </p>
        )
      ) : null}
    </div>
  );
}

/** C20: upload → /api/m8-loan-estimate → M8's read goes into the chat as the borrower's message. */
function UploadBox({ lo, onSend }: { lo: string; onSend: (text: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);
  const fillLo = (s: string) => s.replaceAll("{lo}", lo);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setState("sending");
    setNote(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/m8-loan-estimate", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; emailed?: boolean; result?: SecondLookResult } | null;
      if (!res.ok || !body?.ok || !body.result) throw new Error(body?.error ?? "M8 couldn't read it just now. Try again.");
      setState("done");
      setNote(`${a.uploadDone} ${fillLo(body.emailed ? a.uploadEmailed : a.uploadNotEmailed)}`);
      onSend(leChatMessage(body.result));
    } catch (err) {
      setState("idle");
      setNote(err instanceof Error ? err.message : "M8 couldn't read it just now. Try again.");
    }
  };

  if (state === "done") return <p className="m8-action m8-action--done" role="status">{note}</p>;
  return (
    <form className="m8-action m8-action--form" onSubmit={submit}>
      <strong>
        <DocIcon /> {a.upload}
      </strong>
      <small>{fillLo(a.uploadBody)}</small>
      <label className="m8-action__file">
        <span>{file ? file.name : a.uploadPick}</span>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {note ? <small role="alert">{note}</small> : null}
      <button type="submit" disabled={!file || state === "sending"}>
        {state === "sending" ? a.uploading : a.uploadSend}
      </button>
    </form>
  );
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

function CallBack({ fill, recent }: { fill: (s: string) => string; recent: M8Message[] }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/m8-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, when, recent: recent.slice(-6).map(({ role, content }) => ({ role, content })) }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok) return setState("sent");
      if (res.status === 400) {
        setError(body?.error ?? null);
        return setState("idle");
      }
      setState("failed");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent") return <p className="m8-action m8-action--done" role="status">{fill(a.sent)}</p>;
  if (state === "failed") return <p className="m8-action m8-action--muted" role="status">{fill(a.failed)}</p>;
  return (
    <form className="m8-action m8-action--form" onSubmit={submit}>
      <strong>
        <PhoneIcon /> {fill(a.callBack)}
      </strong>
      <small>{fill(a.callBackBody)}</small>
      <label>
        <span>{a.phoneLabel}</span>
        <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <div className="m8-action__row">
        <label>
          <span>{a.nameLabel}</span>
          <input type="text" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label>
          <span>{a.whenLabel}</span>
          <input type="text" value={when} onChange={(e) => setWhen(e.target.value)} maxLength={120} />
        </label>
      </div>
      {error ? <small role="alert">{error}</small> : null}
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? a.sending : a.send}
      </button>
    </form>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
