/**
 * lib/jsonld.ts — schema.org builders.
 *
 * Only properties we are confident exist on the named schema.org types
 * are emitted. When a property is uncertain, it is left out. Every
 * value is config-driven; nothing here is invented.
 */

import { CONFIG, STATES, ALL_MLOS, isPlaceholder } from "./config";
import { absoluteUrl } from "./site";

type JsonLd = Record<string, unknown>;

export function organizationJsonLd(): JsonLd {
  const out: JsonLd = {
    "@context": "https://schema.org",
    "@type": ["Organization", "FinancialService"],
    name: CONFIG.brandName,
    legalName: CONFIG.entityLegalName,
    url: absoluteUrl("/"),
    slogan: CONFIG.tagline,
    description:
      "AI-powered mortgage rate-shopping brokerage. Loans are originated by licensed Mortgage Loan Originators. LoanM8 does not sell leads.",
    areaServed: STATES.map((s) => ({ "@type": "State", name: s.name })),
    knowsAbout: ["Mortgage", "Loan Estimate", "Refinancing", "Mortgage points"],
  };
  if (!isPlaceholder(CONFIG.entityNmls)) {
    out.identifier = { "@type": "PropertyValue", propertyID: "NMLS", value: CONFIG.entityNmls };
  }
  if (!isPlaceholder(CONFIG.contactEmail)) out.email = CONFIG.contactEmail;
  return out;
}

export function personJsonLd(): JsonLd[] {
  return ALL_MLOS.map((m) => {
    const out: JsonLd = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: m.name,
      jobTitle: m.title,
      worksFor: { "@type": "Organization", name: CONFIG.brandName, url: absoluteUrl("/") },
      identifier: { "@type": "PropertyValue", propertyID: "NMLS", value: m.nmls },
    };
    if (!isPlaceholder(m.nmlsConsumerAccessUrl)) out.sameAs = [m.nmlsConsumerAccessUrl];
    return out;
  });
}

export function faqJsonLd(items: { q: string; a: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}

export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function webPageJsonLd(opts: { path: string; name: string; description: string; dateModified: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    dateModified: opts.dateModified,
    isPartOf: { "@type": "WebSite", name: CONFIG.brandName, url: absoluteUrl("/") },
    publisher: { "@type": "Organization", name: CONFIG.brandName },
  };
}

export function stateServiceJsonLd(slug: string): JsonLd | null {
  const s = STATES.find((x) => x.slug === slug);
  if (!s) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FinancialService",
    name: `${CONFIG.brandName} — ${s.name}`,
    url: absoluteUrl(`/states/${s.slug}`),
    areaServed: { "@type": "State", name: s.name },
    parentOrganization: { "@type": "Organization", name: CONFIG.brandName, url: absoluteUrl("/") },
  };
}
