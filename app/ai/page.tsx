import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import JsonLd from "@/components/JsonLd";
import Provenance from "@/components/Provenance";
import BookingCTA from "@/components/BookingCTA";
import { AccentTitle } from "@/components/PrincipleCard";
import { faqJsonLd, webPageJsonLd } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/site";
import { aiContent, aiFaqItems, type AiLink } from "@/lib/content/ai";

/**
 * /ai — plain-language answers for AI assistants and the humans they
 * help. Every word renders from lib/content/ai.ts, which also produces
 * /ai.md, so the HTML and Markdown versions state the same facts.
 * Nothing on this page is hidden from a human reader.
 */

export const metadata: Metadata = {
  title: aiContent.metaTitle,
  description: aiContent.metaDescription,
  alternates: {
    canonical: absoluteUrl("/ai"),
    types: { "text/markdown": absoluteUrl("/ai.md") },
  },
};

function ContentLink({ link }: { link: AiLink }) {
  return link.path.startsWith("/") ? <Link href={link.path}>{link.label}</Link> : <a href={link.path}>{link.label}</a>;
}

export default function AiPage() {
  const { qa, guardrails, principlesSection, machineReadable, toc } = aiContent;

  return (
    <PageShell crumbs={aiContent.crumbs}>
      <JsonLd
        data={[
          faqJsonLd(aiFaqItems()),
          webPageJsonLd({
            path: "/ai",
            name: aiContent.metaTitle,
            description: aiContent.metaDescription,
            dateModified: aiContent.updated,
          }),
        ]}
      />

      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
        <header>
          <p className="eyebrow">{aiContent.eyebrow}</p>
          <h1 className="tagline mt-4 text-4xl sm:text-5xl">{aiContent.heading}</h1>
          <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
            {aiContent.sub}
          </p>
        </header>

        <nav aria-label="On this page" className="mt-8">
          <ol className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)" }}>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="hover:text-[var(--accent)]">
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="prose-m8 mt-6">
          {qa.map((item) => (
            <section key={item.id} id={item.id} aria-labelledby={`${item.id}-h`}>
              <h2 id={`${item.id}-h`}>{item.q}</h2>
              {item.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {item.bullets?.length ? (
                <ul>
                  {item.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {item.id === "handoff" ? (
                <div className="my-6">
                  <BookingCTA kind="borrower" sub="With a licensed loan officer">
                    Book a call
                  </BookingCTA>
                </div>
              ) : null}
              {item.links?.length ? (
                <p className="font-mono text-[12px]">
                  {item.links.map((l, i) => (
                    <span key={l.path}>
                      {i > 0 ? <span aria-hidden="true"> · </span> : null}
                      <ContentLink link={l} />
                    </span>
                  ))}
                </p>
              ) : null}
            </section>
          ))}

          <section id={guardrails.id} aria-labelledby={`${guardrails.id}-h`}>
            <h2 id={`${guardrails.id}-h`}>{guardrails.heading}</h2>
            <p>{guardrails.intro}</p>
            <ol>
              {guardrails.items.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
          </section>

          <section id={principlesSection.id} aria-labelledby={`${principlesSection.id}-h`}>
            <h2 id={`${principlesSection.id}-h`}>
              {principlesSection.heading}{" "}
              <span className="mono-label align-middle">version {principlesSection.version}</span>
            </h2>
            <p>{principlesSection.intro}</p>
            <ol className="mt-6 grid gap-3" style={{ margin: 0, listStyle: "none" }}>
              {principlesSection.items.map((p) => (
                <li key={p.number} className="card" style={{ listStyle: "none" }}>
                  <div className="principle-label">Principle {String(p.number).padStart(2, "0")}</div>
                  <h3 className="font-serif text-xl sm:text-2xl mt-2" style={{ color: "var(--fg)", fontWeight: 600, letterSpacing: "-0.015em" }}>
                    <AccentTitle title={p.title} accent={p.accent} />
                  </h3>
                  {p.body ? (
                    <p className="mt-1 text-sm" style={{ color: "var(--fg-soft)" }}>
                      {p.body}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)", fontWeight: 300 }}>
                    {p.expansion}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section id={machineReadable.id} aria-labelledby={`${machineReadable.id}-h`}>
            <h2 id={`${machineReadable.id}-h`}>{machineReadable.heading}</h2>
            <p>{machineReadable.intro}</p>
            <ul>
              {machineReadable.links.map((l) => (
                <li key={l.path}>
                  <a href={l.path}>
                    <code>{absoluteUrl(l.path)}</code>
                  </a>
                  {l.note ? <> — {l.note}</> : null}
                </li>
              ))}
            </ul>
            <p className="counsel">{machineReadable.disclaimer}</p>
          </section>
        </div>

        <Provenance updated={aiContent.updated} className="mt-14" />
      </article>
    </PageShell>
  );
}
