import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import JsonLd from "@/components/JsonLd";
import BookingCTA from "@/components/BookingCTA";
import Provenance from "@/components/Provenance";
import LicenseBlock from "@/components/states/LicenseBlock";
import { STATES, stateBySlug, stateChip, stateDisplay, CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { stateContent, statePageContent as t } from "@/lib/content/states";
import { stateServiceJsonLd, webPageJsonLd } from "@/lib/jsonld";
import "@/components/states/states.css";

const UPDATED = "2026-09-29";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return STATES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const state = stateBySlug(slug);
  if (!state) return { title: `Not found — ${CONFIG.brandName}` };
  const content = stateContent(state);
  return {
    title: `${stateDisplay(state)} — ${CONFIG.brandName}`,
    description: content.metaDescription,
    alternates: { canonical: `/states/${state.slug}` },
  };
}

/**
 * /states/[slug] — one page per licensed state, generated from config.
 * Hero, license block, counsel placeholder, three general local-context
 * sections, calculator strip, booking CTA. No statistics, no rates.
 */
export default async function StatePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const state = stateBySlug(slug);
  if (!state) notFound();

  const content = stateContent(state);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "States", path: "/disclosures" },
    { name: state.name, path: `/states/${state.slug}` },
  ];
  const others = STATES.filter((s) => s.slug !== state.slug);
  const serviceJsonLd = stateServiceJsonLd(state.slug);

  return (
    <PageShell crumbs={crumbs}>
      {serviceJsonLd ? <JsonLd data={serviceJsonLd} /> : null}
      <JsonLd
        data={webPageJsonLd({
          path: `/states/${state.slug}`,
          name: `${CONFIG.brandName} in ${state.name}`,
          description: content.metaDescription,
          dateModified: UPDATED,
        })}
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <header className="st-hero">
          <p className="eyebrow">{copy.statePage.eyebrow}</p>
          <h1 className="tagline mt-3 text-5xl sm:text-7xl">{state.name}</h1>
          <p className="st-hero__accent">{content.accentLine}</p>
          <p className="st-hero__sub">
            {copy.hero.sub}
          </p>
        </header>

        {/* License block */}
        <LicenseBlock state={state} />

        {/* Local context */}
        <section aria-labelledby="st-context-h" className="mt-14">
          <p className="eyebrow">{t.contextEyebrow}</p>
          <h2 id="st-context-h" className="font-serif-display mt-2 text-3xl">
            {t.contextHeading}
          </h2>
          <div className="st-sections mt-8">
            {content.sections.map((sec) => (
              <article key={sec.title} className="st-section card">
                <p className="code-label">{sec.eyebrow}</p>
                <h3>{sec.title}</h3>
                <div className="prose-m8">
                  {sec.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Calculators */}
        <section aria-labelledby="st-calcs-h" className="mt-14">
          <p className="eyebrow">{copy.calculators.eyebrow}</p>
          <h2 id="st-calcs-h" className="font-serif-display mt-2 text-3xl">
            {copy.statePage.calculatorsHeading}
          </h2>
          <p className="mt-2 text-sm font-light" style={{ color: "var(--muted)" }}>
            {t.calculatorsSub}
          </p>
          <div className="st-calcs mt-6">
            {copy.calculators.items.map((c) => (
              <Link key={c.slug} href={`/calculators/${c.slug}`} className="st-calc card">
                <span className="st-calc__title">{c.title}</span>
                <span className="st-calc__body">{c.body}</span>
                <span className="st-calc__go" aria-hidden="true">
                  open →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section aria-labelledby="st-cta-h" className="mt-14 card card--sunken">
          <p className="eyebrow">{t.ctaEyebrow}</p>
          <h2 id="st-cta-h" className="font-serif-display mt-2 text-3xl">
            {t.ctaHeading}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-light" style={{ color: "var(--muted)" }}>
            {t.ctaSub}
          </p>
          <div className="mt-6 max-w-md">
            <BookingCTA kind="borrower">{copy.statePage.cta}</BookingCTA>
          </div>
        </section>

        {/* Other states */}
        <nav aria-label={t.otherStatesLabel} className="mt-10">
          <p className="mono-label">{t.otherStatesLabel}</p>
          <ul className="st-others">
            {others.map((s) => (
              <li key={s.slug}>
                <Link href={`/states/${s.slug}`} className="state-chip">
                  {stateChip(s)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Provenance updated={UPDATED} className="mb-16" />
      </div>
    </PageShell>
  );
}
