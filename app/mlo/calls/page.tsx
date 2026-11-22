import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { callQueue, CALL_RESULT_LABELS, CALL_RESULTS, LIST_CALLS_MAX, listCallQueue } from "@/lib/calls/session";
import { isEmptyRule, ruleFromParams, ruleQuery } from "@/lib/contacts/filter";
import { listById, listsFor } from "@/lib/contacts/lists";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { formatPhone } from "@/lib/contacts/normalize";
import { areaCodeState, ruleForStates } from "@/lib/send-gate/rules";
import { usStateName } from "@/lib/us-states";
import { FlashBox, MloNav } from "../MloChrome";
import { BuildButton } from "../scripts/Buttons";
import { buildScriptAction } from "../scripts/actions";
import { logCallAction, sendToDialerAction, setStateAction } from "./actions";
import { blockerOf, fixHref } from "@/lib/calls/blockers";
import { CALL_FIX, SUBS } from "@/lib/content/cc-pages";
import { US_STATES } from "@/lib/us-states";
import PageHead from "../PageHead";
import { hookStore } from "@/lib/zapier/service";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Call session", robots: { index: false, follow: false } };

/** /mlo/calls — today's calls, one at a time, dialed by hand (D11). */
export default async function Calls({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const f = sp.f;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  // D78: a session from a saved list (?list=<id>) or from the Contacts page's filters (?from=filter&…).
  const saved = me && sp.list ? await listById(me, sp.list) : null;
  const filtered = !saved && sp.from === "filter" ? ruleFromParams(sp) : null;
  const fromList = saved ? { rule: saved.rule, label: lc.callFrom(saved.name), back: `list=${encodeURIComponent(saved.id)}` } : filtered && !isEmptyRule(filtered) ? { rule: filtered, label: lc.callFromFilter, back: `from=filter&${ruleQuery(filtered)}` } : null;
  const q = me ? (fromList ? await listCallQueue(me, fromList.rule, fromList.label) : await callQueue(me)) : null;
  const lists = me ? await listsFor(me) : [];
  const back = fromList?.back ?? "";
  const listTotal = q && "total" in q ? Number((q as { total: number }).total) : 0;
  const next = q?.ready[0] ?? null;
  const name = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim() || "Someone";

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="calls" title="Call session" sub={SUBS.calls} how={<p className="mlo-note">One person at a time, from Today. Each call is checked against your contact rules first (permission, do-not-call, today&apos;s limit, quiet hours where they live). You dial; nothing rings on its own and no recorded voicemails are dropped.</p>} />
        <MloNav current="calls" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me || !q ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to start a call session.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              {fromList ? <p className="mlo-note"><strong>{fromList.label}</strong> · <Link href="/mlo/calls">{lc.callBack}</Link>{listTotal > LIST_CALLS_MAX ? <> · {lc.callCapped(LIST_CALLS_MAX)}</> : null}</p> : null}
              <h2>{q.ready.length ? `${q.ready.length} to call now` : "Nobody to call right now"}{q.done ? ` · ${q.done} done today` : ""}</h2>
              <form method="get" action="/mlo/calls" className="mlo-row-form">
                <label className="mlo-field"><span>{lc.callPick}</span>
                  <select name="list" className="mlo-select" defaultValue={saved?.id ?? ""} required>
                    <option value="" disabled>{lc.callPick}</option>
                    {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <button type="submit" className="mlo-btn mlo-btn--ghost">{lc.callStart}</button>
              </form>
              {q.ready.length && !fromList ? (
                (await hookStore().list(me.id).catch(() => [])).some((h) => h.event === "call_list") ? (
                  <form action={sendToDialerAction} className="mlo-row-form" style={{ marginTop: 8 }}>
                    <button type="submit" className="mlo-btn mlo-btn--ghost">Send this list to my dialer</button>
                    <span className="mlo-note">Through your Zapier hook. Only the people above who can be called now.</span>
                  </form>
                ) : (
                  <p className="mlo-note">Use a power dialer? <Link href="/mlo/connections#zapier">Connect it through Zapier</Link> and send this list to it.</p>
                )
              ) : null}
            </section>

            {next ? (
              <section className="mlo-section" id="next" style={{ borderColor: "var(--accent)" }}>
                <p className="eyebrow">Next up</p>
                <h2><Link href={`/mlo/contacts/${next.contact.id}`}>{name(next.contact)}</Link></h2>
                <p className="mlo-note">{next.card.title}. {next.card.reason}</p>
                <div className="mlo-row-form">
                  <a className="mlo-btn" href={`tel:${next.contact.phone}`}>Call {formatPhone(next.contact.phone)}</a>
                  {next.scriptId ? (
                    <Link className="mlo-btn mlo-btn--ghost" href={`/mlo/scripts?id=${next.scriptId}#script`}>Open their script</Link>
                  ) : (
                    <form action={buildScriptAction}>
                      <input type="hidden" name="contactId" value={next.contact.id} />
                      <input type="hidden" name="from" value="scripts" />
                      <input type="hidden" name="goal" value="auto" />
                      <BuildButton label="Build their script" />
                    </form>
                  )}
                </div>
                {ruleForStates([next.contact.state, areaCodeState(next.contact.phone)]).allPartyRecording ? <p className="mlo-note">{usStateName(next.contact.state)} requires everyone&apos;s consent to record. Ask first, or don&apos;t record.</p> : null}
                {ruleForStates([next.contact.state, areaCodeState(next.contact.phone)]).opening ? <p className="mlo-note">{ruleForStates([next.contact.state, areaCodeState(next.contact.phone)]).opening}</p> : null}
                <form action={logCallAction.bind(null, "reached", back)} className="mlo-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="contactId" value={next.contact.id} />
                  <input type="hidden" name="purpose" value={next.purpose} />
                  <label className="mlo-field"><span>A note (optional; no account numbers or SSNs)</span><input name="note" maxLength={400} /></label>
                  <div className="mlo-row-form">
                    {CALL_RESULTS.map((r) => (
                      <button key={r} type="submit" formAction={logCallAction.bind(null, r, back)} className={r === "reached" || r === "booked" ? "mlo-btn" : "mlo-btn mlo-btn--ghost"}>{CALL_RESULT_LABELS[r]}</button>
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
              <section className="mlo-section" id="blocked">
                <h2>Not now ({q.blocked.length})</h2>
                <ul className="cc-blocked">
                  {q.blocked.map((x) => {
                    const kind = blockerOf(x.reason);
                    const fix = CALL_FIX[kind];
                    const href = fixHref(kind, x.contact.id);
                    return (
                      <li key={x.contact.id} className="cc-blocked__row">
                        <div className="cc-blocked__who">
                          <Link href={`/mlo/contacts/${x.contact.id}#permission`}>{name(x.contact)}</Link>
                          <span className="mlo-note">{x.card.title}</span>
                        </div>
                        <div className="cc-blocked__why">
                          <span className="mlo-pill mlo-pill--off">{fix.chip}</span>
                          <span className="mlo-note">{x.reason}</span>
                        </div>
                        {kind === "state" ? (
                          <form action={setStateAction.bind(null, x.contact.id, back)} className="mlo-row-form cc-blocked__fix">
                            <select name="state" className="mlo-select" aria-label={`${CALL_FIX.pickState}: ${name(x.contact)}`} required defaultValue="">
                              <option value="" disabled>{CALL_FIX.pickState}</option>
                              {US_STATES.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
                            </select>
                            <button type="submit" className="mlo-btn mlo-btn--ghost">{fix.label}</button>
                          </form>
                        ) : href && fix.label ? (
                          <div className="cc-blocked__fix"><Link className="mlo-btn mlo-btn--ghost" href={href}>{fix.label}</Link></div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
