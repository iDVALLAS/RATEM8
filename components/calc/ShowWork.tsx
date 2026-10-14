import type { Assumption } from "@/lib/calc";
import { CALC_DISCLAIMER } from "@/lib/config";
import { copy } from "@/lib/copy";

/**
 * ShowWork — the "Show your work" panel: formulas in plain text plus the
 * `assumptions` block returned by the calc function. Rendered inside the
 * client body (it needs the live result), styled via `.faq`.
 *
 * AssumptionsList — the same `assumptions` as a visible definition list.
 * CalcDisclaimer — the exact CALC_DISCLAIMER sentence, placed near results.
 */
export function ShowWork({ formulas, notes, assumptions }: { formulas: string[]; notes: string[]; assumptions: Assumption[] }) {
  return (
    <div className="faq calc-work">
      <details>
        <summary>{copy.calculators.showWork}</summary>
        <div className="faq__a">
          <p>Every number on this page comes from these lines. Rates are the ones you typed.</p>
          <pre>
            <code>{formulas.join("\n")}</code>
          </pre>
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p className="mono-label" style={{ marginTop: 12 }}>
            {copy.calculators.assumptions}
          </p>
          <ul>
            {assumptions.map((a) => (
              <li key={a.key}>
                {a.label}: {a.value}
                {a.note ? ` — ${a.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}

export function AssumptionsList({ assumptions }: { assumptions: Assumption[] }) {
  return (
    <section aria-labelledby="calc-assumptions-h">
      <h2 id="calc-assumptions-h" className="principle-label" style={{ marginBottom: 12 }}>
        {copy.calculators.assumptions}
      </h2>
      <dl className="calc-assumptions">
        {assumptions.map((a) => (
          <div key={a.key}>
            <dt>{a.label}</dt>
            <dd>
              {a.value}
              {a.note ? <small>{a.note}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CalcDisclaimer() {
  return <p className="calc-disclaimer">{CALC_DISCLAIMER}</p>;
}
