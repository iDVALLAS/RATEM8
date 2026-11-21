"use client";

import { useState } from "react";

/** D49: the signature box with a live preview of the end of an email. */
export default function Editor({ initial, suggestion, footer }: { initial: string; suggestion: string; footer: string }) {
  const [text, setText] = useState(initial);
  return (
    <div className="sig-grid">
      <div className="sig-edit">
        <label className="mlo-field">
          <span>Your signature (plain text, up to 10 lines)</span>
          <textarea name="signature" rows={8} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} className="mlo-textarea sig-text" />
        </label>
        <div className="mlo-row-form">
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setText(suggestion)}>Start from my details</button>
          <span className="mlo-note">{text.length}/600</span>
        </div>
      </div>
      <div className="sig-preview" aria-label="How the end of your emails will look">
        <p className="sig-preview__label">The end of every email</p>
        <pre className="sig-preview__mail"><span className="sig-preview__body">…your message…</span>{"\n\n"}{text.trim() ? <strong className="sig-preview__sig">{text.trim()}{"\n\n"}</strong> : null}<span className="sig-preview__foot">{footer}</span></pre>
      </div>
    </div>
  );
}
