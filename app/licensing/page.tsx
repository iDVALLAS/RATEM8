import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import EqualHousingLogo from "@/components/legal/EqualHousingLogo";
import { ALL_MLOS, PLATFORM, SPONSORS, stateByCode, isPlaceholder } from "@/lib/config";
import { sponsorFullName, sponsorLicenseLine } from "@/lib/licensing";
import { licensingContent as c, LEGAL_STATUS } from "@/lib/content/legal";
import { copy } from "@/lib/copy";

/**
 * /licensing (L2) — the full license register, every value from
 * lib/config.ts: the platform (no license), each originating company with
 * its NMLS Consumer Access link and state licenses, every loan officer with
 * their NMLS number and per-state licenses, and the state notices.
 * Linked from every footer.
 */
export const metadata: Metadata = { title: c.metaTitle, description: c.metaDescription };

export default function LicensingPage() {
  const s = c.sections;
  const l = c.labels;
  return (
    <LegalPage path={c.path} crumbName={c.crumbName} eyebrow={c.eyebrow} title={c.title} description={c.metaDescription} intro={c.intro} status={LEGAL_STATUS} sections={s}>
      <LegalSection {...s[0]} index={0}>
        <dl className="legal-rows">
          <div>
            <dt>{l.platform}</dt>
            <dd>
              {PLATFORM.tradeName}, a trade name of {PLATFORM.legalName}. {l.platformNote}
            </dd>
          </div>
          {SPONSORS.map((sp) => (
            <div key={sp.idNumber}>
              <dt>{l.company}</dt>
              <dd>
                {sponsorFullName(sp)} · {l.nmls} #{sp.nmls ?? sp.idNumber}
                {sp.address ? <span className="block">{sp.address}</span> : null}
                {sp.phone ? <span className="block">{l.phone}: {sp.phone}</span> : null}
                {sp.nmlsUrl ? (
                  <a className="block" href={sp.nmlsUrl} target="_blank" rel="noopener noreferrer">
                    {l.lookUp}
                  </a>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </LegalSection>

      <LegalSection {...s[1]} index={1}>
        <div className="legal-scroll">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">{l.state}</th>
                <th scope="col">{l.license}</th>
                <th scope="col">{l.regulator}</th>
              </tr>
            </thead>
            <tbody>
              {SPONSORS.flatMap((sp) =>
                Object.entries(sp.stateLicenses ?? {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([code, lic]) => {
                    const st = stateByCode(code);
                    return (
                      <tr key={sp.idNumber + code}>
                        <td data-label={l.state} style={{ whiteSpace: "nowrap" }}>{st?.name ?? code}</td>
                        <td data-label={l.license}>{sponsorLicenseLine(code, lic!)}</td>
                        <td data-label={l.regulator}>
                          {st && !isPlaceholder(st.regulatorUrl) ? (
                            <a href={st.regulatorUrl} target="_blank" rel="noopener noreferrer">
                              {st.regulatorName}
                            </a>
                          ) : (
                            st?.regulatorName
                          )}
                        </td>
                      </tr>
                    );
                  }),
              )}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection {...s[2]} index={2}>
        <dl className="legal-rows">
          {ALL_MLOS.map((m) => (
            <div key={m.id}>
              <dt>{m.name}</dt>
              <dd>
                {m.title} · {l.nmls} #{m.nmls}
                {" · "}
                <a href={m.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer">
                  {l.lookUp}
                </a>
                <ul className="mt-2">
                  {m.licenses.map((x) => (
                    <li key={x.state}>
                      {stateByCode(x.state)?.name ?? x.state}: {x.license}, {l.sponsoredBy} {sponsorFullName(x.sponsor)} ({x.sponsor.idLabel} #{x.sponsor.idNumber})
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </LegalSection>

      <LegalSection {...s[3]} index={3}>
        <ul>
          <li>
            <Link href="/licensing/texas">{l.texas}</Link>
          </li>
        </ul>
        <p>{l.otherStates}</p>
        <p className="flex items-center gap-3">
          <EqualHousingLogo size={30} />
          <span>{copy.footer.equalHousing}</span>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
