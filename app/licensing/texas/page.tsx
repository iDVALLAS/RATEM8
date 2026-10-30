import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import { SPONSOR, TEXAS_COMPLAINT_NOTICE, isPlaceholder, stateByCode } from "@/lib/config";
import { sponsorFullName, sponsorLicenseLine } from "@/lib/licensing";
import { texasNoticeContent as c, LEGAL_STATUS } from "@/lib/content/legal";

/**
 * /licensing/texas (L2) — the Texas consumer complaint notice, SML's
 * §56.200(c) website form, verbatim from config (TEXAS_COMPLAINT_NOTICE).
 * A placeholder would render visibly, and check:licensing blocks a
 * production build while one remains.
 */
export const metadata: Metadata = { title: c.metaTitle, description: c.metaDescription };

export default function TexasNoticePage() {
  const s = c.sections;
  const tx = stateByCode("TX");
  const lic = SPONSOR.stateLicenses?.TX;
  const pending = isPlaceholder(TEXAS_COMPLAINT_NOTICE.text);
  return (
    <LegalPage path={c.path} crumbName={c.crumbName} eyebrow={c.eyebrow} title={c.title} description={c.metaDescription} intro={c.intro} status={LEGAL_STATUS} sections={s}>
      <LegalSection {...s[0]} index={0}>
        {pending ? (
          <>
            <p>{c.pending}</p>
            <p>
              <code>{TEXAS_COMPLAINT_NOTICE.text}</code>
            </p>
          </>
        ) : (
          <>
            <p style={{ whiteSpace: "pre-line" }}>{TEXAS_COMPLAINT_NOTICE.text}</p>
            {!isPlaceholder(TEXAS_COMPLAINT_NOTICE.citation) ? <p className="legal-note">{TEXAS_COMPLAINT_NOTICE.citation}</p> : null}
          </>
        )}
        {tx ? (
          <p>
            <a href={tx.regulatorUrl} target="_blank" rel="noopener noreferrer">
              {c.regulatorLink}
            </a>
          </p>
        ) : null}
      </LegalSection>
      <LegalSection {...s[1]} index={1}>
        <p>
          {sponsorFullName()} · NMLS #{SPONSOR.nmls}
          {lic ? <span className="block">{sponsorLicenseLine("TX", lic)}</span> : null}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
