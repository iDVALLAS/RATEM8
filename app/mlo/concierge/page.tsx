import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { conciergeStore } from "@/lib/concierge/store";
import { contactStore } from "@/lib/contacts/store";
import { FlashBox, MloNav } from "../MloChrome";
import Composer from "./Composer";
import PageHead from "../PageHead";
import { CONCIERGE, SUBS } from "@/lib/content/cc-pages";
import { segmentLabel } from "@/lib/messaging/segments";
import { signature } from "@/lib/messaging/service";
import { emailOn, emailReadyFor } from "@/lib/messaging/email";
import { allowanceFor } from "@/lib/ai/meter";
import { approveAction, approveAllAction, approveEmailAction, dismissAction, forgetFromDeskAction, keepAction, settingsAction, sweepAction, taskDoneAction } from "./actions";
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
  const sendable = drafts.filter((d) => d.gate.allowed);
  const nameOf = (id: string) => {
    const c = people.find((p) => p?.id === id);
    return c ? `${c.firstName} ${c.lastName}`.trim() || c.email || "Someone" : "Someone";
  };
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead
          k="concierge"
          title="Concierge"
          sub={SUBS.concierge}
          action={me && s?.enabled ? <form action={sweepAction}><button type="submit" className="mlo-btn mlo-btn--ghost">Run now</button></form> : undefined}
          how={<><p className="mlo-note">{CONCIERGE.how}</p><p className="mlo-note">It works with the rest of your AI assistants: a Business Finder, Pipeline, Partner, Coach and Compliance. <Link href="/mlo/agents">Open AI assistants</Link>.</p></>}
        />
        <MloNav current="concierge" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {ai?.over ? <div className="mlo-flash mlo-flash--err" role="status">This month&apos;s AI allowance is used, so the Concierge drafts from templates until {ai.resetsOn}. <Link href="/mlo/network#ai">See your usage</Link>.</div> : null}
        {!me || !s ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to use your Concierge.</p></section>
        ) : (
          <>
            {!s.enabled ? <SettingsFold s={s} open /> : null}

            <section className="mlo-section" id="drafts">
              <h2>Drafts for you ({drafts.length})</h2>
              {drafts.length === 0 ? <p className="mlo-note">Nothing waiting.</p> : (
                <>
                  {sendable.length > 1 ? (
                    <details className="mlo-details cc-approveall">
                      <summary>{CONCIERGE.approveAll(sendable.length)}</summary>
                      <form action={approveAllAction.bind(null, sendable.map((d) => d.id).join(","))} className="mlo-grid">
                        <p className="mlo-note">{CONCIERGE.approveAllNote(sendable.length)}</p>
                        <button type="submit" className="mlo-btn">{CONCIERGE.approveAllGo(sendable.length)}</button>
                      </form>
                    </details>
                  ) : null}
                  <ol className="cc-today">
                    {drafts.map((d) => (
                      <li key={d.id} className="cc-card cc-draft">
                        <p className="cc-card__title"><Link href={`/mlo/contacts/${d.contactId}#conversation`}>{nameOf(d.contactId)}</Link> · {d.purpose === "service" ? "about their loan" : "a check-in"}{d.source === "template" ? " · template" : d.source === "automation" ? ` · loan update` : " · drafted by AI"}</p>
                        <p className="mlo-note">Why: {d.why} · {segmentLabel(d.purpose === "marketing" ? `${d.body}\n\n${sig}` : d.body)}{d.purpose === "marketing" ? " with your sign-off" : ""}</p>
                        {!d.gate.allowed ? <p className="mlo-note">Not sendable right now: {d.gate.reason}</p> : null}
                        <form action={approveAction} className="mlo-grid">
                          <input type="hidden" name="id" value={d.id} />
                          <blockquote className="cc-draft__body">{d.body}</blockquote>
                          <details className="mlo-details">
                            <summary>Edit</summary>
                            <textarea name="body" defaultValue={d.body} rows={3} maxLength={640} className="mlo-textarea" aria-label="Draft" />
                          </details>
                          <div className="mlo-row-form">
                            <button type="submit" className="mlo-btn">Approve and send</button>
                            <button type="submit" formAction={dismissAction} formNoValidate className="mlo-btn mlo-btn--ghost">Skip</button>
                          </div>
                          {emailReady && people.find((x) => x?.id === d.contactId)?.email ? (
                            <details className="mlo-details" open={!d.gate.allowed}>
                              <summary>{d.gate.allowed ? "Send it as an email instead" : "Texting isn't allowed now: send it as an email"}</summary>
                              <label className="mlo-field"><span>Subject</span><input name="subject" className="mlo-input" maxLength={78} placeholder={d.purpose === "service" ? "A quick update on your loan" : "Checking in"} /></label>
                              <button type="submit" formAction={approveEmailAction} className="mlo-btn mlo-btn--ghost">Approve and email</button>
                            </details>
                          ) : null}
                        </form>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>

            <section className="mlo-section" id="reminders">
              <h2>Reminders ({tasks.length})</h2>
              {tasks.length === 0 ? <p className="mlo-note">Nothing due.</p> : (
                <ul className="cc-blocked">
                  {tasks.map((t) => (
                    <li key={t.id} className="cc-blocked__row cc-rem">
                      <div className="cc-blocked__who">
                        <span>{t.lane === "personal" ? <span className="mlo-pill">Reply yourself</span> : t.lane === "promise" ? <span className="mlo-pill">Your promise</span> : null} <Link href={`/mlo/contacts/${t.contactId}#conversation`}>{t.title}</Link></span>
                        <span className="mlo-note">{t.why}{t.due ? ` · due ${t.due}` : ""}</span>
                      </div>
                      <form action={taskDoneAction} className="cc-blocked__fix"><input type="hidden" name="id" value={t.id} /><button type="submit" className="mlo-btn mlo-btn--ghost">Done</button></form>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mlo-section" id="tell">
              <h2>{CONCIERGE.composerTitle}</h2>
              <Composer />
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
                          <form action={keepAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="contactId" value={m.contactId} /><input type="hidden" name="from" value="desk" /><button type="submit" className="mlo-btn">Keep</button></form>
                          <form action={forgetFromDeskAction}><input type="hidden" name="id" value={m.id} /><button type="submit" className="mlo-btn mlo-btn--ghost">Forget</button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {s.enabled ? <SettingsFold s={s} open={false} /> : null}
          </>
        )}
      </div>
    </PageShell>
  );
}

type Settings = { enabled: boolean; memory: boolean; tasks: boolean; weekly?: boolean | null; digest?: boolean | null; voice: string };

/** D76: the Concierge's settings, folded once it's on. Each choice is a switch row. */
function SettingsFold({ s, open }: { s: Settings; open: boolean }) {
  const row = (name: string, checked: boolean, label: string, help?: string) => (
    <label className="cc-switch">
      <span className="cc-switch__text"><span>{label}</span>{help ? <span className="mlo-note">{help}</span> : null}</span>
      <input type="checkbox" role="switch" name={name} defaultChecked={checked} />
    </label>
  );
  return (
    <details className="mlo-section cc-fold" id="settings" open={open}>
      <summary className="cc-sechead"><h2>{CONCIERGE.settings}{s.enabled ? <span className="mlo-note"> · On</span> : <span className="mlo-note"> · Off</span>}</h2><span className="cc-fold__arrow" aria-hidden="true" /></summary>
      <form action={settingsAction} className="mlo-grid">
        <div className="cc-switches">
          {row("enabled", s.enabled, "Turn the Concierge on", "It looks at your book each morning, and whenever you press “Run now”.")}
          {row("memory", s.memory, "Remember needs and plans clients mention", "In their own words; you can delete any note.")}
          {row("tasks", s.tasks, "Set reminders for me")}
          {row("weekly", !!s.weekly, "Email me a weekly report on Monday mornings", "Counts only.")}
          {row("digest", !!s.digest, "Email me a morning summary", "Who to reach, drafts waiting, loans needing a touch: first names and counts only, no rates or messages.")}
        </div>
        <label className="mlo-field"><span>How you sound (a few words, for drafts): for example “friendly, short, first names, sign off with ‑J”</span><input name="voice" defaultValue={s.voice} className="mlo-input" maxLength={600} /></label>
        <p className="mlo-note">{CONCIERGE.notAuto}</p>
        <button type="submit" className="mlo-btn">Save</button>
      </form>
    </details>
  );
}
