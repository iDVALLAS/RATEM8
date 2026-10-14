import PageShell from "@/components/PageShell";
import Provenance from "@/components/Provenance";
import JsonLd from "@/components/JsonLd";
import { webPageJsonLd } from "@/lib/jsonld";
import type { LegalSectionDef } from "./LegalSection";
import "./legal.css";

/**
 * LegalPage — shared frame for /privacy, /terms, /disclosures.
 *
 *   PageShell (crumbs) → hero (eyebrow, single h1, intro, status pill)
 *   → table of contents (anchor links) → `.prose-m8` sections
 *   → Provenance → WebPage JSON-LD.
 *
 * The TOC renders at the top on every width; it is a compact numbered
 * list on phones and a 2–3 column grid from 640px up.
 */
export const LEGAL_UPDATED = "2026-09-29";

type LegalPageProps = {
  path: string;
  crumbName: string;
  eyebrow: string;
  title: string;
  description: string;
  intro: string;
  status: string;
  sections: readonly LegalSectionDef[];
  children: React.ReactNode;
  /** Rendered after the sections, before Provenance (e.g. a mono note). */
  footer?: React.ReactNode;
};

export default function LegalPage({ path, crumbName, eyebrow, title, description, intro, status, sections, children, footer }: LegalPageProps) {
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: crumbName, path },
      ]}
    >
      <JsonLd data={webPageJsonLd({ path, name: title, description, dateModified: LEGAL_UPDATED })} />

      <header className="legal-hero mx-auto max-w-3xl px-4 sm:px-6">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="legal-title">{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-status">{status}</p>
      </header>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-4">
        <nav className="legal-toc" aria-label="On this page">
          <p className="legal-toc__label">{"// on this page"}</p>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <article className="prose-m8 mx-auto max-w-3xl px-4 sm:px-6 pb-16 sm:pb-24">
        {children}
        {footer}
        <Provenance updated={LEGAL_UPDATED} className="mt-12" />
      </article>
    </PageShell>
  );
}
