import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import NextStepActions from "@/components/NextStepActions";
import PricingDisplay from "@/components/pricing/PricingDisplay";
import RateVsAverage from "@/components/pricing/RateVsAverage";
import { CONFIG } from "@/lib/config";
import Reveal from "@/components/motion/Reveal";
import { copy } from "@/lib/copy";
import { displayScenarios, resolveDisplay } from "@/lib/pricing/display";
import { routeContext } from "@/lib/route-context";

/**
 * /rates — example pricing (and, when PRICING_MANUAL is on, the latest
 * fresh manual snapshot) in the anti-steering three-card layout.
 *
 * noindex: dated examples and snapshots should not sit in search results
 * as if they were current offers.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Example rates",
  description: "How M8 shows pricing: the three options anti-steering rules describe, then every result, with APR, points, fees and lock period. Dated examples, not quotes.",
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

  return (
    <PageShell crumbs={[{ name: "Home", path: "/" }, { name: "Example rates", path: "/rates" }]}>
      <header className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-6 sm:pt-12">
        <Reveal as="h1" text={c.heading} accent={c.headingAccent} immediate className="tagline text-4xl sm:text-6xl leading-tight mb-5" />
        <p className="text-lg leading-relaxed font-light max-w-3xl" style={{ color: "var(--muted)" }}>{c.sub}</p>
      </header>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-label={c.scenarioNav}>
        <nav aria-label={c.scenarioNav}>
          <ul className="px-scenario-nav">
            {scenarios.map((x) => (
              <li key={x.id}>
                <Link href={`/rates?s=${x.id}`} aria-current={x.id === active?.id ? "page" : undefined} scroll={false}>
                  {x.title} · {x.state}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {unlicensed ? <p className="card">{unlicensed}</p> : display ? <PricingDisplay display={display} /> : <p className="card">{c.unavailable}</p>}
        {/* v19 (Item 3b): OFF by default; only beside its own dated example, never beside a snapshot. */}
        {!unlicensed && display?.mode === "example" && active?.id === CONFIG.pricing.benchmarkComparison.scenarioId ? <RateVsAverage /> : null}

        <div className="mt-10 max-w-md">
          <NextStepActions label={c.cta} />
        </div>
      </section>
    </PageShell>
  );
}
