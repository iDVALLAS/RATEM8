"use client";

/**
 * CalcInput — shared numeric input primitives for calculator pages.
 *
 * All variants render the same brand card treatment: mono label above
 * an underlined value field with a small unit suffix. Values are
 * uncontrolled-from-string, controlled-as-number on parent so the
 * amortization math never sees a stray "" or NaN.
 *
 * Design notes:
 *  - Use type="number" for numeric keyboards on mobile
 *  - Blur behaviors (clamping, snapping) intentionally omitted so the
 *    input remains predictable; parent decides what to do with weird
 *    values
 *  - Suffix (%/$/mo/yrs) sits next to the field, mono-caps like the
 *    principle-label rhythm
 */

import type { InputHTMLAttributes } from "react";

type BaseProps = {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  prefix?: string;
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">;

function toNumber(v: string): number {
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export function CalcInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  prefix,
  hint,
  ...rest
}: BaseProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="principle-label">{label}</span>
      <span
        className="flex items-baseline gap-1 border-b py-1"
        style={{ borderColor: "var(--rule)" }}
      >
        {prefix ? (
          <span
            className="font-display text-lg"
            style={{ color: "var(--muted)" }}
          >
            {prefix}
          </span>
        ) : null}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(toNumber(e.target.value))}
          className="flex-1 bg-transparent font-display text-lg outline-none"
          style={{ color: "var(--fg)" }}
          {...rest}
        />
        {suffix ? (
          <span
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: "var(--muted)" }}
          >
            {suffix}
          </span>
        ) : null}
      </span>
      {hint ? (
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** Convenience: dollars input with $ prefix. */
export function DollarInput(props: Omit<BaseProps, "prefix">) {
  return <CalcInput prefix="$" step={props.step ?? 1000} {...props} />;
}

/** Convenience: percent input with % suffix and finer step. */
export function PercentInput(props: Omit<BaseProps, "suffix">) {
  return <CalcInput suffix="%" step={props.step ?? 0.125} {...props} />;
}
