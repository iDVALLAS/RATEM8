import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import CTAButton from "@/components/CTAButton";
import ExamplePricingLabel from "@/components/ExamplePricingLabel";
import SampleBadge from "@/components/SampleBadge";
import LenderMark from "@/components/LenderMark";
import StateChip from "@/components/StateChip";
import SwipeRow from "@/components/ui/SwipeRow";
import DetailSheet from "@/components/ui/DetailSheet";
import CountUp from "@/components/ui/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import ArrowText from "@/components/ui/ArrowText";
import { STATES } from "@/lib/config";
import { DATA_PALETTE, contrastRatio } from "@/lib/contrast";
import { designContent as d } from "@/lib/content/design";
import type { LenderBrand } from "@/lib/lenders";
import "./design.css";

/**
 * /design — the living style guide (v24). noindex, not in the sitemap,
 * behind the stealth gate like every non-public page. Fictional lender
 * only; no real rates.
 */
export const metadata: Metadata = {
  title: d.metaTitle,
  robots: { index: false, follow: false },
};

const BRAND = [
  ["M8 Green", "#5DCAA5", "--color-m8-green"],
  ["Deep Green", "#1D9E75", "--color-m8-deep"],
  ["Forest", "#04342C", "--color-m8-forest"],
  ["Night", "#050B08", "--color-m8-night"],
  ["Paper", "#FAFAF9", "--color-m8-paper"],
  ["Pine (paper text accent)", "#0F6E56", "--color-m8-pine"],
] as const;

const SAMPLE: LenderBrand = { slug: "sample", name: d.sample.lender, monogram: d.sample.monogram, logoApproved: false, logoFile: null, brandColor: null, tint: 4 };

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="ds-section">
      <h2 className="ds-h2">{title}</h2>
      {note ? <p className="ds-note">{note}</p> : null}
      <div className="ds-body">{children}</div>
    </section>
  );
}

export default function DesignPage() {
  return (
    <PageShell crumbs={[{ name: "Home", path: "/" }, { name: "Design", path: "/design" }]}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
        <p className="code-label">{d.eyebrow}</p>
        <h1 className="tagline text-4xl sm:text-6xl mt-4">{d.heading}</h1>
        <p className="ds-note mt-4 max-w-2xl">{d.sub}</p>

        <Section title={d.sections.brand} note={d.sections.brandNote}>
          <div className="ds-swatches">
            {BRAND.map(([name, hex, token]) => (
              <div key={token} className="ds-swatch">
                <span className="ds-swatch__chip" style={{ background: hex }} />
                <span className="ds-swatch__name">{name}</span>
                <code className="ds-code">{hex}</code>
                <code className="ds-code">{token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title={d.sections.data} note={d.sections.dataNote}>
          <div className="ds-swatches">
            {DATA_PALETTE.map((p) => (
              <div key={p.n} className="ds-swatch">
                <span className="ds-swatch__chip ds-swatch__chip--split" style={{ background: `linear-gradient(90deg, ${p.hue} 50%, ${p.ink} 50%)` }} />
                <span className="ds-swatch__name" style={{ color: `var(--data-${p.n}-text)` }}>
                  {p.name} · --data-{p.n}
                </span>
                <code className="ds-code">
                  {p.hue} · {contrastRatio(p.hue, "#050B08")}:1 on Night
                </code>
                <code className="ds-code">
                  ink {p.ink} · {contrastRatio(p.ink, "#FAFAF9")}:1 on Paper
                </code>
              </div>
            ))}
          </div>
        </Section>

        <Section title={d.sections.type}>
          <p className="tagline text-5xl">Loan intelligence.</p>
          <p className="hm-h2 mt-4">Three steps. No surprises.</p>
          <p className="mt-4 max-w-xl" style={{ color: "var(--fg-soft)" }}>
            Body copy is Geist, light, with generous leading. Labels and data are JetBrains Mono.
          </p>
          <p className="code-label mt-4">{"// mono label"}</p>
          <p className="num ds-figures mt-4">$3,994 · $14,200 · $338,096</p>
        </Section>

        <Section title={d.sections.buttons}>
          <div className="ds-grid ds-grid--buttons">
            <CTAButton href="/design" variant="primary">Primary (magnetic hover)</CTAButton>
            <CTAButton href="/design" variant="secondary">Secondary</CTAButton>
            <CTAButton href="/design" variant="outline" icon="LE" sub="With a sub-label">
              Outline
            </CTAButton>
            <CTAButton href="/design" variant="primary" disabled sub="Booking link coming soon">
              Disabled
            </CTAButton>
          </div>
          <p className="mt-6">
            <a href="#top" className="ds-link">
              <ArrowText text="Every → link animates its arrow →" />
            </a>
          </p>
        </Section>

        <Section title={d.sections.labels}>
          <div className="flex flex-wrap items-center gap-3">
            <ExamplePricingLabel />
            <SampleBadge />
          </div>
        </Section>

        <Section title={d.sections.lenders} note={d.sections.lendersNote}>
          <div className="flex flex-wrap items-center gap-6">
            <LenderMark lender={SAMPLE} size="sm" labelled />
            <LenderMark lender={SAMPLE} size="md" labelled />
            <LenderMark lender={SAMPLE} size="lg" labelled />
            <LenderMark lender={{ ...SAMPLE, logoApproved: true }} size="md" labelled logoSrc="/design/sample-logo.svg" />
            <LenderMark lender={{ ...SAMPLE, logoApproved: true }} size="lg" labelled logoSrc="/design/sample-logo.svg" />
          </div>
        </Section>

        <Section title={d.sections.cards} note={d.sections.cardsNote}>
          <div className="ds-grid" data-reveal="grid">
            {d.sample.designations.map((des, i) => (
              <article key={des} className={`ds-lcard lender-tinted ${i === 0 ? "is-winner" : ""}`} style={{ "--lender-tint": `var(--data-${i + 1})` } as React.CSSProperties}>
                <ExamplePricingLabel />
                <div className="flex items-center gap-2 mt-3">
                  <LenderMark lender={{ ...SAMPLE, tint: (i + 1) as 1 | 2 | 3 }} size="sm" />
                  <span className="font-medium">{d.sample.lender}</span>
                </div>
                <p className="mono-label mt-2">{des}</p>
                <p className="ds-rate num mt-3">{d.sample.rate}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section title={d.sections.states} note={d.sections.statesNote}>
          <div className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <StateChip key={s.slug} state={s}>
                {s.code}
              </StateChip>
            ))}
          </div>
        </Section>

        <Section title={d.sections.mobile} note={d.sections.mobileNote}>
          <SwipeRow label={d.sample.swipe} hint={d.sample.swipe}>
            {d.sample.designations.map((des, i) => (
              <article key={des} className="ds-lcard lender-tinted" style={{ "--lender-tint": `var(--data-${i + 4})` } as React.CSSProperties}>
                <p className="mono-label">{des}</p>
                <p className="ds-rate num mt-2">{d.sample.rate}</p>
                <div className="mt-3">
                  <DetailSheet label={d.sample.detail} title={d.sample.detailTitle}>
                    <ExamplePricingLabel className="mb-3" />
                    <p style={{ color: "var(--fg-soft)" }}>{d.sample.detailBody}</p>
                  </DetailSheet>
                </div>
              </article>
            ))}
          </SwipeRow>
          <div className="ds-sticky-preview mt-6" aria-label={d.sample.sticky}>
            <p className="mono-label mb-2">{d.sample.sticky}</p>
            <div className="sticky-cta" style={{ position: "relative", display: "block" }}>
              <div className="sticky-cta__inner">
                <CTAButton href="/design" variant="primary">
                  Talk to a licensed loan officer
                </CTAButton>
              </div>
            </div>
          </div>
        </Section>

        <Section title={d.sections.motion} note={d.sections.motionNote}>
          <div className="ds-grid">
            <div className="ds-lcard">
              <p className="mono-label">{d.sample.countLabel}</p>
              <p className="ds-rate mt-2">
                <CountUp value={d.sample.countFigure} />
              </p>
            </div>
            <div className="ds-lcard" data-draw="">
              {d.sample.bars.map((b, i) => (
                <div key={b} className="ds-bar-row">
                  <span className="mono-label">{b}</span>
                  <span className="ds-bar">
                    <span className="bar-draw" style={{ width: `${88 - i * 14}%`, background: `var(--data-${i + 1})` }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title={d.sections.loading} note={d.sections.loadingNote}>
          <div className="ds-grid">
            <div role="status" aria-label={d.sample.loading}>
              <SkeletonCard />
            </div>
            <EmptyState title={d.sample.empty} body={d.sample.emptyBody} />
          </div>
        </Section>

        <Section title={d.sections.mesh} note={d.sections.meshNote}>
          <div className="scene scene--forest ds-mesh">
            <p className="hm-h2" style={{ color: "var(--fg)" }}>
              Scene chapter: Forest
            </p>
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
