import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { conciergeStore } from "@/lib/concierge/store";
import { contactStore } from "@/lib/contacts/store";
import { FlashBox, MloNav } from "../MloChrome";
import Ask from "./Ask";
import { approveAction, dismissAction, settingsAction, sweepAction, taskDoneAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Concierge", robots: { index: false, follow: false } };

/** /mlo/concierge — the loan officer's AI Concierge: settings, drafts to approve, reminders, and questions (D8). */
export default async function Concierge({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const store = conciergeStore();
  const [s, drafts, tasks] = me ? await Promise.all([store.settings(me.id), store.proposals(me.id, "pending"), store.tasks(me.id)]) : [null, [], []];
  const people = await Promise.all([...drafts.map((d) => d.contactId), ...tasks.map((t) => t.contactId)].map((id) => contactStore().get(id)));
  const nameOf = (id: string) => {
    const c = people.find((p) => p?.id === id);
    return c ? `${c.firstName} ${c.lastName}`.trim() || c.email || "Someone" : "Someone";
  };
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Concierge</h1>
        <MloNav current="concierge" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
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
                      <p className="cc-card__title"><Link href={`/mlo/contacts/${d.contactId}#conversation`}>{nameOf(d.contactId)}</Link> · {d.purpose === "service" ? "about their loan" : "a check-in"}{d.source === "template" ? " · template" : " · drafted by AI"}</p>
                      <p className="mlo-note">Why: {d.why}</p>
                      {!d.gate.allowed ? <p className="mlo-note">Not sendable right now: {d.gate.reason}</p> : null}
                      <form action={approveAction} className="mlo-grid">
                        <input type="hidden" name="id" value={d.id} />
                        <textarea name="body" defaultValue={d.body} rows={3} maxLength={640} className="mlo-textarea" aria-label="Draft" />
                        <div className="mlo-row-form">
                          <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Approve and send</button>
                        </div>
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
                        <th scope="row"><Link href={`/mlo/contacts/${t.contactId}`}>{t.title}</Link><br /><span className="mlo-note">{t.why}</span></th>
                        <td className="mlo-note">{t.due ? `due ${t.due}` : ""}</td>
                        <td><form action={taskDoneAction}><input type="hidden" name="id" value={t.id} /><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Done</button></form></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
