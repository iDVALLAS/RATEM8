"use client";

import { useEffect, useId, useRef } from "react";
import { copy } from "@/lib/copy";
import type { VoiceKind } from "@/lib/voice/provider";
import "./voice.css";

/**
 * The consent sheet shown before M8 first listens or speaks (v33). Bottom
 * sheet on phones, centred dialog on desktop. Focus moves in, Escape or
 * "Keep typing" declines, focus returns to the opener.
 */
export default function VoiceConsentSheet({ kind, onAnswer }: { kind: VoiceKind; onAnswer: (ok: boolean) => void }) {
  const t = copy.voice.consent;
  const titleId = useId();
  const okRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAnswer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onAnswer]);

  const points = [t.transcribe, t.noRecording, kind === "elevenlabs" ? t.readAloudVendor : t.readAloudDevice, t.noSensitive];

  return (
    <div className="vc-layer" role="presentation" onClick={() => onAnswer(false)}>
      <div className="vc-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <p className="vc-eyebrow">{t.eyebrow}</p>
        <h2 id={titleId} className="vc-title">
          {t.title}
        </h2>
        <ul className="vc-list">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <button ref={okRef} type="button" className="vc-ok" onClick={() => onAnswer(true)}>
          {t.accept}
        </button>
        <button type="button" className="vc-no" onClick={() => onAnswer(false)}>
          {t.decline}
        </button>
      </div>
    </div>
  );
}
