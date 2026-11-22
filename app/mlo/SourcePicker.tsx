"use client";

import { useId, useState } from "react";
import { LEAD_SPEND } from "@/lib/content/cc-pages";

export type PickerOption = { key: string; label: string };

/**
 * D83: the Lead source picker. A select of the loan officer's sources,
 * "Past clients & sphere", "Your web form" and "Other…" (which shows a box to
 * name it). The options always include the value already chosen
 * (`sourceOptions`' extra keys). `none` adds "Not lead spend" first
 * (Expenses). The values are source keys; the server makes "Other" into one
 * with `sourceKey()`.
 */
export default function SourcePicker({ options, defaultValue, name = "leadSource", otherName = "leadSourceOther", label = LEAD_SPEND.label, none = false, required = false }: { options: PickerOption[]; defaultValue?: string | null; name?: string; otherName?: string; label?: string; none?: boolean; required?: boolean }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const id = useId();
  return (
    <>
      <label className="mlo-field" htmlFor={`${id}-s`}>
        <span>{label}</span>
        <select id={`${id}-s`} name={name} className="mlo-select" value={value} onChange={(e) => setValue(e.target.value)} required={required && !none}>
          {none ? <option value="">{LEAD_SPEND.none}</option> : <option value="" disabled>{LEAD_SPEND.pick}</option>}
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
          <option value="other">{LEAD_SPEND.other}</option>
        </select>
      </label>
      {value === "other" ? (
        <label className="mlo-field" htmlFor={`${id}-o`}>
          <span>{LEAD_SPEND.otherLabel}</span>
          <input id={`${id}-o`} name={otherName} className="mlo-input" maxLength={60} required autoComplete="off" />
        </label>
      ) : null}
    </>
  );
}
