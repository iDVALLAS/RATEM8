import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import CounselReview from "@/components/legal/CounselReview";
import { CONFIG, STATES, ALL_MLOS, NOT_A_COMMITMENT, isPlaceholder, stateDisplay, stateByCode, mlosServing, licenseIn } from "@/lib/config";
import { groupBySponsor, buildDisclaimer } from "@/lib/licensing";
import { personJsonLd } from "@/lib/jsonld";
import JsonLd from "@/components/JsonLd";
import { disclosuresContent as c, LEGAL_STATUS } from "@/lib/content/legal";

/**
 * /disclosures — the compliance hub. NMLS identifiers, per-state
 * licenses and regulators, Equal Housing Lender, the AI disclosure, the
 * locked "not a commitment to lend" sentence, the generated disclaimer,
 * complaint routes, and the trade-name statement. Every fact renders
 * from lib/config.ts; bracketed values are shown as-is so nothing
 * looks final before it is.
 */

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
};

/** A config value, or the placeholder shown in mono so it reads as unfilled. */
function Fact({ value }: { value: string }) {
  return isPlaceholder(value) ? <code>{value}</code> : <>{value}</>;
}

function RegulatorLink({ name, url }: { name: string; url: string }) {
  if (isPlaceholder(url)) return <Fact value={name} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <Fact value={name} />
    </a>
  );
}

export default function DisclosuresPage() {
  const s = c.sections;
  const sponsorGroups = groupBySponsor();
  const disclaimer = buildDisclaimer();

  return (
    <LegalPage
      path={c.path}
      crumbName={c.crumbName}
      eyebrow={c.eyebrow}
      title={c.title}
      description={c.metaDescription}
      intro={c.intro}
      status={LEGAL_STATUS}
      sections={s}
      footer={<p className="legal-note">{c.placeholderNote}</p>}
    >
      {/* The licensing register: every MLO by name with their NMLS number (v14 keeps it here). */}
      <JsonLd data={personJsonLd()} />
      {/* 01 NMLS */}
      <LegalSection {...s[0]} index={0}>
        <p>{c.nmls.lead}</p>
        <dl className="legal-rows">
          <div>
            <dt>{c.nmls.entityLabel}</dt>
            <dd>
              {CONFIG.entityTradeName}, a trade name of {CONFIG.entityLegalName} · NMLS #<Fact value={CONFIG.entityNmls} />
            </dd>
          </div>
          {ALL_MLOS.map((m) => (
            <div key={m.nmls}>
              <dt>{m.name}</dt>
              <dd>
                {m.title} · NMLS #{m.nmls} · {c.nmls.licensedIn} {m.licenses.map((l) => stateByCode(l.state)?.name ?? l.state).join(", ")}
                {isPlaceholder(m.nmlsConsumerAccessUrl) ? (
                  <span className="mono-label block mt-1">{c.nmls.consumerAccessPending}</span>
                ) : (
                  <>
                    {" · "}
                    <a href={m.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer">
                      {c.nmls.consumerAccessLabel}
                    </a>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </LegalSection>

      {/* 02 Licenses by state */}
      <LegalSection {...s[1]} index={1}>
        <p>{c.licenses.lead}</p>
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">{c.licenses.columns.state}</th>
              <th scope="col">{c.licenses.columns.serviceArea}</th>
              <th scope="col">{c.licenses.columns.entityLicense}</th>
              <th scope="col">{c.licenses.columns.mloLicense}</th>
              <th scope="col">{c.licenses.columns.regulator}</th>
              <th scope="col">{c.licenses.columns.sponsor}</th>
            </tr>
          </thead>
          <tbody>
            {STATES.map((st) => (
              <tr key={st.slug}>
                <td data-label={c.licenses.columns.state}>
                  <Link href={`/states/${st.slug}`}>{st.name}</Link>
                </td>
                <td data-label={c.licenses.columns.serviceArea}>{st.serviceArea}</td>
                <td data-label={c.licenses.columns.entityLicense}>
                  <Fact value={st.entityLicense} />
                </td>
                <td data-label={c.licenses.columns.mloLicense}>
                  {mlosServing(st.code).map((m) => (
                    <span key={m.id} className="block">
                      {m.name}: <Fact value={licenseIn(m, st.code)?.license ?? ""} />
                    </span>
                  ))}
                </td>
                <td data-label={c.licenses.columns.regulator}>
                  <RegulatorLink name={st.regulatorName} url={st.regulatorUrl} />
                </td>
                <td data-label={c.licenses.columns.sponsor}>
                  {st.sponsors.map((sp) => (
                    <span key={sp.name + sp.idNumber} className="block">
                      {sp.name} ({sp.idLabel} #{sp.idNumber})
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>{c.licenses.sponsorLead}</h3>
        <ul>
          {sponsorGroups.map((g) => (
            <li key={`${g.sponsor.name}-${g.sponsor.idNumber}`}>
              Loans in {g.states.map((x) => x.fullName).join(", ")} are originated through {g.sponsor.name} ({g.sponsor.idLabel} #{g.sponsor.idNumber}).
            </li>
          ))}
        </ul>

        <h3>{c.licenses.disclosureLead}</h3>
        {STATES.map((st) => (
          <div key={st.slug} className="legal-state" id={`disclosure-${st.slug}`}>
            <h3>{stateDisplay(st)}</h3>
            {isPlaceholder(st.requiredDisclosure) ? (
              <p className="counsel">{st.requiredDisclosure}</p>
            ) : (
              <p>{st.requiredDisclosure}</p>
            )}
          </div>
        ))}
      </LegalSection>

      {/* 03 Equal Housing Lender */}
      <LegalSection {...s[2]} index={2}>
        <p className="flex items-center gap-3" style={{ color: "var(--fg)" }}>
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M3 11 12 3l9 8" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
            <path d="M8 13h8M8 15.5h8" strokeWidth="1.2" />
          </svg>
          <strong>{c.equalHousing.label}</strong>
          <span className="sr-only">{c.equalHousing.srLabel}</span>
        </p>
        <CounselReview note={c.equalHousing.counselNote}>
          <p>{c.equalHousing.body}</p>
        </CounselReview>
      </LegalSection>

      {/* 04 AI disclosure */}
      <LegalSection {...s[3]} index={3}>
        <p>
          <strong>{c.ai.line}</strong> {c.ai.verifies}
        </p>
        <p>{c.ai.recording}</p>
        <p>{c.ai.aiLine}</p>
      </LegalSection>

      {/* 05 Not a commitment to lend */}
      <LegalSection {...s[4]} index={4}>
        <p>
          <strong>{NOT_A_COMMITMENT}</strong>
        </p>
      </LegalSection>

      {/* 06 Full disclaimer */}
      <LegalSection {...s[5]} index={5}>
        <CounselReview note={c.disclaimer.counselNote}>
          <p>{disclaimer}</p>
        </CounselReview>
      </LegalSection>

      {/* 07 Complaints and regulators */}
      <LegalSection {...s[6]} index={6}>
        <p>{c.complaints.lead}</p>
        <dl className="legal-rows">
          {STATES.map((st) => (
            <div key={st.slug}>
              <dt>{st.name}</dt>
              <dd>
                <RegulatorLink name={st.regulatorName} url={st.regulatorUrl} />
                {isPlaceholder(st.regulatorUrl) ? null : (
                  <span className="mono-label block mt-1">{st.regulatorUrl}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="counsel">{c.complaints.placeholderNote}</p>
        <CounselReview note={c.complaints.counselNote}>
          <p>
            Contact us first if you like: <Fact value={CONFIG.contactEmail} />.
          </p>
        </CounselReview>
      </LegalSection>

      {/* 08 Trade name */}
      <LegalSection {...s[7]} index={7}>
        <CounselReview note={c.tradeName.counselNote}>
          <p>{c.tradeName.body}</p>
        </CounselReview>
      </LegalSection>
    </LegalPage>
  );
}
