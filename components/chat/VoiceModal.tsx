"use client";

import { useEffect, useId, useRef } from "react";
import Orb from "@/components/Orb";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { chatContent } from "./chatContent";

/**
 * VoiceModal — the voice shell. Exists, is accessible, and is DISABLED.
 *
 * Gated by CONFIG.featureFlags.voice: while the flag is false the dialog
 * opens, shows `copy.chat.voice.disabled`, and every control (Mute, End)
 * is disabled. The captions region (aria-live) and the transcript link
 * are the ADA placeholders the brief asks for. No audio, no network.
 *
 * Dialog semantics: role="dialog", aria-modal, focus trapped, Escape
 * closes, focus returns to the opener.
 */
type VoiceModalProps = {
  open: boolean;
  onClose: () => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function VoiceModal({ open, onClose }: VoiceModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();
  const voiceOn: boolean = CONFIG.featureFlags.voice;
  const v = copy.chat.voice;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const current = document.activeElement;
    if (e.shiftKey && (current === first || !panelRef.current.contains(current))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const transcriptHref = `mailto:${CONFIG.privacyEmail}?subject=${encodeURIComponent(chatContent.voice.transcriptSubject)}`;

  return (
    <div
      className="m8chat-modal"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m8chat-modal__panel card"
        onKeyDown={onKeyDown}
      >
        <div className="m8chat-modal__head">
          <h2 id={titleId} className="m8chat-modal__title">
            {v.title}
          </h2>
          <button ref={closeRef} type="button" className="m8chat-btn" onClick={onClose}>
            {chatContent.voice.close}
          </button>
        </div>

        <div className="m8chat-modal__orb">
          <Orb size="ambient" state="idle" />
        </div>

        <p id={descId} className="m8chat-gate__body">
          {voiceOn ? copy.chat.gate.body : v.disabled}
        </p>
        {!voiceOn ? <p className="mono-label">{chatContent.voice.flagNote}</p> : null}

        <section aria-label={v.captions}>
          <span className="mono-label">{v.captions}</span>
          <div className="m8chat-captions mt-2" aria-live="polite" aria-atomic="false">
            {chatContent.voice.captionsPlaceholder}
          </div>
        </section>

        <div className="m8chat-modal__actions">
          <button type="button" className="m8chat-btn" disabled={!voiceOn} aria-disabled={!voiceOn}>
            {v.mute}
          </button>
          <button type="button" className="m8chat-btn" disabled={!voiceOn} aria-disabled={!voiceOn}>
            {v.end}
          </button>
          <a href={transcriptHref} className="m8chat-link">
            {v.transcript}
          </a>
        </div>
      </div>
    </div>
  );
}
