import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { emailOn } from "@/lib/messaging/email";
import { mailboxFor } from "@/lib/mail/service";
import { PROVIDER_LABEL, providersOn, redirectUri } from "@/lib/mail/oauth";
import { requestOrigin } from "@/lib/mail/origin";
import { FlashBox } from "../MloChrome";
import { disconnectMailAction, testMailAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email", robots: { index: false, follow: false } };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "not yet");

/** /mlo/email — connect your own Gmail or Microsoft 365 mailbox, send-only (D52). */
export default async function EmailPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Email</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to connect your mailbox.</p></div>
      </PageShell>
    );
  }
  const box = await mailboxFor(me);
  const on = providersOn();
  const origin = requestOrigin(await headers());
  const owner = me.role === "owner";
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Email</h1>
        <FlashBox flash={decodeFlash(f)} />

        <section className="mlo-section" aria-labelledby="box-h">
          <h2 id="box-h" className="text-xl">Your mailbox</h2>
          {box ? (
            <>
              <p style={{ marginTop: 8 }}>
                <strong>{box.status === "connected" ? "Connected" : "Needs reconnecting"}</strong>: {box.label}, <strong>{box.email}</strong>
              </p>
              {box.status !== "connected" ? (
                <p className="mlo-note" role="alert">{box.lastError || "The connection stopped working."} Nothing is sent from another address meanwhile; campaign emails wait until you reconnect.</p>
              ) : (
                <p className="mlo-note">Emails to clients go from this address. Last sent: {day(box.lastSentAt)}. Connected {day(box.connectedAt)}.</p>
              )}
              <div className="mlo-row-form" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
                {box.status === "connected" ? (
                  <form action={testMailAction}><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Send me a test</button></form>
                ) : on.includes(box.provider) ? (
                  <a className="mlo-btn" style={{ marginTop: 0 }} href={`/api/cc/mail/start?provider=${box.provider}`}>Reconnect {box.label}</a>
                ) : null}
                <form action={disconnectMailAction}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Disconnect</button></form>
              </div>
            </>
          ) : on.length ? (
            <>
              <p className="mlo-note" style={{ marginTop: 8 }}>Connect the mailbox your company gave you. You&apos;ll sign in with Google or Microsoft and allow one thing: sending email as you.</p>
              <div className="mlo-row-form" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
                {on.map((p) => (
                  <a key={p} className="mlo-btn" style={{ marginTop: 0 }} href={`/api/cc/mail/start?provider=${p}`}>Connect {PROVIDER_LABEL[p]}</a>
                ))}
              </div>
            </>
          ) : (
            <p className="mlo-note" style={{ marginTop: 8 }}>
              {owner ? "Connecting Gmail and Microsoft 365 isn't set up yet. It needs one app registration with each (steps below and on the Launch checklist)." : "Connecting Gmail and Microsoft 365 isn't turned on yet. The owner sets it up once for everyone."}{" "}
              {emailOn() ? "Until then, emails go from the platform address in your name, with replies to your own inbox." : ""} <Link href="/mlo/setup-help?topic=mailbox">Ask the setup assistant</Link>.
            </p>
          )}
        </section>

        <section className="mlo-section" aria-labelledby="how-h">
          <h2 id="how-h" className="text-xl">How it works</h2>
          <ul className="mlo-list" style={{ marginTop: 8 }}>
            <li><strong>Send only.</strong> Command Center asks for permission to send, never to read your inbox, contacts or calendar.</li>
            <li><strong>From you.</strong> Emails from a contact&apos;s page, your Concierge and campaigns go from your address, with your <Link href="/mlo/signature">signature</Link> and the lines the law asks for (your NMLS number, your company and its address, Equal Housing Opportunity, a way to stop emails).</li>
            <li><strong>Kept where your company keeps mail.</strong> Each one lands in your Sent folder, and replies come straight to your inbox.</li>
            <li><strong>Replies and campaigns.</strong> Command Center can&apos;t see email replies, so when someone answers an email, open their contact page and press &quot;They replied&quot;. Their follow-up campaigns stop. Text replies and STOP are caught automatically.</li>
            <li><strong>If it breaks</strong> (a password change, or your company removes the permission), sending stops and you get an email asking you to reconnect. It never switches to another address.</li>
            <li><strong>Sending limits.</strong> Google Workspace allows about 2,000 emails a day per mailbox and personal Gmail about 500; Microsoft 365 about 10,000 recipients a day.</li>
          </ul>
        </section>

        {owner ? (
          <section className="mlo-section" aria-labelledby="owner-h">
            <h2 id="owner-h" className="text-xl">Setting it up (owner, once)</h2>
            <p className="mlo-note" style={{ marginTop: 8 }}>Each needs an app registration and two settings in Vercel, then a redeploy. <Link href="/mlo/setup-help?topic=mailbox">The setup assistant</Link> walks through it.</p>
            <ol className="mlo-list" style={{ marginTop: 8 }}>
              <li>
                <strong>Gmail (Google Cloud):</strong> an OAuth client of type &quot;Web application&quot; with the Gmail API turned on and the scope <code>gmail.send</code>. Add this as an authorized redirect URI: <code>{redirectUri(origin, "google")}</code> (and the same path on your production address). Google reviews the app&apos;s brand before people outside your own Workspace can use it.
                <br />Vercel: <code>GOOGLE_OAUTH_CLIENT_ID</code> (not Sensitive), <code>GOOGLE_OAUTH_CLIENT_SECRET</code> (Sensitive). Now: {on.includes("google") ? "set" : "not set"}.
              </li>
              <li style={{ marginTop: 8 }}>
                <strong>Microsoft 365 (Entra):</strong> an app registration for accounts in any organization, a Web redirect URI <code>{redirectUri(origin, "microsoft")}</code> (and production), a client secret, and the delegated Microsoft Graph permissions <code>Mail.Send</code>, <code>User.Read</code> and <code>offline_access</code>. Some companies require their IT admin to approve the app once.
                <br />Vercel: <code>MS_OAUTH_CLIENT_ID</code> (not Sensitive), <code>MS_OAUTH_CLIENT_SECRET</code> (Sensitive). Now: {on.includes("microsoft") ? "set" : "not set"}.
              </li>
            </ol>
            <p className="mlo-note" style={{ marginTop: 8 }}>The saved connections are encrypted with <code>CC_MAIL_KEY</code> (Sensitive, optional; otherwise one derived from <code>CC_LINK_SECRET</code>). Changing it means everyone reconnects.</p>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
