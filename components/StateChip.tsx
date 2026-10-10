import Link from "next/link";
import StateOutline from "@/components/mlo/StateOutline";
import { STATE_HUE } from "@/lib/state-colors";
import type { StateConfig } from "@/lib/config";

/**
 * StateChip — a licensed state's chip (v24): its own data-palette hue and
 * a simple, original outline of the state (StateOutline: coarse polygons,
 * never an official seal or flag). Links to the state page.
 */
export default function StateChip({ state, children, ariaLabel }: { state: StateConfig; children: React.ReactNode; ariaLabel?: string }) {
  const hue = STATE_HUE[state.code];
  return (
    <Link
      href={`/states/${state.slug}`}
      className={`state-chip ${hue ? "state-chip--hued" : ""}`.trim()}
      style={hue ? ({ "--chip-hue": `var(--data-${hue})`, "--chip-text": `var(--data-${hue}-text)` } as React.CSSProperties) : undefined}
      aria-label={ariaLabel}
    >
      <StateOutline code={state.code} className="state-chip__outline" />
      {children}
    </Link>
  );
}
