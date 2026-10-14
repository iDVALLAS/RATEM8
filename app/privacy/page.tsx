import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import LegalSection from "@/components/legal/LegalSection";
import CounselReview from "@/components/legal/CounselReview";
import { privacyContent as c, privacyNoticeStates, LEGAL_STATUS } from "@/lib/content/legal";

/**
 * /privacy — v1 privacy statement, consistent with what the site does:
 * Calendly bookings, Vercel Analytics in aggregate, a Second Look
 * sample that collects nothing, and feature-flagged upload/chat that
 * are OFF. Every counsel-dependent block sits inside <CounselReview>.
 * Facts (emails, states, retention, flags) come from config via
 * lib/content/legal.ts.
 */

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
};

export default function PrivacyPage() {
  const s = c.sections;
  const noticeStates = privacyNoticeStates();

  return (
    <LegalPage path={c.path} crumbName={c.crumbName} eyebrow={c.eyebrow} title={c.title} description={c.metaDescription} intro={c.intro} status={LEGAL_STATUS} sections={s}>
      {/* 01 Summary */}
      <LegalSection {...s[0]} index={0}>
        <CounselReview note={c.summary.note}>
          <ul>
            {c.summary.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </CounselReview>
      </LegalSection>

      {/* 02 Data we collect */}
      <LegalSection {...s[1]} index={1}>
        <p>{c.collect.lead}</p>
        <dl className="legal-rows">
          {c.collect.items.map((item) => (
            <div key={item.label}>
              <dt>
                {item.label}
                {"status" in item && item.status ? (
                  <span className="mono-label block mt-1" style={{ color: "var(--accent)" }}>
                    {item.status}
                  </span>
                ) : null}
              </dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
        <CounselReview note={c.collect.counselNote}>
          <p>The live-upload and chat items above describe features that are off. They are listed so this statement is already true when they are turned on.</p>
        </CounselReview>
      </LegalSection>

      {/* 03 How we use it */}
      <LegalSection {...s[2]} index={2}>
        <ul>
          {c.use.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <p>
          <strong>{c.use.never}</strong>
        </p>
      </LegalSection>

      {/* 04 Sharing */}
      <LegalSection {...s[3]} index={3}>
        <p>
          <strong>{c.sharing.lead}</strong>
        </p>
        <p>We share data only with:</p>
        <CounselReview note={c.sharing.counselNote}>
          <ul>
            {c.sharing.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p>
            <Link href="/disclosures#licenses">Which entity originates loans in your state</Link>
          </p>
        </CounselReview>
      </LegalSection>

      {/* 05 Vendors */}
      <LegalSection {...s[4]} index={4}>
        <p>{c.vendors.lead}</p>
        <dl className="legal-rows">
          {c.vendors.items.map((v) => (
            <div key={v.name}>
              <dt>{v.name}</dt>
              <dd>{v.role}</dd>
            </div>
          ))}
        </dl>
      </LegalSection>

      {/* 06 Retention */}
      <LegalSection {...s[5]} index={5}>
        <p>{c.retention.lead}</p>
        <CounselReview note={c.retention.counselNote}>
          <dl className="legal-rows">
            {c.retention.items.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </CounselReview>
      </LegalSection>

      {/* 07 Your rights */}
      <LegalSection {...s[6]} index={6}>
        <p>{c.rights.lead}</p>
        <CounselReview note={c.rights.counselNote}>
          <dl className="legal-rows">
            {c.rights.items.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
          <p>
            Email <a href={`mailto:${c.rights.email}`}>{c.rights.email}</a> from the address you want us to look up.
          </p>
        </CounselReview>
      </LegalSection>

      {/* 08 AI disclosure */}
      <LegalSection {...s[7]} index={7}>
        <p>
          <strong>{c.ai.line}</strong>
        </p>
        <p>{c.ai.body}</p>
      </LegalSection>

      {/* 09 Recording */}
      <LegalSection {...s[8]} index={8}>
        <p>{c.recording.body}</p>
        <CounselReview note={c.recording.counselNote}>
          <p>
            {c.recording.twoPartyLead} <strong>{c.recording.twoPartyStates.join(" and ")}</strong>.
          </p>
          <p>{c.recording.twoPartyBody}</p>
        </CounselReview>
      </LegalSection>

      {/* 10 State notices */}
      <LegalSection {...s[9]} index={9}>
        <p>{c.stateNotices.lead}</p>
        {noticeStates.map((st) => {
          const n = c.stateNotices.notices[st.code];
          return (
            <div key={st.code} id={`notice-${st.slug}`} className="legal-state">
              <h3>{st.name}</h3>
              <CounselReview note={n.note}>
                <p>{n.placeholder}</p>
              </CounselReview>
            </div>
          );
        })}
        <div className="legal-state">
          <h3>Federal notice</h3>
          <CounselReview note={c.stateNotices.federalNote}>
            <p>{c.stateNotices.federalPlaceholder}</p>
          </CounselReview>
        </div>
      </LegalSection>

      {/* 11 Children */}
      <LegalSection {...s[10]} index={10}>
        <p>{c.children.body}</p>
      </LegalSection>

      {/* 12 Changes */}
      <LegalSection {...s[11]} index={11}>
        <p>{c.changes.body}</p>
      </LegalSection>

      {/* 13 Contact */}
      <LegalSection {...s[12]} index={12}>
        <dl className="legal-rows">
          <div>
            <dt>{c.contact.privacyLabel}</dt>
            <dd>
              <a href={`mailto:${c.contact.privacyEmail}`}>{c.contact.privacyEmail}</a>
            </dd>
          </div>
          <div>
            <dt>{c.contact.generalLabel}</dt>
            <dd>{c.contact.generalEmail}</dd>
          </div>
          <div>
            <dt>Entity</dt>
            <dd>{c.contact.entity}</dd>
          </div>
        </dl>
        <p>
          Licensing and regulator contacts are on the <Link href="/disclosures">disclosures page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
