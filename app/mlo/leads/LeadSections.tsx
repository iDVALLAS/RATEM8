import Link from "next/link";
import KeyMaker from "../pipeline/KeyMaker";
import PermissionTip from "./PermissionTip";
import SourcePicker, { type PickerOption } from "../SourcePicker";
import { approveLeadMoveAction, dismissLeadMoveAction, removeMonthlyAction, saveMonthlyAction, saveTargetAction, scorePeriodAction } from "./actions";
import type { PlanView } from "@/lib/leads/plan-service";
import { EXAMPLES, exampleRow } from "@/lib/leads/examples";
import { BADGE_RULES, DEFAULT_PERIOD, SCORE_PERIODS, scoreUsd, type LeadScorecard, type ScoreBadge, type ScorePeriod, type ScoreRow } from "@/lib/leads/scorecard";
import { LEADS } from "@/lib/content/cc-pages";

/**
 * D82: the sections of Lead sources. Example sections read only the fixed
 * fixture in lib/leads/examples.ts and render it as plain text (no links into
 * contacts, no working buttons); real sections read only the loan officer's
 * own book. A section is one or the other, never both.
 */

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const TONE: Record<ScoreBadge, "ok" | "plain" | "warn" | "bad"> = { best: "ok", scale: "ok", watch: "plain", fix: "warn", pause: "bad", thin: "plain" };
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

function Badge({ badge }: { badge: ScoreBadge }) {
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
        {s.spendLine} <Link href="/mlo/expenses">{s.logSpend}</Link> · <Link href="#monthly">{s.setMonthly}</Link>
      </p>
      <p className="mlo-note cc-score__foot">{s.canCallNote}</p>
    </section>
  );
}

/** D84: the Business Manager's newest open lead-source move, shown above the scorecard. */
export type LeadMoveView = { id: string; title: string; why: string };

/** A cell's figure, or "—" when it can't be worked out. */
const dash = (v: number | null, f: (n: number) => string = String) => (v === null ? LEADS.score.real.dash : f(v));
const pct = (n: number) => `${n}%`;
const lowShare = (r: ScoreRow) => r.sharePct !== null && r.sharePct < BADGE_RULES.fixShareBelowPct;

/** The period switch: a real button per period, each its own bound action (no value-carrying buttons). */
function PeriodSwitch({ period }: { period: ScorePeriod }) {
  const s = LEADS.score;
  return (
    <div className="cc-period" role="group" aria-label={s.periodLabel}>
      {SCORE_PERIODS.map((p) => (
        <form key={p} action={scorePeriodAction.bind(null, p)}>
          <button type="submit" className="cc-period__b" aria-pressed={p === period}>{s.real.periodNames[p]}</button>
        </form>
      ))}
    </div>
  );
}

/**
 * D84: the scorecard from the loan officer's own data (Option B): per source, spend at its business share, leads,
 * leads you can call, cost per lead and per lead you can call, loans in the pipeline and closed, cost per loan,
 * repeats, and the badge. A table on desktop, stacked cards on phones. Never example rows.
 */
export function RealScorecard({ card, move, review }: { card: LeadScorecard; move: LeadMoveView | null; review?: boolean }) {
  const s = LEADS.score;
  const r = s.real;
  const period = card.period;
  const name = r.periodNames[period];
  const q = period === DEFAULT_PERIOD ? "" : `period=${period}&`;
  return (
    <section className="mlo-section cc-score" id="scorecard" aria-labelledby="leads-score" data-example="false" data-period={period}>
      <Head id="leads-score" title={s.title} aside={<PeriodSwitch period={period} />} />
      <p className="mlo-note cc-score__sub">{r.sub(name)}</p>
      {move ? (
        <>
          <div className="cc-leadbanner" id="lead-move">
            <p><strong>{s.bannerWho}</strong> {move.title}</p>
            <Link className="mlo-btn" href={`/mlo/leads?${q}review=1#lead-move`} aria-expanded={!!review} aria-controls={review ? "lead-move-review" : undefined}>{r.move.review}</Link>
          </div>
          {review ? (
            <div className="cc-leadmove" id="lead-move-review" role="region" aria-label={move.title}>
              <p className="cc-leadmove__why">{move.why}</p>
              <div className="mlo-row-form cc-leadmove__acts">
                <form action={approveLeadMoveAction.bind(null, period, move.id)}>
                  <button type="submit" className="mlo-btn" aria-describedby="lead-move-note">{r.move.approve}</button>
                </form>
                <form action={dismissLeadMoveAction.bind(null, period, move.id)}>
                  <button type="submit" className="mlo-btn mlo-btn--ghost">{r.move.notNow}</button>
                </form>
                <Link className="cc-leadmove__all" href="/mlo/agents">{r.move.all}</Link>
              </div>
              <p className="mlo-note" id="lead-move-note">{r.move.approveNote}</p>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="mlo-scroll cc-score__wide">
        <table className="mlo-table cc-score__tbl cc-score__tbl--live">
          <thead>
            <tr>
              <th scope="col">{s.cols.source}</th>
              <th scope="col" className="cc-num">{s.cols.spent}</th>
              <th scope="col" className="cc-num">{s.cols.leads}</th>
              <th scope="col" className="cc-num">{s.cols.perLead}</th>
              <th scope="col" className="cc-num">{r.cols.canCall}</th>
              <th scope="col" className="cc-num">{r.cols.pipeline}</th>
              <th scope="col" className="cc-num">{s.cols.loans}</th>
              <th scope="col" className="cc-num">{s.cols.perLoan}</th>
              <th scope="col" className="cc-num">{s.cols.repeats}</th>
              <th scope="col">{s.cols.says}</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((x) => (
              <tr key={x.key} data-source={x.key}>
                <th scope="row">{x.label}</th>
                <td className="cc-num">{scoreUsd(x.spendCents)}</td>
                <td className="cc-num">{x.leads}</td>
                <td className="cc-num">{scoreUsd(x.perLeadCents)}</td>
                <td className={`cc-num${lowShare(x) ? " cc-num--warn" : ""}`}>
                  {x.canCall} · {dash(x.sharePct, pct)}
                  {x.perCallableCents !== null ? <span className="cc-score__each">{r.each(scoreUsd(x.perCallableCents))}</span> : null}
                </td>
                <td className="cc-num">{x.inPipeline}</td>
                <td className="cc-num">{x.closed}</td>
                <td className="cc-num">{x.perLoanCents === null ? (x.closed ? r.dash : s.noLoans) : scoreUsd(x.perLoanCents)}</td>
                <td className="cc-num">{x.repeats}</td>
                <td>{x.badge ? <Badge badge={x.badge} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="cc-score__cards">
        {card.rows.map((x) => (
          <li key={x.key} className="cc-scard" data-source={x.key}>
            <div className="cc-scard__top">
              <h3 className="cc-scard__name">{x.label}</h3>
              {x.badge ? <Badge badge={x.badge} /> : null}
            </div>
            <p className="cc-scard__big">{x.perLoanCents === null ? <strong>{x.closed ? r.dash : s.noLoansCard}</strong> : <><strong>{scoreUsd(x.perLoanCents)}</strong> {r.perLoanUnit}</>}</p>
            <dl className="cc-scard__stats">
              <div><dt>{s.cols.spent}</dt><dd>{scoreUsd(x.spendCents)}</dd></div>
              <div><dt>{s.cols.leads}</dt><dd>{x.leads}</dd></div>
              <div><dt>{s.cols.perLead}</dt><dd>{scoreUsd(x.perLeadCents)}</dd></div>
              <div><dt>{r.cols.canCall}</dt><dd className={lowShare(x) ? "cc-num--warn" : undefined}>{x.canCall} · {dash(x.sharePct, pct)}</dd></div>
              <div><dt>{r.cols.perCallable}</dt><dd>{scoreUsd(x.perCallableCents)}</dd></div>
              <div><dt>{r.cols.pipeline}</dt><dd>{x.inPipeline}</dd></div>
              <div><dt>{s.cols.loans}</dt><dd>{x.closed}</dd></div>
              <div><dt>{s.cols.repeats}</dt><dd>{x.repeats}</dd></div>
            </dl>
            {x.sphere ? <p className="cc-scard__note">{r.sphereNote}</p> : null}
          </li>
        ))}
      </ul>
      {card.rows.every((x) => !x.leads && !x.spendCents && !x.closed && !x.inPipeline) ? <p className="mlo-note cc-score__foot">{r.none}</p> : null}
      <p className="mlo-note cc-score__foot">
        {s.spendLine} <Link href="/mlo/expenses">{s.logSpend}</Link> · <Link href="#monthly">{s.setMonthly}</Link>
      </p>
      <form action={saveTargetAction.bind(null, period)} className="mlo-row-form cc-target">
        <label className="mlo-field">
          <span>{r.target.label}</span>
          <input name="target" type="number" min={BADGE_RULES.minTargetCents / 100} max={BADGE_RULES.maxTargetCents / 100} step="1" inputMode="numeric" className="mlo-input" defaultValue={Math.round(card.targetCents / 100)} required aria-describedby="leads-target-help" />
        </label>
        <button type="submit" className="mlo-btn mlo-btn--ghost">{r.target.save}</button>
      </form>
      <p className="mlo-note cc-score__foot" id="leads-target-help">{r.target.help(scoreUsd(card.targetCents))}</p>
      {card.undated ? <p className="mlo-note cc-score__foot">{r.undated(card.undated)}</p> : null}
      {card.unattributed ? <p className="mlo-note cc-score__foot">{r.unattributed(card.unattributed)}</p> : null}
      <p className="mlo-note cc-score__foot">{s.canCallNote}</p>
      <p className="mlo-note cc-score__foot">{s.repeatsNote}</p>
      <p className="mlo-note cc-score__foot">{s.badgeNote}</p>
    </section>
  );
}

export type MonthlyRow = { key: string; label: string; cents: number; madeThisMonth: boolean };

/** D83: a monthly amount per source; each month it becomes a draft expense to confirm on Expenses. Always the loan officer's own. */
export function MonthlyAmounts({ rows, options, month }: { rows: MonthlyRow[]; options: PickerOption[]; month: string }) {
  const m = LEADS.monthly;
  return (
    <section className="mlo-section cc-monthly" id="monthly" aria-labelledby="leads-monthly">
      <h2 id="leads-monthly">{m.title}</h2>
      <p className="mlo-note">{m.intro}</p>
      {rows.length === 0 ? <p className="mlo-note">{m.none}</p> : (
        <ul className="cc-monthly__list">
          {rows.map((r) => (
            <li key={r.key} className="cc-monthly__row">
              <span className="cc-monthly__name">{r.label}</span>
              <span className="cc-monthly__amt">{m.each(usd(Math.round(r.cents / 100)))}{r.madeThisMonth ? <span className="mlo-note"> · {m.made(month)}</span> : null}</span>
              <form action={removeMonthlyAction.bind(null, r.key)}>
                <button type="submit" className="mlo-btn mlo-btn--ghost" aria-label={m.remove(r.label)}>{m.removeWord}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={saveMonthlyAction} className="mlo-row-form cc-monthly__form">
        <SourcePicker options={options} name="source" otherName="sourceOther" label={m.source} required />
        <label className="mlo-field"><span>{m.amount}</span><input name="dollars" type="number" min={1} max={100000} step="1" inputMode="decimal" className="mlo-input" required /></label>
        <button type="submit" className="mlo-btn">{m.save}</button>
      </form>
      <p className="mlo-note"><Link href="/mlo/expenses#drafts" className="cc-tap">{m.drafts}</Link></p>
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
        <Link className="mlo-btn mlo-btn--ghost" href="/mlo/leads/plan" aria-describedby="leads-plan-note">{LEADS.plan.open}</Link>
      </div>
      <p className="mlo-note" id="leads-plan-note">{LEADS.plan.exampleNote}</p>
    </section>
  );
}

/**
 * D86: the saved lead plan (never an example): the budget, day X of 90, the split bar (drawn for the eye; the line
 * under it says the same split in words), the next check-in, and the planner.
 */
export function RealPlan({ view }: { view: PlanView }) {
  const P = LEADS.plan;
  const shown = view.lines.filter((l) => l.cents > 0);
  return (
    <section className="mlo-section cc-plan" id="plan" aria-labelledby="leads-plan" data-example="false">
      <Head id="leads-plan" title={P.title} />
      <div className="cc-plan__row">
        <div className="cc-plan__main">
          <p className="cc-plan__line">{view.done ? P.done(scoreUsd(view.budgetCents), view.of) : P.line(scoreUsd(view.budgetCents), view.day, view.of)}</p>
          <div className="cc-plan__bar" aria-hidden="true">
            {shown.map((x, i) => (
              <span key={x.key} className={`cc-plan__seg cc-plan__seg--${(i % 6) + 1}`} style={{ width: `${view.budgetCents > 0 ? ((100 * x.cents) / view.budgetCents).toFixed(1) : 0}%` }} />
            ))}
          </div>
          <p className="mlo-note">{[...shown.map((x) => `${x.label} ${scoreUsd(x.cents)}`), ...(view.next ? [P.next(view.next)] : [])].join(" · ")}</p>
        </div>
        <Link className="mlo-btn mlo-btn--ghost" href="/mlo/leads/plan">{P.open}</Link>
      </div>
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

export type RecentRow = { id: string; name: string; source: string; at: string; ok: boolean; repeat: boolean };

/** Recent leads from the loan officer's own book (D14, D81). */
export function RealRecent({ rows }: { rows: RecentRow[] }) {
  return (
    <section className="mlo-section cc-recent" id="recent" aria-labelledby="leads-recent" data-example="false">
      <h2 id="leads-recent">{LEADS.recent.title(rows.length)}</h2>
      {rows.length === 0 ? <p className="mlo-note">{LEADS.recent.none}</p> : (
        <table className="mlo-table mlo-table--plain">
          <tbody>
            {rows.map(({ id, name, source, at, ok, repeat }) => (
              <tr key={id}>
                <th scope="row"><Link href={`/mlo/contacts/${id}`} className="cc-tap">{name}</Link><br /><span className="mlo-note">{source}{repeat ? ` · ${LEADS.recent.repeat}` : ""} · {at}</span></th>
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
