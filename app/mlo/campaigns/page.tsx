import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { campaignsOn, summaries } from "@/lib/campaigns/service";
import { STARTERS } from "@/lib/campaigns/library";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { twilioConfig } from "@/lib/messaging/twilio";
import { textSender } from "@/lib/texting/service";
import { emailReadyFor } from "@/lib/messaging/email";
import { FlashBox } from "../MloChrome";
import { aiCampaignAction, enrollImportAction, newCampaignAction } from "./actions";
import { getImport, importPeople } from "@/lib/contacts/imports";
import PageHead from "../PageHead";
import { CAMPAIGNS, SUBS } from "@/lib/content/cc-pages";
import "../mlo.css";
import "./campaigns.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Campaigns", robots: { index: false, follow: false } };

const CH_ICON: Record<string, string> = { text: "Text", email: "Email", task: "Task" };

/** /mlo/campaigns — follow-up campaigns by text, email and tasks (D51). */
export default async function Campaigns({ searchParams }: { searchParams: Promise<{ f?: string; import?: string; new?: string }> }) {
  const { f, import: imp, new: fresh } = await searchParams;
  const making = fresh === "1";
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Campaigns</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to build campaigns.</p></div>
      </PageShell>
    );
  }
  const list = await summaries(me);
  // D75: "Start a campaign for these N people" from an import's done screen: the campaign picker for that import.
  const run = imp && /^imp_[A-Za-z0-9_-]{6,40}$/.test(imp) ? await getImport(me, imp) : null;
  const fromImport = run ? (await importPeople(me, run.id)).filter((c) => c.ownerUserId === me.id).length : 0;
  const textReady = !!twilioConfig() && !!(await textSender(companyOfMlo(me.mloId), singleCompany()));
  const mail = await emailReadyFor(me);
  const emailReady = mail.ready;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead
          k="campaigns"
          title={making ? CAMPAIGNS.newTitle : "Campaigns"}
          eyebrow={making ? <Link href="/mlo/campaigns">{CAMPAIGNS.back}</Link> : undefined}
          sub={making ? undefined : SUBS.campaigns}
          action={making ? undefined : <Link className="mlo-btn" href="/mlo/campaigns?new=1">{CAMPAIGNS.newButton}</Link>}
          how={<p className="mlo-note">{CAMPAIGNS.how}</p>}
        />
        <FlashBox flash={decodeFlash(f)} />
        <ul className="cp-ready">
          <li className={textReady ? "is-on" : ""}><strong>Texting</strong> {textReady ? "connected" : <>not connected yet · <Link href="/mlo/setup-help?topic=texting">set it up</Link></>}</li>
          <li className={emailReady ? "is-on" : ""}><strong>Email</strong> {mail.reconnect ? <>needs reconnecting · <Link href="/mlo/email">reconnect</Link> (email steps wait meanwhile)</> : emailReady ? (mail.via === "mailbox" ? `from ${mail.from}` : <>connected · <Link href="/mlo/email">send from your own mailbox</Link></>) : <>not connected yet · <Link href="/mlo/email">connect your email</Link></>}</li>
          <li className="is-on"><strong>Reminders for you</strong> always on</li>
          {!campaignsOn() ? <li><strong>{CAMPAIGNS.off}</strong></li> : null}
        </ul>

        {making ? (
        <section className="mlo-section cp-new">
          <h2>Describe it, or pick a plan</h2>
          <form action={aiCampaignAction} className="cp-ai">
            <label className="mlo-field">
              <span>Describe what you want, and M8 writes it</span>
              <textarea name="goal" rows={2} maxLength={800} required className="mlo-textarea" placeholder="Follow up with open-house sign-ins for two weeks, then check in monthly." />
            </label>
            <button type="submit" className="mlo-btn">Write it with M8</button>
          </form>
          <p className="eyebrow" style={{ marginTop: 18 }}>Or start from one of these</p>
          <div className="cp-starters">
            {STARTERS.map((s) => (
              <form key={s.id} action={newCampaignAction.bind(null, s.id)} className="cp-starter">
                <strong>{s.name}</strong>
                <span className="mlo-note">{s.summary}</span>
                <span className="cp-starter__chips">{s.steps.map((st, i) => <span key={i} className={`cp-mini cp-mini--${st.channel}`} title={`${CH_ICON[st.channel]} on day ${s.steps.slice(0, i + 1).reduce((n, x) => n + x.waitDays, 0)}`}>{CH_ICON[st.channel]}</span>)}</span>
                <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 4 }}>Use this one</button>
              </form>
            ))}
            <form action={newCampaignAction.bind(null, null)} className="cp-starter cp-starter--blank">
              <strong>Blank</strong>
              <span className="mlo-note">Build your own, step by step.</span>
              <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 4 }}>Start blank</button>
            </form>
          </div>
        </section>

        ) : (
          <>
        {run ? (
          <section className="mlo-section" id="from-import">
            <h2>Add the {fromImport.toLocaleString("en-US")} {fromImport === 1 ? "person" : "people"} from your import</h2>
            <p className="mlo-note">From {run.files.join(", ")}. Pick a campaign, or start a new one and add them from its page. Each step still goes only to people with permission for it.</p>
            {list.length && fromImport ? (
              <ul className="cp-list">
                {list.map(({ campaign: c, active }) => (
                  <li key={c.id} className="cp-pick">
                    <span className="cp-row__main"><strong>{c.name}</strong><span className="mlo-note">{c.steps.length} {c.steps.length === 1 ? "step" : "steps"} · {active} in it</span></span>
                    <form action={enrollImportAction.bind(null, c.id, run.id)}>
                      <button type="submit" className="mlo-btn mlo-btn--ghost">Add them to this one</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="mlo-note">{fromImport ? "You don't have a campaign yet. Start one with + New campaign." : "Nobody from that import is in your own book."}</p>}
          </section>
        ) : null}


            <section className="mlo-section">
              <h2>Your campaigns ({list.length})</h2>
              {list.length === 0 ? (
                <>
                  <p className="mlo-note">{CAMPAIGNS.empty}</p>
                  <div className="mlo-actions"><Link className="mlo-btn" href="/mlo/campaigns?new=1">{CAMPAIGNS.newButton}</Link></div>
                </>
              ) : (
                <ul className="cp-list">
                  {list.map(({ campaign: c, active, done, stopped, sent, skipped }) => (
                    <li key={c.id}>
                      <Link href={`/mlo/campaigns/${c.id}`} className="cp-row">
                        <span className={`cp-status cp-status--${c.status}`}>{c.status === "active" ? "On" : c.status === "paused" ? "Paused" : "Draft"}</span>
                        <span className="cp-row__main"><strong>{c.name}</strong><span className="mlo-note">{c.steps.length} {c.steps.length === 1 ? "step" : "steps"} · {c.trigger === "new_lead" ? "every new lead" : "people you add"} · {c.kind === "followup" ? "stops on reply" : "keeps going"}</span></span>
                        <span className="cp-row__nums"><span><b>{active}</b> in it</span><span><b>{done}</b> finished</span><span><b>{stopped}</b> stopped</span><span><b>{sent}</b> sent</span>{skipped ? <span><b>{skipped}</b> skipped</span> : null}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
