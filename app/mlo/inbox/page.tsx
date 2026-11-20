import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { touchStore } from "@/lib/messaging/store";
import { twilioConfig } from "@/lib/messaging/twilio";
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
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Inbox</h1>
        <MloNav current="inbox" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        {!twilioConfig() ? <div className="mlo-flash mlo-flash--err" role="status">Texting isn&apos;t connected yet. It turns on when the Twilio keys are in Vercel.</div> : null}
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
