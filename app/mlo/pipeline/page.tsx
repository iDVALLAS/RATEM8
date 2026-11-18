import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/components/PageShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { scopeOf } from "@/lib/contacts/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { alertsFor, learnPace } from "@/lib/pipeline/guardian";
import { MloNav } from "../MloChrome";
import KeyMaker from "./KeyMaker";
import { deleteKeyAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pipeline", robots: { index: false, follow: false } };

const money = (n: number | null) => (n === null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);

/** /mlo/pipeline — loans from the loan officer's loan system, with the milestone guardian (D6). */
export default async function Pipeline() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const h = await headers();
  const endpoint = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/pipeline/inbound`;
  const me = v.user;
  const loans = me ? await pipelineStore().list(scopeOf(me)) : [];
  const pace = learnPace(loans);
  const now = new Date();
  const active = loans.filter((l) => !l.closed && !l.dead);
  const keys = me ? await pipelineStore().keys(me.id) : [];
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Pipeline</h1>
        <MloNav current="pipeline" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your loans.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>Active loans ({active.length})</h2>
              {active.length === 0 ? (
                <p className="mlo-note">No loans yet. Connect your loan system below and new updates will appear here.</p>
              ) : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {active.map((l) => {
                      const alerts = alertsFor(l, pace, now);
                      const days = Math.floor((now.getTime() - Date.parse(l.milestoneAt)) / 86_400_000);
                      return (
                        <tr key={l.id}>
                          <th scope="row">{l.contactId ? <Link href={`/mlo/contacts/${l.contactId}`}>{l.borrowerName}</Link> : l.borrowerName}<br /><span className="mlo-note">#{l.externalId} · {[l.purpose, l.loanType, money(l.amount)].filter(Boolean).join(" · ")}</span></th>
                          <td>{l.milestone}<br /><span className="mlo-note">{days} day{days === 1 ? "" : "s"} in this stage</span></td>
                          <td className="mlo-note">{[l.keyDates.lockExpires ? `lock ${l.keyDates.lockExpires}` : "", l.keyDates.closing ? `closing ${l.keyDates.closing}` : ""].filter(Boolean).join(" · ")}</td>
                          <td>{alerts.map((a) => <span key={a.kind} className="mlo-pill" style={{ marginRight: 4 }}>{a.kind === "late" ? "Running long" : a.kind === "lock" ? "Lock expiring" : "Closing without CTC"}</span>)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
            <section className="mlo-section">
              <h2>Connect your loan system</h2>
              <p className="mlo-note">
                <strong>ARIVE:</strong> in Zapier, use the ARIVE trigger “Loan Status Updated in ARIVE” (and “New Loan”), then a “Webhooks by Zapier” POST action to the address below, with your key as the X-CC-Key header and these fields: loan number, borrower first name, last name, email and phone, loan status, loan purpose, loan type, loan amount, interest rate, application date, lock expiration date, appraisal date, clear to close date, closing date, buyer&apos;s agent name. ARIVE&apos;s own field names work.
              </p>
              <p className="mlo-note">Loans come in as your own clients; when a loan closes, the borrower becomes a past client with the loan&apos;s date, amount and rate. Nothing is ever sent to anyone automatically.</p>
              <KeyMaker endpoint={endpoint} />
              {keys.length ? (
                <table className="mlo-table mlo-table--plain" style={{ marginTop: 12 }}>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k.hash}>
                        <th scope="row">{k.label}</th>
                        <td className="mlo-note">made {new Date(k.createdAt).toLocaleDateString("en-US")}</td>
                        <td>
                          <form action={deleteKeyAction}><input type="hidden" name="hash" value={k.hash} /><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Turn off</button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
