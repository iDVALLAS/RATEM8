import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { rateVsAverage as t } from "@/lib/content/rate-vs-average";
import { compareToBenchmark, type BenchmarkComparison, type BenchmarkOption } from "@/lib/pricing/benchmark";
import { mockProvider, exampleScenarios } from "@/lib/pricing/providers/mock";
import "./pricing.css";

/**
 * RateVsAverage — one dated example rate next to a named weekly benchmark
 * (v19, Round 3 Item 3b). OFF by default: renders nothing unless
 * SHOW_NATIONAL_AVG_COMPARISON is "true" AND the hand-entered benchmark
 * in CONFIG is complete, same product, and the same week as the example.
 *
 * This is the only place the site may say the example priced "below" an
 * average, and only when lib/pricing/benchmark.ts computes it (lower rate
 * and no more points). Both rates, both cost figures, both dates and the
 * assumptions footnote always render with it. Server component, no JS.
 * Strings: lib/content/rate-vs-average.ts (check:copy keeps the phrase there).
 */
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
const pct = (n: number, d = 3) => `${n.toFixed(d)}%`;
const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const OPTION_LABEL: Record<BenchmarkOption, string> = {
  lowestRate: copy.pricing.cards.lowestRate,
  lowestRateWithoutRiskyFeatures: copy.pricing.cards.lowestNoRisk,
  lowestPointsAndOrigination: copy.pricing.cards.lowestCost,
};

/** Resolve the comparison from config. Null whenever it must not render. */
export async function resolveRateVsAverage(): Promise<BenchmarkComparison | null> {
  const cfg = CONFIG.pricing.benchmarkComparison;
  if (!cfg.enabled || !CONFIG.pricing.demoExamples) return null;
  const scenario = exampleScenarios().find((s) => s.id === cfg.scenarioId);
  if (!scenario) return null;
  const run = await mockProvider.priceScenario("example", scenario);
  return run ? compareToBenchmark(run, cfg.option, cfg.benchmark, CONFIG.pricing.examplesAsOf) : null;
}

export function RateVsAverageView({ cmp }: { cmp: BenchmarkComparison }) {
  const { quote: q, benchmark: b, scenario: s } = cmp;
  const exDate = longDate(cmp.exampleAsOf);
  const wkDate = longDate(b.weekOf);
  const heading = fill(cmp.below ? t.headingBelow : t.headingSide, { date: exDate, product: b.productLabel });
  const sign = cmp.rateDiff > 0 ? "+" : cmp.rateDiff < 0 ? "−" : "";
  return (
    <section className="px-section px-vs" aria-labelledby="px-vs-h" data-below={cmp.below ? "true" : "false"}>
      <p className="eyebrow mb-2">{t.eyebrow}</p>
      <h2 id="px-vs-h">{heading}</h2>
      <div className="px-vs__grid" role="group" aria-label={t.tableCaption}>
        <article className="px-card" aria-label={fill(t.colExample, { date: exDate })}>
          <p className="px-card__kicker">{fill(t.colExample, { date: exDate })}</p>
          <p className="px-card__lender">{OPTION_LABEL[cmp.option]} · {b.productLabel}</p>
          <dl className="px-dl">
            <dt>{t.rowRate}</dt>
            <dd>{pct(q.noteRate!)}</dd>
            <dt>{t.rowCost}</dt>
            <dd>
              {pct(cmp.examplePointsAndOriginationPct)} ({money(q.pointsAndOriginationDollars)})
            </dd>
            <dt>{t.rowApr}</dt>
            <dd>{pct(q.apr!)}</dd>
            <dt>{t.rowLenderFees}</dt>
            <dd>{money(q.lenderFees)}</dd>
          </dl>
        </article>
        <article className="px-card" aria-label={fill(t.colBenchmark, { source: b.source, date: wkDate })}>
          <p className="px-card__kicker">{fill(t.colBenchmark, { source: b.source, date: wkDate })}</p>
          <p className="px-card__lender">{b.productLabel}</p>
          <dl className="px-dl">
            <dt>{t.rowRate}</dt>
            <dd>{pct(b.rate, 2)}</dd>
            <dt>{t.rowCostBenchmark}</dt>
            <dd>{pct(b.feesAndPointsPct, 2)}</dd>
            <dt>{t.rowApr}</dt>
            <dd>{t.notCompared}</dd>
            <dt>{t.rowLenderFees}</dt>
            <dd>{t.notCompared}</dd>
          </dl>
        </article>
      </div>
      <p className="px-fine">{fill(t.diff, { diff: `${sign}${Math.abs(cmp.rateDiff).toFixed(3)}` })}</p>
      <h3 className="px-vs__fn-h">{t.footnoteHeading}</h3>
      <ol className="px-assumptions px-vs__fn">
        {t.footnotes.map((f) => (
          <li key={f}>
            {fill(f, {
              option: OPTION_LABEL[cmp.option],
              scenario: s.title,
              location: s.location,
              date: exDate,
              source: b.source,
              product: b.productLabel,
              week: wkDate,
              basis: b.basis,
            })}
          </li>
        ))}
      </ol>
      <p className="px-fine">
        <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer">
          {t.sourceLink}
        </a>
      </p>
    </section>
  );
}

export default async function RateVsAverage() {
  const cmp = await resolveRateVsAverage();
  return cmp ? <RateVsAverageView cmp={cmp} /> : null;
}
