import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { mloContent } from "@/lib/content/mlo";
import { listTenants } from "@/lib/pricing/tenants";
import { ROLE_LABELS } from "@/lib/accounts/auth";
import { mloById } from "@/lib/config";
import { requireViewer } from "@/lib/mlo/page-auth";
import { MloNav } from "./MloChrome";
import { todayFor } from "@/lib/today/facts";
import { contactStore } from "@/lib/contacts/store";
import { formatPhone } from "@/lib/contacts/normalize";
import { telHref } from "@/lib/call-hours";
import "./mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Command Center", robots: { index: false, follow: false } };

/** /mlo — Command Center home (D1). Admins see the admin areas; everyone sees their account. */
export default async function CommandCenterHome() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const mlo = v.user?.mloId ? mloById(v.user.mloId) : null;
  const today = v.user ? await todayFor(v.user) : null;
  const phones = today ? await Promise.all(today.cards.map((c) => contactStore().get(c.contactId).then((x) => x?.phone ?? null))) : [];
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">{v.user ? `Hi, ${v.user.name.split(" ")[0]}` : mloContent.title}</h1>
        <MloNav current="home" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        <section className="mlo-section">
          <h2>Your account</h2>
          {v.user ? (
            <p className="mlo-note">
              {v.user.email} · <span className="mlo-pill">{ROLE_LABELS[v.user.role]}</span>
              {mlo ? ` · loan officer record: ${mlo.name}, NMLS #${mlo.nmls}` : ""}
            </p>
          ) : (
            <p className="mlo-note">
              You&apos;re on the shared admin login. <Link href="/sign-in">Sign in with your email</Link> to use your own account and manage the team.
            </p>
          )}
        </section>
        {today ? (
          <section className="mlo-section">
            <h2>Today</h2>
            {today.people === 0 ? (
              <p className="mlo-note">
                Nothing yet. <Link href="/mlo/contacts/import">Import your contacts</Link> and Today will show who to reach out to, and why.
              </p>
            ) : today.cards.length === 0 ? (
              <p className="mlo-note">You&apos;re caught up: no replies waiting and nothing time-sensitive across {today.people.toLocaleString("en-US")} people.</p>
            ) : (
              <ol className="cc-today">
                {today.cards.map((card, i) => {
                  const tel = telHref(phones[i] ?? undefined);
                  const href = `/mlo/contacts/${card.contactId}`;
                  return (
                    <li key={`${card.contactId}-${card.kind}-${i}`} className={`cc-card cc-card--${card.kind}`}>
                      <p className="cc-card__title">{card.title}</p>
                      <p className="mlo-note">{card.reason}</p>
                      <div className="mlo-row-form">
                        {card.next === "reply" || card.next === "text" ? <Link className="mlo-btn" href={`${href}#conversation`}>{card.next === "reply" ? "Reply" : "Text"}</Link> : null}
                        {card.next === "call" && tel ? <a className="mlo-btn" href={tel}>Call {formatPhone(phones[i])}</a> : null}
                        {card.next === "record_permission" ? <Link className="mlo-btn" href={`${href}#permission`}>Record what they said</Link> : null}
                        {card.loanId ? <Link className="mlo-btn mlo-btn--ghost" href={`/mlo/pipeline/${card.loanId}${card.kind === "journey" ? "#clocks" : ""}`}>Open the journey</Link> : null}
                        {card.contactId ? <Link className="mlo-btn mlo-btn--ghost" href={href}>Open</Link> : card.loanId ? null : <Link className="mlo-btn mlo-btn--ghost" href="/mlo/pipeline">Open pipeline</Link>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {today.ref ? <p className="mlo-note" style={{ marginTop: 8 }}>Refinance comparisons use today&apos;s priced example ({today.ref.rate}%, {today.ref.label}), for your eyes only.</p> : null}
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
