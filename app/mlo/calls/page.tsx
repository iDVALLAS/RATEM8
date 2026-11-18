import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { callQueue, CALL_RESULT_LABELS, CALL_RESULTS } from "@/lib/calls/session";
import { formatPhone } from "@/lib/contacts/normalize";
import { ruleFor } from "@/lib/send-gate/rules";
import { usStateName } from "@/lib/us-states";
import { FlashBox, MloNav } from "../MloChrome";
import { BuildButton } from "../scripts/Buttons";
import { buildScriptAction } from "../scripts/actions";
import { logCallAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Call session", robots: { index: false, follow: false } };

/** /mlo/calls — today's calls, one at a time, dialed by hand (D11). */
export default async function Calls({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const q = me ? await callQueue(me) : null;
  const next = q?.ready[0] ?? null;
  const name = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim() || "Someone";

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Call session</h1>
        <MloNav current="calls" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me || !q ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to start a call session.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>{q.ready.length ? `${q.ready.length} to call now` : "Nobody to call right now"}{q.done ? ` · ${q.done} done today` : ""}</h2>
              <p className="mlo-note">One person at a time, from Today. Each call is checked against your contact rules first (permission, do-not-call, today&apos;s limit, quiet hours where they live). You dial; nothing rings on its own and no recorded voicemails are dropped.</p>
            </section>

            {next ? (
              <section className="mlo-section" id="next" style={{ borderColor: "var(--accent)" }}>
                <p className="eyebrow">Next up</p>
                <h2><Link href={`/mlo/contacts/${next.contact.id}`}>{name(next.contact)}</Link></h2>
                <p className="mlo-note">{next.card.title}. {next.card.reason}</p>
                <div className="mlo-row-form">
                  <a className="mlo-btn" style={{ marginTop: 0 }} href={`tel:${next.contact.phone}`}>Call {formatPhone(next.contact.phone)}</a>
                  {next.scriptId ? (
                    <Link className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} href={`/mlo/scripts?id=${next.scriptId}#script`}>Open their script</Link>
                  ) : (
                    <form action={buildScriptAction}>
                      <input type="hidden" name="contactId" value={next.contact.id} />
                      <input type="hidden" name="from" value="scripts" />
                      <input type="hidden" name="goal" value="auto" />
                      <BuildButton label="Build their script" />
                    </form>
                  )}
                </div>
                {ruleFor(next.contact.state).allPartyRecording ? <p className="mlo-note">{usStateName(next.contact.state)} requires everyone&apos;s consent to record. Ask first, or don&apos;t record.</p> : null}
                <form action={logCallAction} className="mlo-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="contactId" value={next.contact.id} />
                  <input type="hidden" name="purpose" value={next.purpose} />
                  <label className="mlo-field"><span>A note (optional; no account numbers or SSNs)</span><input name="note" maxLength={400} /></label>
                  <div className="mlo-row-form">
                    {CALL_RESULTS.map((r) => (
                      <button key={r} type="submit" name="result" value={r} className={r === "reached" || r === "booked" ? "mlo-btn" : "mlo-btn mlo-btn--ghost"} style={{ marginTop: 0 }}>{CALL_RESULT_LABELS[r]}</button>
                    ))}
                  </div>
                  <p className="mlo-note">Logging moves you to the next person. “Asked not to be contacted” and “Wrong number” record a stop for calls and texts.</p>
                </form>
              </section>
            ) : null}

            {q.ready.length > 1 ? (
              <section className="mlo-section">
                <h2>After that</h2>
                <ol className="cc-today">
                  {q.ready.slice(1).map((x) => (
                    <li key={x.contact.id} className="cc-card"><p className="cc-card__title"><Link href={`/mlo/contacts/${x.contact.id}`}>{name(x.contact)}</Link></p><p className="mlo-note">{x.card.title}</p></li>
                  ))}
                </ol>
              </section>
            ) : null}

            {q.blocked.length ? (
              <section className="mlo-section">
                <h2>Not now ({q.blocked.length})</h2>
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {q.blocked.map((x) => (
                      <tr key={x.contact.id}>
                        <th scope="row"><Link href={`/mlo/contacts/${x.contact.id}#permission`}>{name(x.contact)}</Link><br /><span className="mlo-note">{x.card.title}</span></th>
                        <td className="mlo-note">{x.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
