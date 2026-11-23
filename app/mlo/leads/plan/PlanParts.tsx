import Link from "next/link";
import { BADGE_RULES, scoreUsd } from "@/lib/leads/scorecard";
import { linePct, PLAN_RULES, ROADMAP, type Allocation, type Estimate, type PlanLine } from "@/lib/leads/plan";
import { CATALOG, catalogWords, type CatalogType } from "@/lib/leads/catalog";
import { roadmapStep, type PlanView } from "@/lib/leads/plan-service";
import type { PlanVersion } from "@/lib/leads/plan-store";
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { customBudgetAction, pickBudgetAction, planTargetAction, savePlanAction } from "./actions";

/**
 * D86: the budget planner's sections (Option C). Every figure comes from lib/leads/plan.ts and the loan officer's own
 * scorecard; the split bar is drawn for the eye only (aria-hidden) and the list under it says the same in words.
 */

const usd = (cents: number) => scoreUsd(cents);
const usdD = (dollars: number) => `$${dollars.toLocaleString("en-US")}`;
const P = LEAD_PLAN;

/** Segment classes in the order the split lists them (the list carries the same names and amounts as text). */
export const segClass = (i: number) => `cc-plan__seg cc-plan__seg--${(i % 6) + 1}`;

/** The split bar (decorative) — the caller always shows the same split as text. */
export function SplitBar({ lines, budgetCents }: { lines: Pick<PlanLine, "key" | "cents">[]; budgetCents: number }) {
  const shown = lines.filter((l) => l.cents > 0);
  return (
    <div className="cc-plan__bar" aria-hidden="true">
      {shown.map((l, i) => (
        <span key={l.key} className={segClass(i)} style={{ width: `${budgetCents > 0 ? ((100 * l.cents) / budgetCents).toFixed(1) : 0}%` }} />
      ))}
    </div>
  );
}

/** The saved plan, at the top of the planner, with its earlier versions. */
export function SavedPlan({ view, history }: { view: PlanView; history: PlanVersion[] }) {
  const S = P.saved;
  return (
    <section className="mlo-section cc-lplan-saved" id="saved" aria-labelledby="lplan-saved">
      <h2 id="lplan-saved">{S.title}</h2>
      <p className="cc-plan__line">{view.done ? S.done(usd(view.budgetCents), view.of) : S.line(usd(view.budgetCents), view.day, view.of)}</p>
      <SplitBar lines={view.lines} budgetCents={view.budgetCents} />
      <p className="mlo-note">{[...view.lines.map((l) => `${l.label} ${usd(l.cents)}`), ...(view.next ? [S.next(view.next)] : [])].join(" · ")}</p>
      <p className="mlo-note">{view.done ? S.over : S.keeps}</p>
      {history.length ? (
        <details className="mlo-details">
          <summary>{S.history(history.length)}</summary>
          <ul className="cc-lplan-hist">
            {history.map((h) => (
              <li key={h.savedAt}>
                {S.historyRow(new Date(h.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }), usd(h.budgetCents), S.why[h.why] ?? h.why)}
                <span className="mlo-note"> {h.lines.filter((l) => l.cents > 0).map((l) => `${l.label} ${usd(l.cents)}`).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** The budget: three presets (each its own bound action, aria-pressed), your own amount, and the target. */
export function BudgetPicker({ dollars, targetCents }: { dollars: number; targetCents: number }) {
  const B = P.budget;
  return (
    <section className="mlo-section cc-lplan-budget" id="budget" aria-labelledby="lplan-budget">
      <h2 id="lplan-budget">{B.title}</h2>
      <div className="cc-lplan-presets" role="group" aria-label={B.presetsLabel}>
        {PLAN_RULES.presetsDollars.map((d) => (
          <form key={d} action={pickBudgetAction.bind(null, d)}>
            <button type="submit" className="cc-lplan-preset" aria-pressed={d === dollars}>{B.preset(usdD(d))}</button>
          </form>
        ))}
      </div>
      <form action={customBudgetAction} className="mlo-row-form cc-lplan-custom">
        <label className="mlo-field">
          <span>{B.custom}</span>
          <input name="dollars" type="number" min={PLAN_RULES.minDollars} max={PLAN_RULES.maxDollars} step="1" inputMode="numeric" className="mlo-input" defaultValue={PLAN_RULES.presetsDollars.includes(dollars) ? undefined : dollars} required />
        </label>
        <button type="submit" className="mlo-btn mlo-btn--ghost">{B.use}</button>
      </form>
      <form action={planTargetAction.bind(null, dollars)} className="mlo-row-form cc-lplan-target">
        <label className="mlo-field">
          <span>{B.target}</span>
          <input name="target" type="number" min={BADGE_RULES.minTargetCents / 100} max={BADGE_RULES.maxTargetCents / 100} step="1" inputMode="numeric" className="mlo-input" defaultValue={Math.round(targetCents / 100)} required aria-describedby="lplan-target-help" />
        </label>
        <button type="submit" className="mlo-btn mlo-btn--ghost">{B.saveTarget}</button>
      </form>
      <p className="mlo-note" id="lplan-target-help">{B.targetHelp(usd(targetCents))}</p>
    </section>
  );
}

/** The line under one part of the split. */
export function lineWhy(l: PlanLine, alloc: Pick<Allocation, "lines">, suggestions: CatalogType[]): string {
  const W = P.split.why;
  switch (l.kind) {
    case "sphere":
      return W.sphere;
    case "fund": {
      const head = l.rankedBy === "loan" && l.perLoanCents !== null ? (l.rank === 1 ? W.bestLoan(usd(l.perLoanCents)) : W.loan(usd(l.perLoanCents), l.rank ?? 0)) : l.perCallableCents !== null ? W.callable(usd(l.perCallableCents), l.rank ?? 0) : W.noCallable(l.rank ?? 0);
      return l.capped ? `${head} ${W.capped(PLAN_RULES.sharePct)}` : head;
    }
    case "test":
      return W.thin(l.leads, PLAN_RULES.testDays);
    case "new-test":
      return [W.newTest(PLAN_RULES.testDays), suggestions.length ? W.suggests(suggestions.map((s) => catalogWords(s).name).join(" or ")) : ""].filter(Boolean).join(" ");
    case "reserve":
      return alloc.lines.some((x) => (x.kind === "fund" || x.kind === "test") && x.cents > 0) ? W.reserveCap : W.reserveNone;
  }
}

/** The split: the bar, the same split as a list (name, amount, share, why), what's left out, and the estimates. */
export function Split({ alloc, estimate, suggestions, noSources }: { alloc: Allocation; estimate: Estimate | null; suggestions: CatalogType[]; noSources: boolean }) {
  const S = P.split;
  const E = P.estimate;
  const L = S.leftOut;
  const R = PLAN_RULES;
  const shown = alloc.lines.filter((l) => l.cents > 0);
  return (
    <section className="mlo-section cc-lplan-split" id="split" aria-labelledby="lplan-split" data-budget={alloc.budgetCents / 100}>
      <h2 id="lplan-split">{S.title(usd(alloc.budgetCents))}</h2>
      {noSources ? <p className="mlo-note">{S.noSources}</p> : null}
      <SplitBar lines={shown} budgetCents={alloc.budgetCents} />
      <ol className="cc-lplan-lines" aria-label={S.title(usd(alloc.budgetCents))}>
        {shown.map((l, i) => (
          <li key={l.key} className="cc-lplan-line" data-key={l.key} data-kind={l.kind} data-cents={l.cents}>
            <span className={`${segClass(i)} cc-lplan-sw`} aria-hidden="true" />
            <div className="cc-lplan-line__main">
              <p className="cc-lplan-line__name"><strong>{l.label}</strong> · <span className="cc-lplan-line__amt">{usd(l.cents)}</span> <span className="mlo-note">({S.pct(linePct(l, alloc.budgetCents))})</span></p>
              <p className="mlo-note">
                {lineWhy(l, alloc, suggestions)}
                {l.kind === "new-test" ? <> <Link href="#catalog">{P.catalog.title}</Link></> : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {alloc.leftOut.length ? (
        <>
          <h3 className="cc-lplan-sub">{S.leftOutTitle}</h3>
          <ul className="cc-lplan-out">
            {alloc.leftOut.map((o) => (
              <li key={o.key} data-key={o.key} data-reason={o.reason}>
                {o.reason === "pause" ? L.pause(o.label, usd(o.spendCents)) : o.reason === "paused" ? L.paused(o.label, o.until ? new Date(o.until).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) : "you change it") : o.reason === "noSpend" ? L.noSpend(o.label) : L.budget(o.label)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="cc-lplan-est" aria-labelledby="lplan-est">
        <h3 className="cc-lplan-sub" id="lplan-est">{E.title}</h3>
        {estimate ? (
          <>
            <dl className="cc-lplan-est__nums">
              <div><dt>{E.leads}</dt><dd>{E.range(estimate.leads[0], estimate.leads[1])}</dd></div>
              <div><dt>{E.loans}</dt><dd>{E.range(estimate.loans[0], estimate.loans[1])}</dd></div>
            </dl>
            <p className="mlo-note">{E.note(estimate.periods)}</p>
            {alloc.lines.some((l) => (l.kind === "new-test" || l.kind === "reserve") && l.cents > 0) ? <p className="mlo-note">{E.leftOut}</p> : null}
          </>
        ) : (
          <p className="mlo-note">{E.none}</p>
        )}
      </div>
      <details className="mlo-details">
        <summary>{S.rulesTitle}</summary>
        <ol className="cc-lplan-rules">
          {S.rules({ sphereMin: usdD(R.sphere.minDollars), sphereMax: usdD(R.sphere.maxDollars), spherePct: R.sphere.pct, share: R.sharePct, testFrom: usdD(R.testFromDollars), testPct: R.testPct, testDays: R.testDays, rankLoans: R.rankByLoanMin }).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/** The 90-day roadmap: three phases, three steps each (each a task on Today once its 30 days begin). */
export function Roadmap({ targetCents }: { targetCents: number }) {
  const R = P.roadmap;
  return (
    <section className="mlo-section cc-lplan-road" id="roadmap" aria-labelledby="lplan-road">
      <h2 id="lplan-road">{R.title}</h2>
      <p className="mlo-note">{R.intro}</p>
      <ol className="cc-lplan-phases">
        {ROADMAP.map((ph, i) => (
          <li key={ph.id} className="cc-lplan-phase" data-phase={ph.id}>
            <p className="cc-lplan-phase__days">{R.phase(ph.from, ph.to)}</p>
            <h3 className="cc-lplan-phase__name">{R.phases[i].name}</h3>
            <ul>
              {ph.steps.map((s) => (
                <li key={s.id}>{roadmapStep(s.id, targetCents).title}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The Business Finder's catalog for the test slot: six types, setup steps and permission, no prices. */
export function Catalog({ suggestions }: { suggestions: CatalogType[] }) {
  const C = P.catalog;
  const sug = new Set(suggestions.map((s) => s.id));
  return (
    <section className="mlo-section cc-lplan-cat" id="catalog" aria-labelledby="lplan-cat">
      <h2 id="lplan-cat">{C.title}</h2>
      <p className="mlo-note">{C.intro}</p>
      <ul className="cc-lplan-types">
        {CATALOG.map((t) => {
          const w = catalogWords(t);
          return (
            <li key={t.id} data-type={t.id}>
              <details className="mlo-details cc-lplan-type">
                <summary>
                  {w.name}
                  {sug.has(t.id) ? <span className="cc-lplan-sug">{C.suggested}</span> : null}
                </summary>
                <p>{w.what}</p>
                {t.marketplace ? <p className="cc-lplan-cost">{C.cost}</p> : null}
                <h3 className="cc-lplan-sub">{C.stepsTitle}</h3>
                <ol>
                  {w.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <h3 className="cc-lplan-sub">{C.permissionTitle}</h3>
                <p>{w.permission}</p>
                <h3 className="cc-lplan-sub">{C.rulesTitle}</h3>
                <p>{w.rules}</p>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Save (bound to the budget on screen), what saving does and never does, and the guardrails. */
export function SaveBar({ dollars }: { dollars: number }) {
  const S = P.save;
  return (
    <section className="mlo-section cc-lplan-save" id="save" aria-labelledby="lplan-save">
      <h2 id="lplan-save" className="sr-only">{S.button}</h2>
      <div className="mlo-actions">
        <form action={savePlanAction.bind(null, dollars)}>
          <button type="submit" className="mlo-btn">{S.button}</button>
        </form>
        <Link className="mlo-btn mlo-btn--ghost" href="/mlo/leads#ask">{S.ask}</Link>
      </div>
      <p className="mlo-note">{P.split.never}</p>
      <ul className="cc-lplan-guards" aria-label={S.guardLabel}>
        {S.guardrails.map((g) => (
          <li key={g} className="cc-chip">{g}</li>
        ))}
      </ul>
    </section>
  );
}
