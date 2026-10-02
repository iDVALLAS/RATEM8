"use client";

import { useState } from "react";
import CTAButton from "@/components/CTAButton";
import { PickerSheet } from "@/components/LocationBeacon";
import { useMloContext, useNamedMlo } from "@/components/mlo/MloContext";
import { hasApplicationUrl } from "@/lib/config";
import { copy } from "@/lib/copy";

/**
 * ApplyCta — "Start your application" (v18, Item 2a).
 *
 *  - Matched (MloContext names an MLO) and that MLO has an https
 *    applicationUrl → opens it in a new tab, with the one-line note.
 *  - Matched but no applicationUrl → nothing. Never another MLO's link.
 *  - Not matched yet (no state, choose state, unlicensed state) → the
 *    button opens the state / property picker first.
 *  - Routing off → nothing (no matching exists to send anyone anywhere).
 */
export default function ApplyCta({ variant = "outline", className = "" }: { variant?: "primary" | "secondary" | "outline"; className?: string }) {
  const ctx = useMloContext();
  const mlo = useNamedMlo();
  const [picking, setPicking] = useState(false);
  const a = copy.apply;

  if (!ctx.status || ctx.status === "off") return null;

  if (mlo) {
    if (!hasApplicationUrl(mlo)) return null;
    return (
      <div className={`apply-cta ${className}`.trim()}>
        <CTAButton href={mlo.applicationUrl.trim()} variant={variant}>
          {a.cta}
        </CTAButton>
        <p className="apply-cta__note">{a.note.replace("{name}", mlo.name)}</p>
      </div>
    );
  }

  return (
    <div className={`apply-cta ${className}`.trim()}>
      <button type="button" className={`cta cta--${variant} apply-cta__pick`} aria-haspopup="dialog" onClick={() => setPicking(true)}>
        <span className="cta__text">
          <span className="cta__label">{a.cta}</span>
        </span>
        <span aria-hidden="true" className="cta__arrow">
          →
        </span>
      </button>
      {picking ? <PickerSheet onClose={() => setPicking(false)} /> : null}
    </div>
  );
}
