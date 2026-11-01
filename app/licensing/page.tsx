import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import { CONFIG, ALL_MLOS, stateByCode } from "@/lib/config";
import { SPONSOR, SPONSOR_DISPLAY_NAME } from "@/config/licensing";
import { licensing as lic, LICENSE_ORDER } from "@/lib/content/licensing";

/**
 * /licensing (C2 / L2) — every license, from config/licensing.ts: the
 * originating company and its NMLS Consumer Access record, each state
 * license with its regulator, the loan officers and the states they serve,
 * and the state notices. Linked from every footer. Public in stealth.
 */

const t = lic.page;

export const metadata: Metadata = {
  title: `${t.title} — LoanM8`,
  description: t.description,
};

export default function LicensingPage() {
  return (
    <LegalPage
      path="/licensing"
      crumbName={t.title}
      eyebrow={t.eyebrow}
      title={t.heading}
      description={t.description}
      intro={t.lead}
      status={t.status}
      sections={t.sections}
    >
      <LegalSection {...t.sections[0]} index={0}>
        <dl className="legal-rows">
          <div>
            <dt>{t.sponsorRows.name}</dt>
            <dd>{SPONSOR_DISPLAY_NAME}</dd>
          </div>
          <div>
            <dt>{t.sponsorRows.nmls}</dt>
            <dd>
              NMLS #{SPONSOR.nmls} ·{" "}
              <a href={SPONSOR.nmlsUrl} target="_blank" rel="noopener noreferrer">
                {t.lookup}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t.sponsorRows.address}</dt>
            <dd>{SPONSOR.address}</dd>
          </div>
          <div>
            <dt>{t.sponsorRows.phone}</dt>
            <dd>
              <a href={`tel:+1${SPONSOR.phone.replace(/\D/g, "")}`}>{SPONSOR.phone}</a>
            </dd>
          </div>
        </dl>
        <p>{lic.tradeName}</p>
      </LegalSection>

      <LegalSection {...t.sections[1]} index={1}>
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">{t.columns.state}</th>
              <th scope="col">{t.columns.license}</th>
              <th scope="col">{t.columns.number}</th>
              <th scope="col">{t.columns.regulator}</th>
            </tr>
          </thead>
          <tbody>
            {LICENSE_ORDER.map((code) => {
              const l = SPONSOR.stateLicenses[code];
              const st = stateByCode(code);
              return (
                <tr key={code}>
                  <td data-label={t.columns.state}>{st ? <Link href={`/states/${st.slug}`}>{st.name}</Link> : code}</td>
                  <td data-label={t.columns.license}>{l.type}</td>
                  <td data-label={t.columns.number}>{l.id}</td>
                  <td data-label={t.columns.regulator}>{l.regulator}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </LegalSection>

      <LegalSection {...t.sections[2]} index={2}>
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">{t.mloColumns.name}</th>
              <th scope="col">{t.mloColumns.nmls}</th>
              <th scope="col">{t.mloColumns.states}</th>
              <th scope="col">{t.mloColumns.lookup}</th>
            </tr>
          </thead>
          <tbody>
            {ALL_MLOS.map((m) => (
              <tr key={m.id}>
                <td data-label={t.mloColumns.name}>{m.name}</td>
                <td data-label={t.mloColumns.nmls}>NMLS #{m.nmls}</td>
                <td data-label={t.mloColumns.states}>
                  {m.licenses.map((l) => (
                    <span key={l.state} className="block">
                      {stateByCode(l.state)?.name ?? l.state}: {l.license}
                    </span>
                  ))}
                </td>
                <td data-label={t.mloColumns.lookup}>
                  <a href={m.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer">
                    {lic.consumerAccess}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{lic.loanOfficers}</p>
      </LegalSection>

      <LegalSection {...t.sections[3]} index={3}>
        <p>
          <Link href="/licensing/texas">{t.texasLink}</Link>
        </p>
        <p>{lic.licenses}</p>
        <p>{lic.equalHousing}</p>
        <p>
          <Link href="/disclosures">{t.disclosuresLink}</Link>
        </p>
        <p className="legal-note">{`${CONFIG.entityTradeName} · ${CONFIG.entityLegalName}`}</p>
      </LegalSection>
    </LegalPage>
  );
}
