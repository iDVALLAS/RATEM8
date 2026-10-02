import type { Metadata } from "next";
import dynamic from "next/dynamic";
import PageShell from "@/components/PageShell";
import Reveal from "@/components/motion/Reveal";
import BookingCTA from "@/components/BookingCTA";
import Provenance from "@/components/Provenance";
import JsonLd from "@/components/JsonLd";
import { webPageJsonLd } from "@/lib/jsonld";
import { copy } from "@/lib/copy";
import { JOIN_CRUMB, JOIN_META } from "@/lib/content/join";

export const metadata: Metadata = {
  title: JOIN_META.title,
  description: JOIN_META.description,
};

const UPDATED = "2026-09-29";

// The five-scene animation is client-only and lazy-loaded so the hero
// and the plain-English section ship first.
const JoinScenes = dynamic(() => import("@/components/join/JoinScenes"), {
  loading: () => <div aria-hidden="true" style={{ minHeight: "60vh", background: "var(--color-m8-night)" }} />,
});

/**
 * /join — recruiting page for licensed MLOs.
 *
 * Compliance (SITE_BRIEF §5 rules 3 and 11): licensed MLOs only; no
 * earnings claims, no figures, nothing about compensation beyond the
 * one sentence in copy.join.lookFor.items. No forms; one CTA.
 */
export default function JoinPage() {
  const j = copy.join;
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: JOIN_CRUMB, path: "/join" },
      ]}
    >
      <JsonLd data={webPageJsonLd({ path: "/join", name: JOIN_META.title, description: JOIN_META.description, dateModified: UPDATED })} />

      {/* ─── Hero ─── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24">
        <p className="code-label">{j.eyebrow}</p>
        <Reveal as="h1" text={j.heading} accent={j.accent} underline immediate className="tagline text-4xl sm:text-6xl lg:text-7xl mt-5 max-w-4xl" />
        <p className="mt-6 max-w-2xl text-lg font-light leading-relaxed" style={{ color: "var(--muted)" }}>
          {j.sub}
        </p>
      </section>

      {/* ─── Five scenes ─── */}
      <JoinScenes />

      {/* ─── The AI search channel ─── */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-16 sm:pt-24 join-channel" aria-labelledby="join-channel-heading">
        <p className="code-label">{j.aiChannel.eyebrow}</p>
        <Reveal as="h2" text={j.aiChannel.heading} accent={j.aiChannel.accent} className="tagline text-3xl sm:text-5xl mt-4" />
        <div className="prose-m8 mt-6">
          <p>{j.aiChannel.body}</p>
          <p>{copy.savings.joinLine}</p>
          <p className="mono-label">{j.aiChannel.note}</p>
        </div>
      </section>

      {/* ─── What we look for ─── */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 join-lookfor" aria-labelledby="join-lookfor-heading">
        <p className="code-label">{j.lookFor.eyebrow}</p>
        <h2 id="join-lookfor-heading" className="tagline text-3xl sm:text-5xl mt-4">
          {j.lookFor.heading}
        </h2>
        {/* ROUTING POLICY — to be defined: how borrowers are assigned across MLOs. Public copy stays neutral until then. */}
        <div className="prose-m8 mt-6">
          <ul>
            {j.lookFor.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="mt-12 max-w-md">
          <BookingCTA kind="mlo" sub={j.ctaSub}>
            {j.cta}
          </BookingCTA>
        </div>

        <Provenance updated={UPDATED} />
      </section>
    </PageShell>
  );
}
