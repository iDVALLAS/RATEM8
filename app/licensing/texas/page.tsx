import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import { licensing as lic } from "@/lib/content/licensing";

/**
 * /licensing/texas (C2 / L2) — the Texas Consumer Complaint Notice for
 * mortgage companies, Figure: 7 TAC §56.200(c), verbatim from the current
 * SML form (config/licensing.ts TX_COMPLAINT_NOTICE). Linked from every
 * footer, the homepage included. Public in stealth.
 */

const t = lic.texas;

export const metadata: Metadata = {
  title: t.title,
  description: t.description,
};

export default function TexasNoticePage() {
  return (
    <LegalPage
      path="/licensing/texas"
      crumbName={t.title}
      eyebrow={t.eyebrow}
      title={t.title}
      description={t.description}
      intro={t.intro}
      status={t.status}
      sections={t.sections}
    >
      <LegalSection {...t.sections[0]} index={0}>
        <p className="legal-note">{t.citation}</p>
        <p>
          <strong>{t.notice}</strong>
        </p>
        <p>
          <a href={t.smlUrl} target="_blank" rel="noopener noreferrer">
            {t.smlLink}
          </a>
        </p>
        <p>
          <Link href="/licensing">{t.back}</Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
