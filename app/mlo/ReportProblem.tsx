"use client";

import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { reportAction, type ReportState } from "./pilot-actions";
import { Icon } from "./icons";

const KINDS = [
  ["broken", "Something's broken"],
  ["confusing", "Something's confusing"],
  ["idea", "An idea"],
] as const;

const OPEN_EVENT = "cc:report";
/** Opens the Report a problem dialog from anywhere in Command Center. */
export const openReport = () => window.dispatchEvent(new Event(OPEN_EVENT));

/**
 * D44: the report form. The page, screen width and theme are attached for
 * you; nothing else from the page is sent.
 */
export function ReportForm({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const path = usePathname() ?? "/mlo";
  const [state, action, pending] = useActionState<ReportState, FormData>(reportAction, null);
  const [width, setWidth] = useState("");
  const [theme, setTheme] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setWidth(String(window.innerWidth));
    setTheme(document.documentElement.dataset.theme || "night");
  }, []);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="cc-report__done" role="status">
        <span className="cc-report__check"><Icon name="check" size={26} /></span>
        <p><strong>Thanks. It&apos;s reference {state.ref}.</strong></p>
        <p className="mlo-note">{state.emailed ? "The owner has it by email and can reply to you directly." : "It's saved on the owner's Pilot page."} You&apos;ll get an email when it&apos;s been looked at.{state.masked ? " Numbers and emails that looked like client details were masked first." : ""}</p>
        {onDone ? <button type="button" className="mlo-btn" onClick={onDone}>Close</button> : null}
      </div>
    );
  }
  return (
    <form ref={form} action={action} className="cc-report__form">
      <input type="hidden" name="path" value={path} />
      <input type="hidden" name="width" value={width} />
      <input type="hidden" name="theme" value={theme} />
      <fieldset className="cc-report__kinds">
        <legend className="sr-only">What kind of report</legend>
        {KINDS.map(([k, label], i) => (
          <label key={k} className="cc-report__kind">
            <input type="radio" name="kind" value={k} defaultChecked={i === 0} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="mlo-field">
        <span>What happened, or what you expected</span>
        <textarea name="message" rows={5} required minLength={5} maxLength={2000} className="mlo-textarea" autoFocus={autoFocus} placeholder="I pressed Approve on a draft and the page went blank." />
      </label>
      <p className="mlo-note">Please leave out client names, numbers and loan details; say which button or section instead. This page ({path}) is attached for you.</p>
      {state && !state.ok ? <p className="mlo-flash mlo-flash--err" role="alert">{state.error}</p> : null}
      <button type="submit" className="mlo-btn" disabled={pending}>{pending ? "Sending…" : "Send to the owner"}</button>
    </form>
  );
}

/** The dialog, mounted once by the top bar and opened with openReport(). */
export function ReportDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const open = () => {
      setRun((n) => n + 1);
      if (!ref.current?.open) ref.current?.showModal();
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} className="cc-report" aria-labelledby="cc-report-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="cc-report__panel">
        <div className="cc-report__head">
          <h2 id="cc-report-title">Report a problem</h2>
          <button type="button" className="cc-sheet__close" onClick={close} aria-label="Close">×</button>
        </div>
        {run ? <ReportForm key={run} onDone={close} autoFocus /> : null}
      </div>
    </dialog>
  );
}

/** A button that opens the dialog. */
export function ReportTrigger({ className, children }: { className: string; children: React.ReactNode }) {
  return <button type="button" className={className} onClick={openReport}>{children}</button>;
}
