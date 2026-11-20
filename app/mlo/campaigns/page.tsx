import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { campaignsOn, summaries } from "@/lib/campaigns/service";
import { STARTERS } from "@/lib/campaigns/library";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { serviceForCompany, twilioConfig } from "@/lib/messaging/twilio";
import { emailOn } from "@/lib/messaging/email";
import { FlashBox } from "../MloChrome";
import { aiCampaignAction, newCampaignAction } from "./actions";
import "../mlo.css";
import "./campaigns.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Campaigns", robots: { index: false, follow: false } };

const CH_ICON: Record<string, string> = { text: "Text", email: "Email", task: "Task" };

/** /mlo/campaigns — follow-up campaigns by text, email and tasks (D51). */
export default async function Campaigns({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
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
  const textReady = !!twilioConfig() && !!serviceForCompany(companyOfMlo(me.mloId), singleCompany());
  const emailReady = emailOn();
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Campaigns</h1>
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note">A campaign is a few texts, emails and reminders spaced out over days, sent for you. Each message still goes through your contact rules first (permission, do-not-call, quiet hours in their time zone, state rules), and a reply ends a follow-up campaign.</p>
          <ul className="cp-ready">
            <li className={textReady ? "is-on" : ""}><strong>Texting</strong> {textReady ? "connected" : <>not connected yet · <Link href="/mlo/setup-help?topic=texting">set it up</Link></>}</li>
            <li className={emailReady ? "is-on" : ""}><strong>Email</strong> {emailReady ? "connected" : <>not connected yet · <Link href="/mlo/setup-help?topic=email">set it up</Link></>}</li>
            <li className="is-on"><strong>Reminders for you</strong> always on</li>
            {!campaignsOn() ? <li><strong>All campaigns are switched off</strong> for the platform (CC_CAMPAIGNS)</li> : null}
          </ul>
        </section>

        <section className="mlo-section cp-new">
          <h2>Start a campaign</h2>
          <form action={aiCampaignAction} className="cp-ai">
            <label className="mlo-field">
              <span>Describe what you want, and M8 writes it</span>
              <textarea name="goal" rows={2} maxLength={800} required className="mlo-textarea" placeholder="Follow up with open-house sign-ins for two weeks, then check in monthly." />
            </label>
            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Write it with M8</button>
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

        <section className="mlo-section">
          <h2>Your campaigns ({list.length})</h2>
          {list.length === 0 ? <p className="mlo-note">None yet. Start one above.</p> : (
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
      </div>
    </PageShell>
  );
}
