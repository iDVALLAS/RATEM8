"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * Placements (v18): the nav on desktop; on phones a compact pill right
 * under the header ("● WA · Name · Change", not sticky) plus the full line
 * at the top of the mobile menu; and the MLO card. On phones "Change"
 * opens the picker as a bottom sheet.
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

/** Phones: the picker as a bottom sheet over everything (portal), Esc or backdrop closes. */
export function PickerSheet({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("select, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="beacon-sheet" role="dialog" aria-modal="true" aria-label={r.sheetLabel} data-beacon-sheet="">
      <div className="beacon-sheet__backdrop" onClick={onClose} />
      <div className="beacon-sheet__panel" ref={panel}>
        <span aria-hidden="true" className="beacon-sheet__grip" />
        <Picker onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

export default function LocationBeacon({ variant = "inline", className = "" }: { variant?: "nav" | "inline" | "card" | "pill" | "menu"; className?: string }) {
  const ctx = useMloContext();
  const mlo = useNamedMlo();
  const [open, setOpen] = useState(false);
  const [asSheet, setAsSheet] = useState(false);
  if (!ctx.status || ctx.status === "off") return null;

  const toggle = () => {
    setAsSheet(variant === "pill" || variant === "menu" || (variant !== "nav" && isPhone()));
    setOpen((o) => !o);
  };
  const close = () => setOpen(false);
  const picker = open ? asSheet ? <PickerSheet onClose={close} /> : <Picker onClose={close} /> : null;

  if (variant === "pill") {
    const p = r.pill;
    const code = ctx.stateCode ?? "";
    let lead: string | null = null;
    let name: string | null = null;
    if (ctx.status === "matched" && mlo) {
      lead = `${code} · `;
      name = mlo.name;
    } else if (ctx.status === "choose") lead = fill(p.choose, { code });
    else if (ctx.status === "unlicensed") lead = fill(p.unlicensed, { code });
    return (
      <div className={`beacon beacon--pill ${className}`.trim()} aria-label={r.beaconLabel} role="group">
        {lead === null ? (
          // No state yet (or no nameable match): the whole pill opens the picker.
          <button type="button" className="beacon-pill" aria-expanded={open} onClick={toggle}>
            <span aria-hidden="true" className="beacon__dot" />
            <span className="beacon-pill__text">{p.unknown}</span>
          </button>
        ) : (
          <div className="beacon-pill">
            <span aria-hidden="true" className="beacon__dot" />
            <StateOutline code={ctx.stateCode} className="beacon__outline" />
            <span className="beacon-pill__lead">{lead}</span>
            {name ? <span className="beacon-pill__name">{name}</span> : null}
            <span aria-hidden="true" className="beacon-pill__sep">
              ·
            </span>
            <button type="button" className="beacon-link beacon-pill__change" aria-expanded={open} onClick={toggle}>
              {p.change}
            </button>
          </div>
        )}
        {picker}
      </div>
    );
  }

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
        <button type="button" className="beacon-link" aria-expanded={open} onClick={toggle}>
          {ctx.status === "unknown" ? r.set : r.change}
        </button>
      </div>
      {mlo && ctx.moved && ctx.ipState ? <p className="beacon__moved">{fill(r.moved, { state, ip: usStateName(ctx.ipState) ?? ctx.ipState })}</p> : null}
      {picker}
    </div>
  );
}
