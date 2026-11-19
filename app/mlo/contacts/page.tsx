import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { contactStore } from "@/lib/contacts/store";
import { consentBadge, scopeOf, summarize } from "@/lib/contacts/service";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { formatPhone } from "@/lib/contacts/normalize";
import { FlashBox, MloNav } from "../MloChrome";
import { unlockAction } from "./actions";
import { UNLOCK_ATTESTATION } from "@/lib/contacts/attestation";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contacts", robots: { index: false, follow: false } };

const BADGE = { proof: "Permission on file", attested: "Your word only", revoked: "Do not contact", relationship: "Relationship only", held: "On hold" } as const;
const PAGE = 50;

/** /mlo/contacts — the loan officer's people (D2). Loan officers see their own; leads and the owner see the team's. */
export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; rel?: string; kind?: string; p?: string; f?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const kind = sp.kind === "agent" ? "agent" : "contact";
  const page = Math.max(0, Number(sp.p) || 0);
  const me = v.user;
  const store = contactStore();
  const { contacts, total } = me ? await store.list({ ownerUserId: scopeOf(me), kind, q: sp.q?.trim() || undefined, relationship: sp.rel || undefined, limit: PAGE, offset: page * PAGE }) : { contacts: [], total: 0 };
  const consents = await store.consentsFor(contacts.map((c) => c.id));
  const mine = me ? await store.list({ ownerUserId: me.id, limit: 500 }) : { contacts: [] };
  const held = mine.contacts.filter((c) => c.locked).length;
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.rel ? { rel: sp.rel } : {}), kind, ...extra });
    return `/mlo/contacts?${u}`;
  };

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">{kind === "agent" ? "Agents" : "Contacts"}</h1>
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(sp.f)} />
        {!me ? (
          <section className="mlo-section">
            <p className="mlo-note">Contacts belong to a person. <Link href="/sign-in">Sign in with your email</Link> to see yours.</p>
          </section>
        ) : (
          <>
            <nav className="mlo-nav" aria-label="Contact type">
              <Link href="/mlo/contacts" aria-current={kind === "contact" ? "page" : undefined}>Clients and contacts</Link>
              <Link href="/mlo/contacts?kind=agent" aria-current={kind === "agent" ? "page" : undefined}>Agents</Link>
              <Link href={`/mlo/contacts/import${kind === "agent" ? "?kind=agents" : ""}`}>Import a CSV</Link>
              {kind === "contact" ? <Link href="/mlo/contacts/permission">Record permission for past clients</Link> : null}
            </nav>
            {held ? (
              <form action={unlockAction} className="mlo-section">
                <h2>{held} {held === 1 ? "person is" : "people are"} on hold</h2>
                <p className="mlo-note">They came from a previous employer&apos;s system, so nothing will be sent to them until you confirm you may use the list.</p>
                <label className="mlo-check">
                  <input type="checkbox" name="attest" value="yes" required />
                  <span>{UNLOCK_ATTESTATION}</span>
                </label>
                <button type="submit" className="mlo-btn">Release them from hold</button>
              </form>
            ) : null}
            <form className="mlo-row-form" action="/mlo/contacts" method="get">
              <input type="hidden" name="kind" value={kind} />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, phone, email, city, tag" className="mlo-input" aria-label="Search" style={{ flex: "1 1 240px" }} />
              {kind === "contact" ? (
                <select name="rel" defaultValue={sp.rel ?? ""} className="mlo-select" aria-label="Relationship">
                  <option value="">Everyone</option>
                  {Object.entries(RELATIONSHIP_LABELS).filter(([k]) => k !== "agent").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : null}
              <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Search</button>
            </form>
            <section className="mlo-section">
              {total === 0 ? (
                <p className="mlo-note">
                  Nobody here yet. <Link href={`/mlo/contacts/import${kind === "agent" ? "?kind=agents" : ""}`}>Import a CSV</Link> to start.
                </p>
              ) : (
                <>
                  <p className="mlo-note">{total.toLocaleString("en-US")} {total === 1 ? "person" : "people"}</p>
                  <table className="mlo-table">
                    <tbody>
                      {contacts.map((c) => {
                        const badge = c.locked ? "held" : consentBadge(summarize(consents.filter((e) => e.contactId === c.id)));
                        return (
                          <tr key={c.id}>
                            <th scope="row">
                              <Link href={`/mlo/contacts/${c.id}`}>{`${c.firstName} ${c.lastName}`.trim() || c.email}</Link>
                              {kind === "agent" && c.agent?.brokerage ? <><br /><span className="mlo-note">{c.agent.brokerage}</span></> : null}
                            </th>
                            <td>{formatPhone(c.phone)}</td>
                            <td>{c.state ?? ""}</td>
                            <td>{kind === "agent" ? (c.agent?.units !== null && c.agent?.units !== undefined ? `${c.agent.units} units` : "") : RELATIONSHIP_LABELS[c.relationship]}</td>
                            <td><span className={`mlo-pill ${badge === "revoked" || badge === "relationship" || badge === "held" ? "mlo-pill--off" : ""}`}>{BADGE[badge]}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <nav className="mlo-nav" aria-label="Pages">
                    {page > 0 ? <Link href={qs({ p: String(page - 1) })}>Previous</Link> : null}
                    {(page + 1) * PAGE < total ? <Link href={qs({ p: String(page + 1) })}>Next</Link> : null}
                  </nav>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
