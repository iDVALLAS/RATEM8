import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { conciergeStore } from "@/lib/concierge/store";
import { contactStore } from "@/lib/contacts/store";
import { FlashBox, MloNav } from "../MloChrome";
import Ask from "./Ask";
import { segmentLabel } from "@/lib/messaging/segments";
import { signature } from "@/lib/messaging/service";
import Tell from "./Tell";
import { emailOn, emailReadyFor } from "@/lib/messaging/email";
import { allowanceFor } from "@/lib/ai/meter";
import { approveAction, approveEmailAction, dismissAction, forgetFromDeskAction, keepAction, settingsAction, sweepAction, taskDoneAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Concierge", robots: { index: false, follow: false } };

/** /mlo/concierge — the loan officer's AI Concierge: settings, drafts to approve, reminders, and questions (D8). */
export default async function Concierge({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const store = conciergeStore();
  const [s, drafts, openTasks, toKeep] = me ? await Promise.all([store.settings(me.id), store.proposals(me.id, "pending"), store.tasks(me.id), store.pendingMemory(me.id, new Date().toISOString())]) : [null, [], [], []];
  // D8.1: "reply personally" first.
  const tasks = [...openTasks.filter((t) => t.lane === "personal"), ...openTasks.filter((t) => t.lane !== "personal")];
  const people = await Promise.all([...new Set([...drafts.map((d) => d.contactId), ...tasks.map((t) => t.contactId), ...toKeep.map((m) => m.contactId)])].map((id) => contactStore().get(id)));
  const sig = me ? signature(me) : "";
  const emailReady = me ? (await emailReadyFor(me)).ready : emailOn();
  const ai = me ? await allowanceFor(me.id) : null;
  const nameOf = (id: string) => {
    const c = people.find((p) => p?.id === id);
    return c ? `${c.firstName} ${c.lastName}`.trim() || c.email || "Someone" : "Someone";
  };
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Concierge</h1>
        <p className="mlo-note">Your Concierge now works with a full team: a Business Finder, Pipeline, Partner, Coach and Compliance. <Link href="/mlo/agents">Open your team</Link>.</p>
        <MloNav current="concierge" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {ai?.over ? <div className="mlo-flash mlo-flash--err" role="status">This month&apos;s AI allowance is used, so the Concierge drafts from templates until {ai.resetsOn}. <Link href="/mlo/network#ai">See your usage</Link>.</div> : null}
        {!me || !s ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to use your Concierge.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>Your Concierge</h2>
              <p className="mlo-note">
                An AI that works your book with your permission: it reads replies, notices what clients need, drafts texts in your voice and sets you reminders. It never sends anything itself: you approve every text, and each one still goes through your contact rules. It never quotes rates or makes promises, and it never notes family, marital status, religion, health, age, race, national origin or benefits income.
              </p>
              <form action={settingsAction} className="mlo-grid">
                <label className="mlo-check"><input type="checkbox" name="enabled" defaultChecked={s.enabled} /> <span>Turn the Concierge on (it looks at your book each morning, and whenever you press “Run now”)</span></label>
                <label className="mlo-check"><input type="checkbox" name="memory" defaultChecked={s.memory} /> <span>Remember needs and plans clients mention in their own words (you can delete any note)</span></label>
                <label className="mlo-check"><input type="checkbox" name="tasks" defaultChecked={s.tasks} /> <span>Set reminders for me</span></label>
                <label className="mlo-check"><input type="checkbox" name="weekly" defaultChecked={!!s.weekly} /> <span>Email me a weekly report on Monday mornings (counts only)</span></label>
                <label className="mlo-check"><input type="checkbox" name="digest" defaultChecked={!!s.digest} /> <span>Email me a morning summary: who to reach, drafts waiting, loans needing a touch (first names and counts only, no rates or messages)</span></label>
                <label className="mlo-field"><span>How you sound (a few words, for drafts): for example “friendly, short, first names, sign off with ‑J”</span><input name="voice" defaultValue={s.voice} className="mlo-input" maxLength={600} /></label>
                <p className="mlo-note">Texts are always drafts for you to approve. Sending on its own waits for counsel.</p>
                <button type="submit" className="mlo-btn">Save</button>
              </form>
              <form action={sweepAction}><button type="submit" className="mlo-btn mlo-btn--ghost" disabled={!s.enabled}>Run now</button></form>
            </section>

            <section className="mlo-section" id="drafts">
              <h2>Drafts for you ({drafts.length})</h2>
              {drafts.length === 0 ? <p className="mlo-note">Nothing waiting.</p> : (
                <ol className="cc-today">
                  {drafts.map((d) => (
                    <li key={d.id} className="cc-card">
                      <p className="cc-card__title"><Link href={`/mlo/contacts/${d.contactId}#conversation`}>{nameOf(d.contactId)}</Link> · {d.purpose === "service" ? "about their loan" : "a check-in"}{d.source === "template" ? " · template" : d.source === "automation" ? ` · loan update` : " · drafted by AI"}</p>
                      <p className="mlo-note">Why: {d.why} · {segmentLabel(d.purpose === "marketing" ? `${d.body}\n\n${sig}` : d.body)}{d.purpose === "marketing" ? " with your sign-off" : ""}</p>
                      {!d.gate.allowed ? <p className="mlo-note">Not sendable right now: {d.gate.reason}</p> : null}
                      <form action={approveAction} className="mlo-grid">
                        <input type="hidden" name="id" value={d.id} />
                        <textarea name="body" defaultValue={d.body} rows={3} maxLength={640} className="mlo-textarea" aria-label="Draft" />
                        <div className="mlo-row-form">
                          <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Approve and send</button>
                        </div>
                        {emailReady && people.find((x) => x?.id === d.contactId)?.email ? (
                          <details className="mlo-details" open={!d.gate.allowed}>
                            <summary>{d.gate.allowed ? "Send it as an email instead" : "Texting isn't allowed now: send it as an email"}</summary>
                            <label className="mlo-field"><span>Subject</span><input name="subject" className="mlo-input" maxLength={78} placeholder={d.purpose === "service" ? "A quick update on your loan" : "Checking in"} /></label>
                            <button type="submit" formAction={approveEmailAction} className="mlo-btn mlo-btn--ghost">Approve and email</button>
                          </details>
                        ) : null}
                      </form>
                      <form action={dismissAction}><input type="hidden" name="id" value={d.id} /><button type="submit" className="mlo-btn mlo-btn--ghost">Dismiss</button></form>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="mlo-section" id="reminders">
              <h2>Reminders ({tasks.length})</h2>
              {tasks.length === 0 ? <p className="mlo-note">Nothing due.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <th scope="row">{t.lane === "personal" ? <span className="mlo-pill">Reply yourself</span> : t.lane === "promise" ? <span className="mlo-pill">Your promise</span> : null} <Link href={`/mlo/contacts/${t.contactId}#conversation`}>{t.title}</Link><br /><span className="mlo-note">{t.why}</span></th>
                        <td className="mlo-note">{t.due ? `due ${t.due}` : ""}</td>
                        <td><form action={taskDoneAction}><input type="hidden" name="id" value={t.id} /><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Done</button></form></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="mlo-section" id="memory">
              <h2>Notes to keep or forget ({toKeep.length})</h2>
              <p className="mlo-note">Needs and plans clients mentioned, in their own words. Nothing is used for drafts or call scripts until you keep it.</p>
              {toKeep.length === 0 ? <p className="mlo-note">Nothing waiting.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {toKeep.map((m) => (
                      <tr key={m.id}>
                        <th scope="row"><Link href={`/mlo/contacts/${m.contactId}#memory`}>{nameOf(m.contactId)}</Link>: {m.fact}<br /><span className="mlo-note">“{m.quote}” · {m.kind}</span></th>
                        <td className="mlo-row-form">
                          <form action={keepAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="contactId" value={m.contactId} /><input type="hidden" name="from" value="desk" /><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Keep</button></form>
                          <form action={forgetFromDeskAction}><input type="hidden" name="id" value={m.id} /><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Forget</button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="mlo-section" id="tell">
              <h2>Tell your Concierge</h2>
              <Tell />
            </section>

            <section className="mlo-section">
              <h2>Ask your Concierge</h2>
              <Ask />
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
