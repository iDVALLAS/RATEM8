"use client";

import { useEffect, useRef, useState } from "react";
import InfoTip from "../InfoTip";
import { LEADS } from "@/lib/content/cc-pages";

/**
 * D81: the "i" on Lead sources: when a lead counts as permission, what to ask the vendor for, and
 * "Copy a note for your vendor" (the clipboard, or the note selected in a box when the browser
 * won't allow it). The same pop-up sits beside every "No permission yet" in Recent leads.
 */
export default function PermissionTip({ label = LEADS.tip.label, tone, size }: { label?: string; tone?: "warn"; size?: "sm" }) {
  const t = LEADS.tip;
  return (
    <InfoTip label={label} title={t.title} tone={tone} size={size}>
      <p>{t.named}</p>
      <p>
        {t.partners} <strong>{LEADS.status.none}</strong>.
      </p>
      <p>{t.askIntro}</p>
      <ul>
        {t.ask.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <CopyNote />
    </InfoTip>
  );
}

function CopyNote() {
  const t = LEADS.tip;
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [showNote, setShowNote] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  // The fallback: show the note, select it, and try the older copy command once.
  useEffect(() => {
    if (!showNote || !box.current) return;
    box.current.focus();
    box.current.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "manual");
  }, [showNote]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(t.vendorNote);
      setState("copied");
    } catch {
      if (showNote && box.current) {
        box.current.focus();
        box.current.select();
        setState("manual");
      } else setShowNote(true);
    }
  };

  return (
    <>
      <div className="cc-tip__actions">
        <button type="button" className="mlo-btn cc-tip__copy" onClick={copy}>
          {t.copy}
        </button>
      </div>
      <p className="cc-tip__status" role="status">
        {state === "copied" ? t.copied : state === "manual" ? t.copyManual : ""}
      </p>
      {showNote ? (
        <label className="cc-tip__note">
          <span className="sr-only">{t.noteLabel}</span>
          <textarea ref={box} className="mlo-textarea" readOnly rows={7} value={t.vendorNote} />
        </label>
      ) : null}
    </>
  );
}
