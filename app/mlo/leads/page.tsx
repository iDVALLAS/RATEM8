import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { contactStore } from "@/lib/contacts/store";
import { summarize } from "@/lib/contacts/service";
import { FlashBox, MloNav } from "../MloChrome";
import KeyMaker from "../pipeline/KeyMaker";
import PageHead from "../PageHead";
import { LEADS, SUBS } from "@/lib/content/cc-pages";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead sources", robots: { index: false, follow: false } };

/** /mlo/leads — connect lead vendors and web forms; see new leads and whether their form gave you permission (D14). */
export default async function Leads({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const h = await headers();
  const endpoint = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/leads/inbound`;
  const { contacts } = me ? await contactStore().list({ ownerUserId: me.id, kind: "contact", limit: 2000 }) : { contacts: [] };
  const leads = contacts.filter((c) => c.source.startsWith("lead:")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
  const consents = await contactStore().consentsFor(leads.map((c) => c.id));

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="leads" title="Lead sources" sub={SUBS.leads} />
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> first.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>Connect a lead source</h2>
              <p className="mlo-note">{LEADS.how} Name the address after the vendor so you can tell them apart.</p>
              <p className="mlo-note">{LEADS.consent}</p>
              <KeyMaker endpoint={endpoint} defaultLabel="Lead vendor" owner={me.role === "owner"} />
              <p className="mlo-note">See and turn off your addresses on <Link href="/mlo/connections#keys">Connections</Link>.</p>
              <details className="mlo-details">
                <summary>Field names for your vendor</summary>
                <p className="mlo-note">The consent wording as <code>consent_text</code>, when they agreed as <code>consent_timestamp</code>, and the web page as <code>page_url</code>. Add <code>?source=</code> and the vendor&apos;s name to the address to label each lead.</p>
              </details>
            </section>

            <section className="mlo-section">
              <h2>Recent leads ({leads.length})</h2>
              {leads.length === 0 ? <p className="mlo-note">None yet.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {leads.map((c) => {
                      const s = summarize(consents.filter((e) => e.contactId === c.id));
                      const ok = s.text.marketing.granted || s.call.marketing.granted;
                      return (
                        <tr key={c.id}>
                          <th scope="row"><Link href={`/mlo/contacts/${c.id}`}>{`${c.firstName} ${c.lastName}`.trim() || c.email}</Link><br /><span className="mlo-note">{c.source.slice(6)} · {new Date(c.createdAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></th>
                          <td className="mlo-note">{ok ? "Form named you: permission on file" : "No permission yet"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
