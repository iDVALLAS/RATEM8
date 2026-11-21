import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { touchStore } from "@/lib/messaging/store";
import { textingReadyFor } from "@/lib/texting/ready";
import { twilioConfig } from "@/lib/messaging/twilio";
import { SUBS } from "@/lib/content/cc-pages";
import PageHead from "../PageHead";
import NotOnYet from "../NotOnYet";
import { contactStore } from "@/lib/contacts/store";
import { scopeOf } from "@/lib/contacts/service";
import { MloNav } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

/** /mlo/inbox — latest conversation with each person, newest first (D4). */
export default async function Inbox() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const threads = v.user ? await touchStore().threads(scopeOf(v.user), 100) : [];
  const people = await Promise.all(threads.map((t) => contactStore().get(t.contactId)));
  const texting = v.user ? await textingReadyFor(v.user).catch(() => false) : !!twilioConfig();
  const owner = v.user?.role === "owner";
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="inbox" title="Inbox" sub={SUBS.inbox} />
        <MloNav current="inbox" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        {v.user && !texting ? (
          <NotOnYet what="texting" icon="message" owner={owner}>
            <p className="mlo-note">{twilioConfig() ? "The platform's Twilio keys are set, but this company has no Messaging Service yet: approve its registration on Texting setup, or set its Messaging Service by hand there." : "Add TWILIO_ACCOUNT_SID (not Sensitive) and TWILIO_AUTH_TOKEN (Sensitive) in Vercel, redeploy, then set up each company's Messaging Service on Texting setup."} <Link href="/mlo/texting">Open Texting setup</Link>.</p>
          </NotOnYet>
        ) : null}
        <section className="mlo-section">
          {!v.user ? (
            <p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your conversations.</p>
          ) : threads.length === 0 ? (
            <p className="mlo-note">No conversations yet. Texts you send and replies you get show up here.</p>
          ) : (
            <table className="mlo-table mlo-table--plain">
              <tbody>
                {threads.map((t, i) => {
                  const c = people[i];
                  return (
                    <tr key={t.id}>
                      <th scope="row">{c ? <Link href={`/mlo/contacts/${c.id}#conversation`}>{`${c.firstName} ${c.lastName}`.trim() || c.email}</Link> : "Deleted contact"}</th>
                      <td>{t.direction === "in" ? <span className="mlo-pill">Replied</span> : <span className="mlo-pill mlo-pill--off">You</span>}</td>
                      <td>{t.body.length > 90 ? `${t.body.slice(0, 90)}…` : t.body}{t.note && t.direction === "in" ? <><br /><span className="mlo-note">{t.note}</span></> : null}</td>
                      <td className="mlo-note">{new Date(t.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageShell>
  );
}
