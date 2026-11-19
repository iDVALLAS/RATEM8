"use client";

import { useActionState } from "react";
import { confirmAction, type ConfirmState } from "./actions";

/** D34: enter the first code; on success the recovery codes show once. */
export default function Confirm() {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmAction, null);
  if (state?.ok && state.recovery) {
    return (
      <div className="mlo-flash mlo-flash--ok" role="status">
        <p><strong>It&apos;s on.</strong> Next time, after the emailed link, you&apos;ll enter a code from the app.</p>
        <p style={{ marginTop: 8 }}>Your recovery codes. Each works once if you lose your phone. Save them somewhere safe now (a password manager is best); they won&apos;t be shown again.</p>
        <pre className="mlo-codes">{state.recovery.join("\n")}</pre>
        <p className="mlo-note"><a href="/mlo/security">Done</a></p>
      </div>
    );
  }
  return (
    <form action={action} className="mlo-grid">
      {state && !state.ok ? <div className="mlo-flash mlo-flash--err" role="alert">{state.error}</div> : null}
      <label className="mlo-field">
        <span>Enter the 6-digit code the app shows now</span>
        <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className="mlo-input" style={{ letterSpacing: "0.2em", fontSize: 22, maxWidth: 220 }} />
      </label>
      <button type="submit" className="mlo-btn" disabled={pending}>{pending ? "Checking" : "Turn it on"}</button>
    </form>
  );
}
