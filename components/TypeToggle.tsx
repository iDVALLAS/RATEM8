"use client";

import { useEffect, useState } from "react";
import { type TypeVariant, TYPE_LABELS, applyType, readSavedType } from "@/lib/theme";

/**
 * TypeToggle — the "Aa" switch in the nav that flips the site between
 * the serif headline stack and the sans / gradient-accent variant, so
 * the two can be compared side by side on every page. Persists in
 * localStorage; `?type=sans` in any URL also forces it.
 */
export default function TypeToggle() {
  const [type, setType] = useState<TypeVariant>("serif");

  useEffect(() => {
    setType(readSavedType());
  }, []);

  function flip() {
    const next: TypeVariant = type === "serif" ? "sans" : "serif";
    setType(next);
    applyType(next);
  }

  return (
    <button
      type="button"
      onClick={flip}
      className="type-toggle"
      aria-label={`Headline style: ${TYPE_LABELS[type]}. Switch to ${TYPE_LABELS[type === "serif" ? "sans" : "serif"]}`}
      title={TYPE_LABELS[type]}
      data-type={type}
    >
      <span className="type-toggle__serif" aria-hidden="true">
        Aa
      </span>
      <span className="type-toggle__sans" aria-hidden="true">
        Aa
      </span>
    </button>
  );
}
