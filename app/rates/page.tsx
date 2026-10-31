import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import NextStepActions from "@/components/NextStepActions";
import PricingDisplay from "@/components/pricing/PricingDisplay";
import RateVsAverage from "@/components/pricing/RateVsAverage";
import { CONFIG } from "@/lib/config";
import Reveal from "@/components/motion/Reveal";
import EmptyState from "@/components/ui/EmptyState";
import { copy } from "@/lib/copy";
import { displayScenarios, resolveDisplay } from "@/lib/pricing/display";
import { gridKicker, gridShortLabel, isGridScenario } from "@/lib/pricing/grid";
import { currentPostedWeek } from "@/lib/pricing/posted-rate";
import PostedRateCard from "@/components/pricing/PostedRateCard";
import ArrowText from "@/components/ui/ArrowText";
import { routeContext } from "@/lib/route-context";
import { rateOfficerLine } from "@/lib/licensing";

/**
 * /rates — this week's pricing (v37, L4): the two posted rates
 * (POSTED_RATES), the six weekly scenarios (PRICING_WEEKLY), the selected
 * scenario's three anti-steering options, and the way to a personal
 * estimate through M8 (PERSONAL_QUOTES). Only what a licensed loan
 * officer published, inside its one-week window.
 *
 * noindex: dated examples and snapshots should not sit in search results
 * as if they were current offers.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rates",
  description: "This week's pricing, priced by a licensed loan officer every Thursday: the three options anti-steering rules describe, with APR, points, fees and lock period. Not a quote or commitment to lend.",
  alternates: { canonical: "/rates" },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ s?: string }> };

export default async function RatesPage({ searchParams }: Props) {
  const c = copy.pricing;
  const scenarios = displayScenarios();
  const { s } = await searchParams;
  const active = scenarios.find((x) => x.id === s) ?? scenarios[0];
  const display = active ? await resolveDisplay(active.id) : null;
  // v15: no licensed loan officer for the visitor's state → no pricing, an honest line instead.
  const route = await routeContext();
  const unlicensed = route.status === "unlicensed" ? copy.routing.unlicensedRates.replace("{state}", route.stateName ?? "") : null;
  const posted = CONFIG.pricing.postedRates && !unlicensed ? await currentPostedWeek() : null;
  const cards = await Promise.all(scenarios.map(async (x) => ({ x, d: x.id === active?.id ? display : await resolveDisplay(x.id) })));

  return (
    <PageShell stickyCta crumbs={[{ name: "Home", path: "/" }, { name: "Rates", path: "/rates" }]}>
      <header className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-6 sm:pt-12">
        <Reveal as="h1" text={c.heading} accent={c.headingAccent} immediate className="tagline text-4xl sm:text-6xl leading-tight mb-5" />
        <p className="text-lg leading-relaxed font-light max-w-3xl" style={{ color: "var(--muted)" }}>{c.sub}</p>
      </header>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-label={c.scenarioNav}>
        {posted ? (
          <div id="posted" className="px-posted-row">
            <PostedRateCard week={posted} product="30yr_fixed" />
            <PostedRateCard week={posted} product="15yr_fixed" />
          </div>
        ) : null}

        {unlicensed ? <p className="card">{unlicensed}</p> : (
          <>
            <h2 className="text-2xl font-light mb-1" style={{ color: "var(--fg)" }}>{c.gridHeading}</h2>
            <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>{c.gridSub}</p>
            <nav aria-label={c.scenarioNav}>
              <ul className="px-grid">
                {cards.map(({ x, d }) => {
                  const q = d?.run.quotes.find((y) => y.lender === d.run.selection.lowestRateWithoutRiskyFeatures?.lender);
                  return (
                    <li key={x.id}>
                      <Link href={`/rates?s=${x.id}`} aria-current={x.id === active?.id ? "page" : undefined} scroll={false}>
                        <span className="px-grid__kicker">{isGridScenario(x.id) ? gridKicker(x) : `${x.title} · ${x.state}`}</span>
                        <span className="px-grid__title">{isGridScenario(x.id) ? gridShortLabel(x) : x.location}</span>
                        {q && q.noteRate !== null && q.apr !== null ? (
                          <span className="px-grid__nums" title={c.gridCardRate}>
                            <span>{q.noteRate.toFixed(3)}%</span>
                            <span>{c.fields.apr} {q.apr.toFixed(3)}%</span>
                          </span>
                        ) : <span className="px-grid__nums is-empty">{c.gridNotPriced}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {display ? <PricingDisplay display={display} /> : <EmptyState title={copy.uiStates.pricingEmpty} body={copy.uiStates.pricingEmptyBody} />}
          </>
        )}
        {/* L2: the loan officer and originating company for this scenario's state (Oregon → its MLO). */}
        {!unlicensed && (display || posted) && active && rateOfficerLine(active.state) ? (
          <p className="mt-4 text-xs" style={{ color: "var(--fg-soft)" }}>
            {rateOfficerLine(active.state)}
          </p>
        ) : null}
        {/* v19 (Item 3b): OFF by default; only beside its own dated example, never beside a snapshot. */}
        {!unlicensed && display?.mode === "example" && active?.id === CONFIG.pricing.benchmarkComparison.scenarioId ? <RateVsAverage /> : null}

        {CONFIG.pricing.personalQuotes && !unlicensed ? (
          <div className="px-estimate">
            <div>
              <h2>{c.estimateHeading}</h2>
              <p>{c.estimateBody}</p>
            </div>
            <Link href="/chat?quote=1" className="cta cta--primary">
              <ArrowText text={`${c.estimateCta} →`} />
            </Link>
          </div>
        ) : null}

        <div className="mt-10 max-w-md">
          <NextStepActions label={c.cta} />
        </div>
      </section>
    </PageShell>
  );
}
