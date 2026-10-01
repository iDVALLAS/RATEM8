"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/lib/copy";
import { US_STATES, usStateName } from "@/lib/us-states";
import { useMloContext, useNamedMlo } from "@/components/mlo/MloContext";
import StateOutline from "@/components/mlo/StateOutline";
import { CONFIG, mloById, type Mlo } from "@/lib/config";

/**
 * LocationBeacon — "[State] · matched with [MLO]" (v15, Patch B).
 *
 * A breathing M8 Green dot (the orb's 4s rhythm; still under reduced
 * motion) beside a simple state outline, the match line, and a
 * "Not right? Change" control that opens the property-state picker.
 * State and name only: never an IP-derived ZIP or city.
 *
 * Renders nothing while MLO_ROUTING is off (context status "off").
 * Placements: the nav on desktop, under the hero trust strip on mobile,
 * and on the MLO card.
 */
const r = copy.routing;
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

async function post(body: Record<string, string | null>): Promise<boolean> {
  try {
    const res = await fetch("/api/route-choice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Choose mode: every licensed MLO for the state, random order, none pre-selected. */
export function MloChooser({ onDone }: { onDone?: () => void }) {
  const ctx = useMloContext();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (ctx.status !== "choose" || !ctx.candidates?.length) return null;
  // The operator is named with their NMLS number whether or not they serve this state.
  const operator = mloById(CONFIG.routing.operatorMloId) ?? null;
  return (
    <div className="beacon-choose">
      <p className="beacon-choose__heading">{fill(r.chooseHeading, { state: ctx.stateName ?? "" })}</p>
      <p className="beacon-choose__sub">{r.chooseSub}</p>
      <ul className="beacon-choose__list">
        {ctx.candidates.map((m: Mlo) => (
          <li key={m.id} className="beacon-choose__item">
            <span>
              <span className="beacon-choose__name">{m.name}</span>
              <span className="beacon-choose__meta">{fill(r.credential.nmls, { nmls: m.nmls })}</span>
            </span>
            <button
              type="button"
              className="beacon-btn"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(m.id);
                if (await post({ mloId: m.id })) {
                  router.refresh();
                  onDone?.();
                }
                setBusy(null);
              }}
            >
              {fill(r.chooseButton, { first: m.firstName })}
            </button>
          </li>
        ))}
      </ul>
      {operator ? <p className="beacon-choose__disclosure">{fill(r.chooseDisclosure, { operator: operator.name, nmls: operator.nmls })}</p> : null}
    </div>
  );
}

function Picker({ onClose }: { onClose: () => void }) {
  const ctx = useMloContext();
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(ctx.propertyState ?? ctx.stateCode ?? "");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (body: Record<string, string | null>) => {
    setBusy(true);
    setError(false);
    const ok = await post(body);
    setBusy(false);
    if (!ok) return setError(true);
    router.refresh();
    onClose();
  };
  return (
    <div className="beacon-panel" role="group" aria-label={r.pickerLabel}>
      <label htmlFor={id} className="beacon-panel__label">
        {r.pickerLabel}
      </label>
      <p className="beacon-panel__hint">{r.pickerHint}</p>
      <div className="beacon-panel__row">
        <select id={id} className="beacon-panel__select" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">{r.pickerPlaceholder}</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className="beacon-btn" disabled={!value || busy} onClick={() => save({ propertyState: value, mloId: null })}>
          {r.pickerSave}
        </button>
      </div>
      <MloChooser onDone={onClose} />
      <div className="beacon-panel__foot">
        {ctx.propertyState ? (
          <button type="button" className="beacon-link" disabled={busy} onClick={() => save({ propertyState: null, mloId: null })}>
            {r.pickerForget}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="beacon-link" onClick={onClose}>
          {r.pickerClose}
        </button>
      </div>
      {error ? (
        <p className="beacon-panel__error" role="alert">
          {r.pickerError}
        </p>
      ) : null}
    </div>
  );
}

export default function LocationBeacon({ variant = "inline", className = "" }: { variant?: "nav" | "inline" | "card"; className?: string }) {
  const ctx = useMloContext();
  const mlo = useNamedMlo();
  const [open, setOpen] = useState(false);
  if (!ctx.status || ctx.status === "off") return null;

  const state = ctx.stateName ?? "";
  let line: string;
  if (ctx.status === "matched" && mlo) line = fill(r.matched, { state, name: mlo.name });
  else if (ctx.status === "choose") line = fill(r.choose, { state });
  else if (ctx.status === "unlicensed") line = fill(r.unlicensed, { state });
  else if (ctx.status === "matched") line = state;
  else line = r.unknown;

  return (
    <div className={`beacon beacon--${variant} ${className}`.trim()} aria-label={r.beaconLabel} role="group">
      <div className="beacon__row">
        <span aria-hidden="true" className="beacon__dot" />
        <StateOutline code={ctx.stateCode} className="beacon__outline" />
        <span className="beacon__text">{line}</span>
        <button type="button" className="beacon-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {ctx.status === "unknown" ? r.set : r.change}
        </button>
      </div>
      {mlo && ctx.moved && ctx.ipState ? <p className="beacon__moved">{fill(r.moved, { state, ip: usStateName(ctx.ipState) ?? ctx.ipState })}</p> : null}
      {open ? <Picker onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
