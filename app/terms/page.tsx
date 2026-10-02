import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import CounselReview from "@/components/legal/CounselReview";
import { termsContent as c, LEGAL_STATUS } from "@/lib/content/legal";

/**
 * /terms — a skeleton. Placeholder headers with draft language, each
 * wrapped in <CounselReview> with a note on what counsel must decide.
 * Facts (entity names, states, emails, calculator disclaimer) come
 * from config via lib/content/legal.ts.
 */

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
};

export default function TermsPage() {
  return (
    <LegalPage path={c.path} crumbName={c.crumbName} eyebrow={c.eyebrow} title={c.title} description={c.metaDescription} intro={c.intro} status={LEGAL_STATUS} sections={c.sections}>
      {c.sections.map((sec, i) => (
        <LegalSection key={sec.id} id={sec.id} title={sec.title} index={i}>
          <CounselReview note={sec.note}>
            {sec.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {sec.link ? (
              <p>
                <Link href={sec.link.href}>{sec.link.label}</Link>
              </p>
            ) : null}
          </CounselReview>
        </LegalSection>
      ))}
    </LegalPage>
  );
}
