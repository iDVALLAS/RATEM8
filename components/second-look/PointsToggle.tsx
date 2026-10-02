"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pointsVsCredit } from "@/lib/calc";
import { formatDollars } from "@/lib/calc/format";
import { copy } from "@/lib/copy";
import { SAMPLE_PVC, TIMELINE_MONTHS } from "./sample";
import { SL } from "./strings";

/**
 * PointsToggle — the interactive "Pay points / Take credit" switch.
 *
 * Deterministic math from lib/calc.ts `pointsVsCredit` on FICTIONAL
 * sample inputs. Flipping updates monthly P&I, upfront cost, and the
 * break-even month; a timeline of dots lights up in sequence to the
 * break-even month. Under reduced motion values are set, not animated.
 *
 * Accessibility: role="radiogroup" with two role="radio" buttons,
 * roving tabindex, arrow keys switch.
 */

export type ToggleValue = 0 | 1;

type PointsToggleProps = {
  value: ToggleValue;
  onChange: (v: ToggleValue) => void;
  /** Skip count-ups and dot sequencing. */
  reduced: boolean;
  /** When true the timeline dots sequence in (scene step reached). */
  active?: boolean;
  /** Compact = toggle + one line, no stats/timeline (scene 3 card). */
  compact?: boolean;
  idPrefix?: string;
};

function useCountUp(target: number, reduced: boolean, ms = 500): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduced) {
      current.current = target;
      setShown(target);
      return;
    }
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, ms]);
  return shown;
}

export default function PointsToggle({ value, onChange, reduced, active = true, compact = false, idPrefix = "sl-pvc" }: PointsToggleProps) {
  const r = useMemo(() => pointsVsCredit(SAMPLE_PVC), []);
  const opt = value === 0 ? r.points : r.credit;
  const breakeven = Number.isFinite(r.breakevenMonth) ? r.breakevenMonth : null;

  const payment = useCountUp(opt.payment, reduced);
  const upfront = useCountUp(Math.abs(opt.upfront), reduced);

  // Timeline: dots up to (and including) the last month ≤ break-even.
  const litTarget = useMemo(() => {
    if (breakeven === null) return 0;
    return TIMELINE_MONTHS.filter((m) => m <= breakeven).length;
  }, [breakeven]);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!active) {
      setLit(0);
      return;
    }
    if (reduced) {
      setLit(litTarget);
      return;
    }
    setLit(0);
    const timers: number[] = [];
    for (let i = 1; i <= litTarget; i++) {
      timers.push(window.setTimeout(() => setLit(i), 120 * i));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, reduced, litTarget, value]);

  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next: ToggleValue = e.key === "Home" ? 0 : e.key === "End" ? 1 : value === 0 ? 1 : 0;
    onChange(next);
    const btn = groupRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next];
    btn?.focus();
  };

  const labels = copy.secondLook.toggleLabels;
  const beText = breakeven === null ? SL.stats.never : `${breakeven} ${SL.stats.monthShort}`;

  return (
    <div>
      <div
        ref={groupRef}
        className="m8-toggle"
        role="radiogroup"
        aria-label={copy.secondLook.decoded.toggle.title}
        data-value={value}
        onKeyDown={onKeyDown}
      >
        <span className="m8-toggle__thumb" aria-hidden="true" />
        <button
          type="button"
          role="radio"
          id={`${idPrefix}-points`}
          aria-checked={value === 0}
          tabIndex={value === 0 ? 0 : -1}
          className="m8-toggle__opt"
          onClick={() => onChange(0)}
        >
          {labels.points}
        </button>
        <button
          type="button"
          role="radio"
          id={`${idPrefix}-credit`}
          aria-checked={value === 1}
          tabIndex={value === 1 ? 0 : -1}
          className="m8-toggle__opt"
          onClick={() => onChange(1)}
        >
          {labels.credit}
        </button>
      </div>

      {compact ? (
        <p className="sl-card-body" style={{ marginTop: 10 }} aria-live="polite">
          {SL.stats.rateLabel} {opt.rate.toFixed(3)}% · {SL.stats.payment} {formatDollars(opt.payment)} · {SL.stats.breakeven} {beText}
        </p>
      ) : (
        <>
          <div className="sl-stats" aria-live="polite">
            <div className="sl-stat">
              <div className="sl-stat__label">{SL.stats.payment}</div>
              <div className="sl-stat__value">{formatDollars(payment)}</div>
              <div className="sl-stat__sub">
                {SL.stats.rateLabel} {opt.rate.toFixed(3)}%
              </div>
            </div>
            <div className="sl-stat">
              <div className="sl-stat__label">{SL.stats.upfront}</div>
              <div className="sl-stat__value">
                {value === 1 ? "−" : ""}
                {formatDollars(upfront)}
              </div>
              <div className="sl-stat__sub">{value === 0 ? SL.stats.upfrontPoints : SL.stats.upfrontCredit}</div>
            </div>
            <div className="sl-stat">
              <div className="sl-stat__label">{SL.stats.breakeven}</div>
              <div className="sl-stat__value">{beText}</div>
              <div className="sl-stat__sub">{SL.stats.breakevenSub}</div>
            </div>
          </div>

          <div className="sl-tl-wrap">
            <div className="mono-label" style={{ marginBottom: 10 }}>
              {SL.stats.timeline}
            </div>
            <div className="tl" aria-hidden="true">
              {TIMELINE_MONTHS.map((m, i) => (
                <div className="tl-step" key={m}>
                  <span className={`tl-dot ${i < lit ? "is-on" : ""}`} />
                  <span className="tl-label">{m}</span>
                </div>
              ))}
            </div>
            <p className="sl-tl-marker" aria-live="polite">
              {breakeven === null
                ? SL.stats.never
                : value === 0
                ? SL.stats.markerPoints(String(breakeven))
                : SL.stats.markerCredit(String(breakeven))}
            </p>
          </div>
          <p className="mono-label" style={{ marginTop: 12 }}>
            {r.assumptions.map((a) => `${a.label}: ${a.value}`).join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}
