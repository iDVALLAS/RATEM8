import { MODE_WORDS } from "@/lib/content/loa";
import "./autonomy-toggle.css";

export type ToggleValue = "auto" | "approve" | "off" | "inherit";

/**
 * D70: the shared three-way switch (Full-auto · LO-Auth · Off), with an
 * optional fourth "Use my setting" for one loan. Native radio buttons in a
 * radiogroup: arrow keys move between options and Tab leaves the group,
 * with or without JavaScript. Every option carries its word, so color is
 * never the only cue; a disabled option keeps its reason in
 * aria-describedby. Reused later on Automations, Campaigns and Concierge.
 */
export default function AutonomyToggle({
  name,
  label,
  value,
  inherit,
  disabled,
  readOnly,
  idBase,
  inheritHint,
}: {
  /** The form field name. */
  name: string;
  /** The accessible name of the group, e.g. "Open escrow, purchase". */
  label: string;
  value: ToggleValue;
  /** Adds "Use my setting" first (per-loan overrides). */
  inherit?: boolean;
  /** Options that can't be chosen, each with its reason. */
  disabled?: Partial<Record<ToggleValue, string>>;
  /** Shows the setting without letting this person change it, with the reason. */
  readOnly?: string;
  /** A unique, stable id prefix (the reasons are referenced by id). */
  idBase: string;
  /** What "Use my setting" currently means, e.g. "LO-Auth". */
  inheritHint?: string;
}) {
  const options: ToggleValue[] = inherit ? ["inherit", "auto", "approve", "off"] : ["auto", "approve", "off"];
  return (
    <fieldset role="radiogroup" aria-label={label} className={`cc-auto${inherit ? " cc-auto--4" : ""}`}>
      {options.map((o) => {
        const why = readOnly ?? disabled?.[o];
        const whyId = why ? `${idBase}-${o}-why` : undefined;
        return (
          <label key={o} className={`cc-auto__opt cc-auto__opt--${o}`} title={why}>
            <input type="radio" name={name} value={o} defaultChecked={value === o} disabled={!!why} aria-describedby={whyId} />
            {o === "inherit" ? null : <span className="cc-auto__dot" aria-hidden="true" />}
            <span className="cc-auto__word">
              {MODE_WORDS[o]}
              {o === "inherit" && inheritHint ? <span className="cc-auto__hint"> ({inheritHint})</span> : null}
            </span>
          </label>
        );
      })}
      {options.map((o) => {
        const why = readOnly ?? disabled?.[o];
        return why ? <span key={o} id={`${idBase}-${o}-why`} className="sr-only">{why}</span> : null;
      })}
    </fieldset>
  );
}
