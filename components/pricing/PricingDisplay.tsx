import { CONFIG, NOT_A_COMMITMENT } from "@/lib/config";
import { copy } from "@/lib/copy";
import type { DisplayRun } from "@/lib/pricing/display";
import type { LenderQuote, SelectionPick } from "@/lib/pricing/types";
import "./pricing.css";

/**
 * PricingDisplay — the anti-steering three-card view plus the full field.
 *
 * Server component, no client JS: the full field is a native <details>.
 * Every number comes from the run (computed in lib/pricing/build.ts);
 * this component only formats. Every rate shows its APR, points, fees,
 * lock period, and the scenario assumptions. The label ("Example pricing"
 * or "Rate snapshot", with its date) is pinned at the top of the surface
 * and repeated under the cards.
 */
const c = copy.pricing;
const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const pct = (n: number) => `${n.toFixed(3)}%`;

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" });
}

export function pricingLabel(d: DisplayRun): string {
  return d.mode === "example"
    ? c.labelExample.replace("{date}", longDate(CONFIG.pricing.examplesAsOf))
    : c.labelSnapshot.replace("{date}", stamp(d.run.pricedAt));
}

function pointsText(q: LenderQuote): string {
  if (q.pointsPct > 0) return `${q.pointsPct.toFixed(3)} (${money(q.pointsDollars)})`;
  if (q.pointsPct < 0) return `${c.fields.credit} ${Math.abs(q.pointsPct).toFixed(3)} (${money(q.pointsDollars)})`;
  return c.fields.noPoints;
}

function Card({ title, pick, quotes }: { title: string; pick: SelectionPick | null; quotes: LenderQuote[] }) {
  if (!pick) return null;
  const q = quotes.find((x) => x.lender === pick.lender && x.eligible);
  if (!q) return null;
  return (
    <article className="px-card" aria-label={`${title}: ${q.lender}`}>
      <p className="px-card__kicker">{title}</p>
      <p className="px-card__lender">{q.lender} · {q.productLabel}</p>
      <p className="px-card__rate">
        <strong>{pct(q.noteRate!)}</strong>
        <span>{pct(q.apr!)} {c.fields.apr}</span>
      </p>
      {q.hasRiskyFeature ? <span className="px-risky">{c.riskyBadge}</span> : null}
      <dl className="px-dl">
        <dt>{c.fields.points}</dt><dd>{pointsText(q)}</dd>
        <dt>{c.fields.origination}</dt><dd>{money(q.originationFee)}</dd>
        <dt>{c.fields.lenderFees}</dt><dd>{money(q.lenderFees)}</dd>
        <dt>{c.fields.lock}</dt><dd>{q.lockDays} {c.fields.days}</dd>
        <dt>{c.fields.payment}</dt><dd>{money(q.monthlyPayment!)}{c.fields.perMonth}</dd>
        {q.monthlyPaymentAfterIO ? (<><dt>{c.fields.afterIO}</dt><dd>{money(q.monthlyPaymentAfterIO)}{c.fields.perMonth}</dd></>) : null}
      </dl>
      <p className="px-why"><span className="sr-only">{c.whyHeading}: </span>{pick.rationale}</p>
    </article>
  );
}

export default function PricingDisplay({ display }: { display: DisplayRun }) {
  const { run, notes } = display;
  const s = run.scenario;
  const label = pricingLabel(display);
  const eligible = run.quotes.filter((q) => q.eligible);
  const ineligible = run.quotes.filter((q) => !q.eligible);

  return (
    <div className="px-root" data-mode={display.mode}>
      <div className="px-sticky"><p className="px-label" role="note">{label}</p></div>

      <div className="px-summary">
        <p className="eyebrow mb-2">{display.mode === "example" ? c.eyebrowExample : c.eyebrowSnapshot}</p>
        <h2 className="px-summary__title">{s.title} · {s.location}</h2>
        <p className="px-summary__meta">
          {s.persona ? `${c.personaPrefix} ${s.persona}. ` : ""}
          {money(s.loanAmount)} loan · {money(s.propertyValue)} home · credit {s.ficoBand}
        </p>
      </div>

      <div className="px-cards">
        <Card title={c.cards.lowestRate} pick={run.selection.lowestRate} quotes={run.quotes} />
        <Card title={c.cards.lowestNoRisk} pick={run.selection.lowestRateWithoutRiskyFeatures} quotes={run.quotes} />
        <Card title={c.cards.lowestCost} pick={run.selection.lowestPointsAndOrigination} quotes={run.quotes} />
      </div>
      <p className="px-fine">
        {run.selection.meetsCreditorCount ? c.creditorCount.replace("{n}", String(run.selection.eligibleCreditors)) : c.fewerThanThree} {c.anonymized}
      </p>
      <p className="px-label mt-3" aria-hidden="true">{label}</p>

      {notes.length ? (
        <section className="px-section" aria-labelledby="px-notes-h">
          <h2 id="px-notes-h">{c.notesHeading}</h2>
          <p className="px-fine" style={{ marginTop: 4 }}>{c.notesSub}</p>
          <div className="px-notes">
            {notes.map((n) => (
              <div key={n.lender} className="px-note">
                <p className="px-note__lender">{n.lender}</p>
                {n.traits.length ? <p className="px-note__traits">{n.traits.join(" · ")}</p> : null}
                {n.note ? <p className="px-note__text">{n.note}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="px-section px-details">
        <summary>{c.fullField} ({run.quotes.length})</summary>
        <div className="px-table-wrap">
          <table className="px-table">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr>
                <th scope="col">Lender</th><th scope="col">Rate</th><th scope="col">{c.fields.apr}</th><th scope="col">{c.fields.points}</th>
                <th scope="col">{c.fields.origination}</th><th scope="col">{c.fields.lenderFees}</th><th scope="col">{c.fields.lock}</th><th scope="col">{c.fields.payment}</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((q) => (
                <tr key={q.lender + q.productLabel}>
                  <th scope="row">{q.lender}{q.hasRiskyFeature ? ` · ${c.riskyBadge}` : ""}<br /><span className="mono-label">{q.productLabel}</span></th>
                  <td>{pct(q.noteRate!)}</td><td>{pct(q.apr!)}</td><td>{pointsText(q)}</td>
                  <td>{money(q.originationFee)}</td><td>{money(q.lenderFees)}</td><td>{q.lockDays} {c.fields.days}</td><td>{money(q.monthlyPayment!)}{c.fields.perMonth}</td>
                </tr>
              ))}
              {ineligible.map((q) => (
                <tr key={q.lender + q.productLabel} className="is-ineligible">
                  <th scope="row">{q.lender}<br /><span className="mono-label">{c.ineligibleHeading}</span></th>
                  <td colSpan={7}>{q.ineligibleReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="px-section" aria-labelledby="px-assume-h">
        <h2 id="px-assume-h">{c.assumptionsHeading}</h2>
        <ul className="px-assumptions">
          {s.assumptions.map((a) => <li key={a}>{a}</li>)}
          <li>{c.lockNote}</li>
          <li>{display.mode === "example" ? c.exampleSource : c.snapshotSource}</li>
        </ul>
        <p className="px-fine">{NOT_A_COMMITMENT}</p>
      </section>
    </div>
  );
}
