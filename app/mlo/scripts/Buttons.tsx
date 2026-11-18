"use client";

import { useFormStatus } from "react-dom";

/** Shows that the script is being written (a model call takes a little while). */
export function BuildButton({ label = "Build my script" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mlo-btn" disabled={pending} aria-live="polite">
      {pending ? "Writing your script…" : label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => window.print()}>
      Print
    </button>
  );
}
