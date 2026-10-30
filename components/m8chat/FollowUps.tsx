"use client";

import ArrowText from "@/components/ui/ArrowText";

/** Suggested follow-ups (v33). Tapping one puts it in the composer to edit or send. */
export const PREFILL_EVENT = "m8:prefill";

export default function FollowUps({ items }: { items: string[] }) {
  return (
    <ul className="m8c-followups" aria-label="Suggested questions">
      {items.map((f) => (
        <li key={f}>
          <button type="button" className="m8c-fu" onClick={() => window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: f }))}>
            <ArrowText text={`→ ${f}`} />
          </button>
        </li>
      ))}
    </ul>
  );
}
