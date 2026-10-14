"use client";

import { useId, useState } from "react";

/**
 * Slider — a labelled range input paired with a numeric input.
 *
 * Both controls are controlled from the same `value`. The number field
 * keeps a local text buffer so a half-typed "6." does not snap to 6
 * mid-keystroke; it emits only finite numbers. The range is clamped to
 * min/max; the number field may exceed max (the thumb just pins), so a
 * user can type a figure the slider was not sized for.
 */
type SliderProps = {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  /** Optional id for the number input; the range is `${id}-range`. */
  id?: string;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export default function Slider({ label, value, onChange, min, max, step, prefix, suffix, hint, id }: SliderProps) {
  const auto = useId();
  const numId = id ?? `calc-${auto}`;
  const rangeId = `${numId}-range`;
  const hintId = hint ? `${numId}-hint` : undefined;
  const [text, setText] = useState<string>(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  // If the parent changed the value (not via this control), resync the buffer.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseFloat(text) !== value) setText(String(value));
  }

  const emit = (n: number) => {
    setLastValue(n);
    onChange(n);
  };

  return (
    <div className="calc-slider">
      <div className="calc-slider__head">
        <label htmlFor={numId} className="calc-slider__label">
          {label}
        </label>
        <span className="calc-slider__field">
          {prefix ? (
            <span className="calc-slider__affix" aria-hidden="true">
              {prefix}
            </span>
          ) : null}
          <input
            id={numId}
            className="calc-slider__num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            aria-describedby={hintId}
            onChange={(e) => {
              const raw = e.target.value;
              setText(raw);
              const n = parseFloat(raw.replace(/,/g, ""));
              if (Number.isFinite(n)) emit(Math.max(min, n));
            }}
            onBlur={() => {
              const n = parseFloat(text.replace(/,/g, ""));
              if (!Number.isFinite(n)) {
                setText(String(value));
              } else if (n < min) {
                setText(String(min));
              }
            }}
          />
          {suffix ? (
            <span className="calc-slider__affix" aria-hidden="true">
              {suffix}
            </span>
          ) : null}
        </span>
      </div>
      <div className="calc-slider__range-wrap">
        <input
          id={rangeId}
          className="m8-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamp(value, min, max)}
          aria-label={`${label} slider`}
          aria-valuetext={`${prefix ?? ""}${value}${suffix ? ` ${suffix}` : ""}`}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) {
              setText(String(n));
              emit(n);
            }
          }}
        />
      </div>
      {hint ? (
        <p id={hintId} className="calc-slider__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
