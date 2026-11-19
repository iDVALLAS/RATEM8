import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { loanFor, view } from "@/lib/journey/engine";
import { PHASE_LABELS, PHASES, WHO_LABELS } from "@/lib/journey/steps";
import { FlashBox, MloNav } from "../../MloChrome";
import { addDocsAction, datesAction, docStatusAction, findingsAction, lockAction, messageAction, processorAction, requestDocsAction, stepAction } from "./actions";
import { accountStore } from "@/lib/accounts/store";
import { bookOf } from "@/lib/contacts/service";
import "../../mlo.css";
import "./journey.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Loan journey", robots: { index: false, follow: false } };

const DOC_STATUS = { needed: "Needed", requested: "Requested", received: "Received", reviewed: "Reviewed", waived: "Not needed" } as const;
const DATE_LABELS = { leSentOn: "Loan Estimate sent", intentToProceedOn: "They said they intend to proceed", cdSentOn: "Closing Disclosure sent", signingOn: "Signing date", voeOn: "Employment re-verified" } as const;

/** /mlo/pipeline/[id] — one loan's journey: the 30 steps, the federal clocks, the lock decision and the document checklist (D17, D18). */
export default async function LoanJourney({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const [{ id }, { f }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const loan = await loanFor(v.user, id);
  if (!loan) notFound();
  const tenant = listTenants()[0];
  const jv = await view(loan);
  const j = jv.journey;
  const signingDefault = j.dates.signingOn ?? loan.keyDates.closing ?? "";
  const docsBy = (phase: "initial" | "final") => j.docs.filter((d) => d.phase === phase);
  const team = (await accountStore().listUsers()).filter((u) => u.status === "active" && (bookOf(u) === undefined || bookOf(u) === loan.ownerUserId));
  const processor = team.find((u) => u.id === (j.processorUserId ?? loan.ownerUserId));

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow"><Link href="/mlo/pipeline">← Pipeline</Link></p>
        <h1 className="tagline text-4xl">{loan.borrowerName}</h1>
        <MloNav current="pipeline" tenantId={tenant.id} admin={v.admin} signedIn />
        <FlashBox flash={decodeFlash(f)} />

        <section className="mlo-section">
          <p className="mlo-note">#{loan.externalId} · {[loan.purpose, loan.loanType].filter(Boolean).join(" · ")} · in “{loan.milestone}”{loan.contactId ? <> · <Link href={`/mlo/contacts/${loan.contactId}`}>their page</Link></> : null}</p>
          <div className="jr-progress" role="img" aria-label={`${jv.done} of ${jv.total} steps done`}><span style={{ width: `${Math.round((jv.done / jv.total) * 100)}%` }} /></div>
          <form action={processorAction} className="mlo-row-form" style={{ margin: "6px 0" }}>
            <input type="hidden" name="loanId" value={loan.id} />
            <label className="mlo-note" htmlFor="processor">Processor:</label>
            <select id="processor" name="processor" defaultValue={j.processorUserId ?? ""} className="mlo-select">
              <option value="">The loan officer</option>
              {team.filter((u) => u.id !== loan.ownerUserId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Save</button>
            <span className="mlo-note">Processor steps go to {processor?.name ?? "the loan officer"}.</span>
          </form>
          <p className="mlo-note">{jv.done} of {jv.total} steps done{jv.current ? <>. Next: <a href={`#s-${jv.current.key}`}>step {jv.current.key}, {jv.current.title}</a> ({WHO_LABELS[jv.current.who]})</> : ". All done."}</p>
        </section>

        <section className="mlo-section" id="clocks">
          <h2>Clocks</h2>
          {jv.clocks.length ? (
            <ul className="jr-clocks">{jv.clocks.map((c) => <li key={c.key} className={`jr-clock jr-clock--${c.level}`}>{c.text}</li>)}</ul>
          ) : <p className="mlo-note">Nothing to watch right now.</p>}
          <form action={datesAction} className="mlo-grid mlo-grid--2" style={{ marginTop: 10 }}>
            <input type="hidden" name="loanId" value={loan.id} />
            <p className="mlo-note">Application: {jv.applicationOn ?? "not recorded (comes from your loan system's application date)"}</p>
            {(Object.keys(DATE_LABELS) as (keyof typeof DATE_LABELS)[]).map((k) => (
              <label key={k} className="mlo-field"><span>{DATE_LABELS[k]}</span><input type="date" name={k} defaultValue={k === "signingOn" ? signingDefault : j.dates[k] ?? ""} /></label>
            ))}
            <div><button type="submit" className="mlo-btn">Save dates</button></div>
          </form>
        </section>

        {PHASES.map((phase) => (
          <section key={phase} className="mlo-section">
            <h2>{PHASE_LABELS[phase]}</h2>
            <ol className="jr-steps">
              {jv.steps.filter((s) => s.phase === phase).map((s) => {
                const st = s.state;
                const isDone = st?.status === "done";
                return (
                  <li key={s.key} id={`s-${s.key}`} className={`jr-step ${isDone ? "jr-step--done" : st?.status === "na" ? "jr-step--na" : jv.current?.key === s.key ? "jr-step--now" : ""}`}>
                    <div className="jr-step__head">
                      <span className="jr-num">{s.key}</span>
                      <div>
                        <p className="jr-title">{s.title}</p>
                        <p className="mlo-note">{WHO_LABELS[s.who]}{st ? ` · ${st.status === "na" ? "doesn't apply" : st.status === "done" ? `done ${st.at}${st.auto ? " (from your loan system)" : ` by ${st.by}`}` : "reopened"}${st.note ? ` · ${st.note}` : ""}` : ""}</p>
                      </div>
                    </div>
                    <ul className="jr-duties">{s.duties.map((d, i) => <li key={i}>{d}</li>)}</ul>
                    {s.rules?.length ? <details className="jr-rules"><summary>Rules for this step</summary><ul>{s.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></details> : null}
                    <div className="mlo-row-form">
                      {s.key === "13" ? (
                        <form action={lockAction} className="mlo-row-form">
                          <input type="hidden" name="loanId" value={loan.id} />
                          <span className="mlo-note">{j.lock ? `${j.lock.decision === "lock" ? "Locked" : "Floating"} (confirmed by ${j.lock.by})` : "Your call:"}</span>
                          <button type="submit" name="decision" value="lock" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Lock</button>
                          <button type="submit" name="decision" value="float" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Float</button>
                        </form>
                      ) : (
                        <form action={stepAction} className="mlo-row-form">
                          <input type="hidden" name="loanId" value={loan.id} />
                          <input type="hidden" name="key" value={s.key} />
                          {isDone || st?.status === "na" ? (
                            <button type="submit" name="status" value="todo" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Reopen</button>
                          ) : (
                            <>
                              <button type="submit" name="status" value="done" className="mlo-btn" style={{ marginTop: 0 }}>Done</button>
                              <button type="submit" name="status" value="na" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Doesn&apos;t apply</button>
                            </>
                          )}
                        </form>
                      )}
                      {s.message ? (
                        <form action={messageAction}>
                          <input type="hidden" name="loanId" value={loan.id} />
                          <input type="hidden" name="key" value={s.key} />
                          <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} disabled={s.guard === "intent_to_proceed" && !j.dates.intentToProceedOn}>Draft the borrower text</button>
                        </form>
                      ) : null}
                      {s.documents ? <a className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} href="#docs">Documents</a> : null}
                    </div>
                    {s.guard === "intent_to_proceed" && !j.dates.intentToProceedOn ? <p className="mlo-note">Waiting for step 14B: record when they said they intend to proceed (Clocks, above).</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        <section className="mlo-section" id="docs">
          <h2>Documents (from the AUS findings)</h2>
          <p className="mlo-note">Upload the DU or LPA findings: they&apos;re read once to list the documents and then discarded. Only what the findings require goes on the list, and only that goes to the lender. Borrowers upload through your loan system&apos;s secure portal; their text says how many items are waiting and links there, never the document names.</p>
          <form action={findingsAction} className="mlo-grid">
            <input type="hidden" name="loanId" value={loan.id} />
            <label className="mlo-field"><span>Findings PDF</span><input type="file" name="pdf" accept="application/pdf" /></label>
            <label className="mlo-field"><span>Or paste the findings text</span><textarea name="text" rows={3} maxLength={60000} /></label>
            <div><button type="submit" className="mlo-btn">Read the findings</button></div>
          </form>
          {(["initial", "final"] as const).map((phase) => (
            <div key={phase} style={{ marginTop: 14 }}>
              <h3 className="jr-sub">{phase === "initial" ? "To submit (steps 2–4, 15)" : "For final approval (steps 18–20)"}</h3>
              {docsBy(phase).length === 0 ? <p className="mlo-note">None yet.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {docsBy(phase).map((d) => (
                      <tr key={d.id}>
                        <th scope="row">{d.name}<br /><span className="mlo-note">{d.why}</span></th>
                        <td>
                          <form action={docStatusAction} className="mlo-row-form">
                            <input type="hidden" name="loanId" value={loan.id} />
                            <input type="hidden" name="docId" value={d.id} />
                            <select name="status" defaultValue={d.status} className="mlo-select" aria-label={`Status of ${d.name}`}>
                              {(Object.keys(DOC_STATUS) as (keyof typeof DOC_STATUS)[]).map((k) => <option key={k} value={k}>{DOC_STATUS[k]}</option>)}
                            </select>
                            <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Save</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mlo-row-form" style={{ marginTop: 8 }}>
                <form action={requestDocsAction}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <input type="hidden" name="phase" value={phase} />
                  <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={!docsBy(phase).some((d) => d.status === "needed")}>Draft the request to the borrower</button>
                </form>
              </div>
              {docsBy(phase).some((d) => d.status === "needed" || d.status === "requested") ? (
                <details className="jr-rules"><summary>Copy this list into your loan system&apos;s portal</summary><pre className="jr-copy">{docsBy(phase).filter((d) => d.status === "needed" || d.status === "requested").map((d) => `- ${d.name}`).join("\n")}</pre></details>
              ) : null}
              <form action={addDocsAction} className="mlo-grid" style={{ marginTop: 8 }}>
                <input type="hidden" name="loanId" value={loan.id} />
                <input type="hidden" name="phase" value={phase} />
                <label className="mlo-field"><span>Add by hand (one per line)</span><textarea name="lines" rows={2} maxLength={4000} /></label>
                <div><button type="submit" className="mlo-btn mlo-btn--ghost">Add</button></div>
              </form>
            </div>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
