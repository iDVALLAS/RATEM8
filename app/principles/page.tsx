import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import JsonLd from "@/components/JsonLd";
import Provenance from "@/components/Provenance";
import PrinciplesManifesto from "@/components/principles/PrinciplesManifesto";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { PRINCIPLES_VERSION } from "@/lib/principles";
import { webPageJsonLd } from "@/lib/jsonld";
import { routeFor } from "@/lib/site";
import "@/components/principles/principles.css";

const UPDATED = "2026-09-29";
const route = routeFor("/principles");

export const metadata: Metadata = {
  title: `${copy.principles.pageHeading} — ${CONFIG.brandName}`,
  description: route?.description ?? copy.principles.pageSub,
  alternates: { canonical: "/principles" },
};

/**
 * /principles — the manifesto. Header, eight full-viewport scenes,
 * version footer, provenance. The markdown mirror is /principles.md.
 */
export default function PrinciplesPage() {
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Principles", path: "/principles" },
      ]}
    >
      <JsonLd
        data={webPageJsonLd({
          path: "/principles",
          name: copy.principles.pageHeading,
          description: route?.description ?? copy.principles.pageSub,
          dateModified: PRINCIPLES_VERSION,
        })}
      />

      <header className="pr-header mx-auto max-w-6xl px-4 sm:px-6">
        <p className="eyebrow">{copy.principles.pageEyebrow}</p>
        <h1 className="tagline mt-3 text-4xl sm:text-6xl">{copy.principles.pageHeading}</h1>
        <p className="pr-header__sub">{copy.principles.pageSub}</p>
      </header>

      <PrinciplesManifesto />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Provenance updated={UPDATED} className="mb-16" />
      </div>
    </PageShell>
  );
}
