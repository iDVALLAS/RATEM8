import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { scopeOf } from "@/lib/contacts/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { alertsFor, learnPace } from "@/lib/pipeline/guardian";
import { MloNav } from "../MloChrome";
import { myNextSteps } from "@/lib/journey/engine";
import { PIPELINE, SUBS } from "@/lib/content/cc-pages";
import PageHead from "../PageHead";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pipeline", robots: { index: false, follow: false } };

const money = (n: number | null) => (n === null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);

/** /mlo/pipeline — loans from the loan officer's loan system, with the milestone guardian (D6). */
export default async function Pipeline() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const loans = me ? await pipelineStore().list(scopeOf(me)) : [];
  const pace = learnPace(loans);
  const now = new Date();
  const active = loans.filter((l) => !l.closed && !l.dead);
  const mine = me ? await myNextSteps(me, now) : [];
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="pipeline" title="Pipeline" sub={SUBS.pipeline} action={me && loans.length ? <Link className="mlo-btn mlo-btn--ghost" href="/mlo/connections#arive">Your loan system</Link> : undefined} />
        <MloNav current="pipeline" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your loans.</p></section>
        ) : (
          <>
            {mine.length ? (
              <section className="mlo-section">
                <h2>Your next steps ({mine.length})</h2>
                <ol className="cc-today">
                  {mine.map(({ loan, step }) => (
                    <li key={loan.id} className="cc-card"><p className="cc-card__title"><Link href={`/mlo/pipeline/${loan.id}#s-${step.key}`}>{loan.borrowerName}: step {step.key}</Link></p><p className="mlo-note">{step.title}. {step.duties[0]}</p></li>
                  ))}
                </ol>
              </section>
            ) : null}
            <section className="mlo-section">
              <h2>{loans.length === 0 ? PIPELINE.empty : `Active loans (${active.length})`}</h2>
              {loans.length === 0 ? (
                <>
                  <p className="mlo-note">{PIPELINE.emptyLine}</p>
                  <div className="mlo-actions"><Link className="mlo-btn" href="/mlo/connections#arive">{PIPELINE.connect}</Link></div>
                </>
              ) : active.length === 0 ? (
                <p className="mlo-note">No active loans right now.</p>
              ) : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {active.map((l) => {
                      const alerts = alertsFor(l, pace, now);
                      const days = Math.floor((now.getTime() - Date.parse(l.milestoneAt)) / 86_400_000);
                      return (
                        <tr key={l.id}>
                          <th scope="row"><Link href={`/mlo/pipeline/${l.id}`}>{l.borrowerName}</Link><br /><span className="mlo-note">#{l.externalId} · {[l.purpose, l.loanType, money(l.amount)].filter(Boolean).join(" · ")}</span></th>
                          <td>{l.milestone}<br /><span className="mlo-note">{days} day{days === 1 ? "" : "s"} in this stage · <Link href={`/mlo/pipeline/${l.id}`}>journey</Link></span></td>
                          <td className="mlo-note">{[l.keyDates.lockExpires ? `lock ${l.keyDates.lockExpires}` : "", l.keyDates.closing ? `closing ${l.keyDates.closing}` : ""].filter(Boolean).join(" · ")}</td>
                          <td>{alerts.map((a) => <span key={a.kind} className="mlo-pill" style={{ marginRight: 4 }}>{a.kind === "late" ? "Running long" : a.kind === "lock" ? "Lock expiring" : "Closing without CTC"}</span>)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
