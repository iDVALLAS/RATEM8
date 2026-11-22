import Link from "next/link";
import KeyMaker from "../pipeline/KeyMaker";
import PermissionTip from "./PermissionTip";
import { EXAMPLES, exampleRow, type ExampleBadge } from "@/lib/leads/examples";
import { share, type SourceCount } from "@/lib/leads/mode";
import { LEADS } from "@/lib/content/cc-pages";

/**
 * D82: the sections of Lead sources. Example sections read only the fixed
 * fixture in lib/leads/examples.ts and render it as plain text (no links into
 * contacts, no working buttons); real sections read only the loan officer's
 * own book. A section is one or the other, never both.
 */

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const TONE: Record<ExampleBadge, "ok" | "plain" | "warn" | "bad"> = { best: "ok", scale: "ok", watch: "plain", fix: "warn", pause: "bad" };
/** Under this share of leads you can call, the number is shown in the warning color (as in the mockup). */
const LOW_SHARE = 50;

/** A section's heading, with the EXAMPLE label and its line when it shows example numbers. */
function Head({ id, title, example, line, aside }: { id: string; title: string; example?: boolean; line?: string; aside?: React.ReactNode }) {
  return (
    <>
      <div className="cc-leadsec__head">
        <h2 id={id}>{title}</h2>
        {example ? <span className="cc-ex">{LEADS.example.label}</span> : null}
        {aside ? <div className="cc-leadsec__aside">{aside}</div> : null}
      </div>
      {example ? <p className="cc-ex-line">{line ?? LEADS.example.line}</p> : null}
    </>
  );
}

/** The question box (D85 wires it; until then it says so and does nothing). */
export function AskBar() {
  const a = LEADS.ask;
  return (
    <section className="mlo-section cc-leadask" id="ask" aria-labelledby="leads-ask">
      <h2 id="leads-ask" className="sr-only">{a.label}</h2>
      <div className="mlo-row-form cc-leadask__form">
        <input className="mlo-input" type="text" placeholder={a.placeholder} aria-label={a.label} aria-describedby="leads-ask-off" disabled />
        <button type="button" className="mlo-btn" disabled aria-describedby="leads-ask-off">{a.button}</button>
      </div>
      <ul className="cc-leadask__try" aria-label={a.tryLabel}>
        {a.suggestions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mlo-note cc-leadask__off" id="leads-ask-off">{a.off}</p>
    </section>
  );
}

function Badge({ badge }: { badge: ExampleBadge }) {
  return <span className={`cc-reach cc-reach--${TONE[badge]}`}>{LEADS.score.badges[badge]}</span>;
}

/** The scorecard filled from the fixture: a table on desktop, stacked cards on phones (Option B). */
export function ExampleScorecard() {
  const s = LEADS.score;
  const periods = (
    <div className="cc-period" role="group" aria-label={s.periodLabel}>
      {s.periods.map((p) => (
        <button key={p} type="button" className="cc-period__b" aria-pressed={p === EXAMPLES.period} disabled>
          {p}
        </button>
      ))}
    </div>
  );
  return (
    <section className="mlo-section cc-score" id="scorecard" aria-labelledby="leads-score" data-example="true">
      <Head id="leads-score" title={s.title} example aside={periods} />
      <div className="cc-leadbanner">
        <p><strong>{s.bannerWho}</strong> {EXAMPLES.banner}</p>
        <button type="button" className="mlo-btn" disabled>{s.review}</button>
      </div>
      <div className="mlo-scroll cc-score__wide">
        <table className="mlo-table cc-score__tbl">
          <thead>
            <tr>
              <th scope="col">{s.cols.source}</th>
              <th scope="col" className="cc-num">{s.cols.spent}</th>
              <th scope="col" className="cc-num">{s.cols.leads}</th>
              <th scope="col" className="cc-num">{s.cols.perLead}</th>
              <th scope="col" className="cc-num">{s.cols.canCall}</th>
              <th scope="col" className="cc-num">{s.cols.loans}</th>
              <th scope="col" className="cc-num">{s.cols.perLoan}</th>
              <th scope="col">{s.cols.says}</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.sources.map((x) => {
              const r = exampleRow(x);
              return (
                <tr key={x.name}>
                  <th scope="row">{x.name}</th>
                  <td className="cc-num">{usd(x.spent)}</td>
                  <td className="cc-num">{x.leads}</td>
                  <td className="cc-num">{usd(r.perLead)}</td>
                  <td className={`cc-num${r.canCallShare < LOW_SHARE ? " cc-num--warn" : ""}`}>{r.canCallShare}%</td>
                  <td className="cc-num">{x.loans}</td>
                  <td className="cc-num">{r.perLoan === null ? s.noLoans : usd(r.perLoan)}</td>
                  <td><Badge badge={x.badge} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="cc-score__cards">
        {EXAMPLES.sources.map((x) => {
          const r = exampleRow(x);
          return (
            <li key={x.name} className="cc-scard">
              <div className="cc-scard__top">
                <h3 className="cc-scard__name">{x.name}</h3>
                <Badge badge={x.badge} />
              </div>
              <p className="cc-scard__big">{r.perLoan === null ? <strong>{s.noLoansCard}</strong> : <><strong>{usd(r.perLoan)}</strong> {s.perLoanUnit}</>}</p>
              <dl className="cc-scard__stats">
                <div><dt>{s.cols.spent}</dt><dd>{usd(x.spent)}</dd></div>
                <div><dt>{s.cols.leads}</dt><dd>{x.leads}</dd></div>
                <div><dt>{s.cols.perLead}</dt><dd>{usd(r.perLead)}</dd></div>
                <div><dt>{s.cols.canCall}</dt><dd className={r.canCallShare < LOW_SHARE ? "cc-num--warn" : undefined}>{r.canCallShare}%</dd></div>
                <div><dt>{s.cols.loans}</dt><dd>{x.loans}</dd></div>
              </dl>
              <p className="cc-scard__note">{x.note}</p>
            </li>
          );
        })}
      </ul>
      <p className="mlo-note cc-score__foot">
        {s.spendLine} <Link href="/mlo/expenses">{s.logSpend}</Link>
      </p>
      <p className="mlo-note cc-score__foot">{s.canCallNote}</p>
    </section>
  );
}

/** The scorecard from the loan officer's own leads, before spend and loans are tagged by source (D83–D84). */
export function RealScorecard({ rows }: { rows: SourceCount[] }) {
  const s = LEADS.score;
  return (
    <section className="mlo-section cc-score" id="scorecard" aria-labelledby="leads-score" data-example="false">
      <Head id="leads-score" title={s.title} />
      <p className="mlo-note">{s.real.sub}</p>
      {rows.length === 0 ? <p className="mlo-note">{s.real.none}</p> : (
        <table className="mlo-table cc-score__tbl cc-score__tbl--real">
          <thead>
            <tr>
              <th scope="col">{s.cols.source}</th>
              <th scope="col" className="cc-num">{s.cols.leads}</th>
              <th scope="col" className="cc-num">{s.cols.canCall}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = share(r.canCall, r.leads);
              return (
                <tr key={r.source}>
                  <th scope="row">{r.source}</th>
                  <td className="cc-num">{r.leads}</td>
                  <td className={`cc-num${pct < LOW_SHARE ? " cc-num--warn" : ""}`}>{r.canCall} · {pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="mlo-note cc-score__foot">{s.real.notYet}</p>
      <p className="mlo-note cc-score__foot">{s.canCallNote}</p>
    </section>
  );
}

/** The lead plan card from the fixture (Option C's saved plan). Stays an example until D86 saves a plan. */
export function ExamplePlan({ afterLeads }: { afterLeads: boolean }) {
  const p = EXAMPLES.plan;
  const total = p.split.reduce((n, x) => n + x.dollars, 0);
  return (
    <section className="mlo-section cc-plan" id="plan" aria-labelledby="leads-plan" data-example="true">
      <Head id="leads-plan" title={LEADS.plan.title} example line={afterLeads ? LEADS.example.planLine : LEADS.example.line} />
      <div className="cc-plan__row">
        <div className="cc-plan__main">
          <p className="cc-plan__line">{LEADS.plan.line(usd(p.monthly), p.day, p.of)}</p>
          <div className="cc-plan__bar" aria-hidden="true">
            {p.split.map((x, i) => (
              <span key={x.label} className={`cc-plan__seg cc-plan__seg--${i + 1}`} style={{ width: `${((100 * x.dollars) / total).toFixed(1)}%` }} />
            ))}
          </div>
          <p className="mlo-note">{[...p.split.map((x) => `${x.label} ${usd(x.dollars)}`), LEADS.plan.next(p.nextCheckIn)].join(" · ")}</p>
        </div>
        <button type="button" className="mlo-btn mlo-btn--ghost" disabled aria-describedby="leads-plan-off">{LEADS.plan.open}</button>
      </div>
      <p className="mlo-note" id="leads-plan-off">{LEADS.plan.off}</p>
    </section>
  );
}

/** Connect a vendor: full on top until real leads arrive, then compact in section 4 (everything from D81 kept). */
export function AddSource({ compact, endpoint, owner, connected }: { compact: boolean; endpoint: string; owner: boolean; connected: string[] }) {
  const a = LEADS.add;
  const how = <p className="mlo-note">{LEADS.how} {a.nameTip}</p>;
  return (
    <section className={`mlo-section cc-addsrc${compact ? " cc-addsrc--compact" : ""}`} id="add" aria-labelledby="leads-add">
      <h2 id="leads-add">{a.title}</h2>
      {compact ? null : how}
      <div className="cc-permline">
        <p className="mlo-note">{LEADS.permissionLine}</p>
        <PermissionTip />
      </div>
      <KeyMaker endpoint={endpoint} defaultLabel="Lead vendor" owner={owner} />
      <div className="cc-addsrc__chips">
        {connected.length ? (
          <ul className="cc-addsrc__list" aria-label={a.connected}>
            {connected.map((l) => (
              <li key={l} className="cc-chip">{a.on(l)}</li>
            ))}
          </ul>
        ) : null}
        <Link className="cc-addsrc__manage" href="/mlo/connections#keys">{a.manage}</Link>
      </div>
      <details className="mlo-details">
        <summary>{compact ? a.how : a.fieldsTitle}</summary>
        {compact ? how : null}
        <p className="mlo-note">The consent wording as <code>consent_text</code>, when they agreed as <code>consent_timestamp</code>, and the web page as <code>page_url</code>. Add <code>?source=</code> and the vendor&apos;s name to the address to label each lead.</p>
      </details>
    </section>
  );
}

/** Recent leads from the fixture: plain names (never links into contacts), the same pills and i as the real list. */
export function ExampleRecent() {
  return (
    <section className="mlo-section cc-recent" id="recent" aria-labelledby="leads-recent" data-example="true">
      <Head id="leads-recent" title={LEADS.recent.title(EXAMPLES.recent.length)} example />
      <table className="mlo-table mlo-table--plain">
        <tbody>
          {EXAMPLES.recent.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}<br /><span className="mlo-note">{r.source} · {r.at}</span></th>
              <td className="cc-leadperm-cell">
                {r.permission ? (
                  <span className="cc-reach cc-reach--ok">{LEADS.status.ok}</span>
                ) : (
                  <span className="cc-leadperm">
                    <span className="cc-reach cc-reach--warn">{LEADS.status.none}</span>
                    <PermissionTip label={LEADS.rowTipLabel(r.name)} tone="warn" size="sm" />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export type RecentRow = { id: string; name: string; source: string; at: string; ok: boolean };

/** Recent leads from the loan officer's own book (D14, D81). */
export function RealRecent({ rows }: { rows: RecentRow[] }) {
  return (
    <section className="mlo-section cc-recent" id="recent" aria-labelledby="leads-recent" data-example="false">
      <h2 id="leads-recent">{LEADS.recent.title(rows.length)}</h2>
      {rows.length === 0 ? <p className="mlo-note">{LEADS.recent.none}</p> : (
        <table className="mlo-table mlo-table--plain">
          <tbody>
            {rows.map(({ id, name, source, at, ok }) => (
              <tr key={id}>
                <th scope="row"><Link href={`/mlo/contacts/${id}`}>{name}</Link><br /><span className="mlo-note">{source} · {at}</span></th>
                <td className="cc-leadperm-cell">
                  {ok ? (
                    <span className="cc-reach cc-reach--ok">{LEADS.status.ok}</span>
                  ) : (
                    <span className="cc-leadperm">
                      <span className="cc-reach cc-reach--warn">{LEADS.status.none}</span>
                      <PermissionTip label={LEADS.rowTipLabel(name)} tone="warn" size="sm" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
