import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { contactStore } from "@/lib/contacts/store";
import { scopeOf, summarize } from "@/lib/contacts/service";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { formatPhone, initialsOf } from "@/lib/contacts/normalize";
import { FlashBox, MloNav } from "../MloChrome";
import { addContactAction, deleteTagAction, mergeTagAction, renameTagAction, unlockAction } from "./actions";
import AddPerson from "./AddPerson";
import { reachBadge } from "@/lib/contacts/reach";
import { nameOf } from "@/lib/contacts/merge";
import { relationshipsFor } from "@/lib/contacts/editing";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import { PROVENANCE } from "@/lib/contacts/store";
import ContactsTable, { type ContactRow } from "./ContactsTable";
import { tagBook } from "@/lib/contacts/tagging";
import { tagHref } from "@/lib/contacts/tags";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import { UNLOCK_ATTESTATION } from "@/lib/contacts/attestation";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contacts", robots: { index: false, follow: false } };

const PAGE = 50;

/** /mlo/contacts — the loan officer's people (D2). Loan officers see their own; leads and the owner see the team's. */
export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; rel?: string; kind?: string; p?: string; f?: string; tag?: string; select?: string; import?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const kind = sp.kind === "agent" ? "agent" : "contact";
  const page = Math.max(0, Number(sp.p) || 0);
  const me = v.user;
  const store = contactStore();
  const tag = sp.tag?.trim().slice(0, 200) || undefined;
  // D75: "See these people" after an import (created or changed by it).
  const imp = /^imp_[A-Za-z0-9_-]{6,40}$/.test(sp.import ?? "") ? sp.import : undefined;
  const { contacts, total } = me ? await store.list({ ownerUserId: scopeOf(me), kind, q: sp.q?.trim() || undefined, relationship: sp.rel || undefined, tag, importId: imp, limit: PAGE, offset: page * PAGE }) : { contacts: [], total: 0 };
  // D73: tags in the list's scope (the chip row) and in the viewer's own book (the Tags panel).
  const book = me ? tagBook(me) : null;
  const listTags = me ? await store.tagCounts(scopeOf(me), kind) : [];
  const ownTags = !book ? [] : scopeOf(me!) === book ? listTags : await store.tagCounts(book, kind);
  const rowTags = listTags.slice(0, 12);
  if (tag && !rowTags.some((t) => t.tag === tag)) rowTags.push({ tag, count: total });
  const consents = await store.consentsFor(contacts.map((c) => c.id));
  // D75: counted in the database (before, only the first 500 people were looked at).
  const held = me ? await store.countLocked(me.id) : 0;
  const qs = (extra: Record<string, string>, drop: string[] = []) => {
    const u = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.rel ? { rel: sp.rel } : {}), ...(tag ? { tag } : {}), ...(imp ? { import: imp } : {}), kind, ...extra });
    for (const k of drop) u.delete(k);
    return `/mlo/contacts?${u}`;
  };

  // D77: one row per person: initials, name, "phone · state · relationship", tags, a plain badge, Call and Text.
  const rows: ContactRow[] = contacts.map((c) => {
    const summary = summarize(consents.filter((e) => e.contactId === c.id));
    const badge = reachBadge({ summary, hasPhone: !!c.phone, hasEmail: !!c.email, locked: c.locked });
    const phoneStop = (["call", "ai_call", "text"] as const).some((ch) => summary[ch].service.evidence === "revoked" || summary[ch].marketing.evidence === "revoked");
    const rel = kind === "agent" ? [c.agent?.brokerage, c.agent?.units !== null && c.agent?.units !== undefined ? `${c.agent.units} units` : ""].filter(Boolean).join(" · ") : RELATIONSHIP_LABELS[c.relationship];
    return {
      id: c.id,
      name: nameOf(c),
      initials: initialsOf(c.firstName, c.lastName, c.email ?? ""),
      line: [formatPhone(c.phone) || c.email, c.state, rel].filter(Boolean).join(" · "),
      badge: badge.label,
      tone: badge.tone,
      tags: c.tags ?? [],
      canCall: !!c.phone && !phoneStop && !c.locked,
      hasPhone: !!c.phone,
    };
  });

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="contacts" title={kind === "agent" ? "Agents" : "Contacts"} />
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(sp.f)} />
        {!me ? (
          <section className="mlo-section">
            <p className="mlo-note">Contacts belong to a person. <Link href="/sign-in">Sign in with your email</Link> to see yours.</p>
          </section>
        ) : (
          <>
            <nav className="cc-tabs-inline" aria-label="Contact type">
              <Link href="/mlo/contacts" aria-current={kind === "contact" ? "page" : undefined}>Clients and contacts</Link>
              <Link href="/mlo/contacts?kind=agent" aria-current={kind === "agent" ? "page" : undefined}>Agents</Link>
              {kind === "contact" ? <Link href="/mlo/contacts/permission">Record permission for past clients</Link> : null}
              {kind === "contact" ? <Link href="/mlo/leads">Lead sources</Link> : null}
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
              {tag ? <input type="hidden" name="tag" value={tag} /> : null}
              {imp ? <input type="hidden" name="import" value={imp} /> : null}
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, phone, email, city, tag" className="mlo-input" aria-label="Search" style={{ flex: "1 1 240px" }} />
              {kind === "contact" ? (
                <select name="rel" defaultValue={sp.rel ?? ""} className="mlo-select" aria-label="Relationship">
                  <option value="">Everyone</option>
                  {Object.entries(RELATIONSHIP_LABELS).filter(([k]) => k !== "agent").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : null}
              <button type="submit" className="mlo-btn mlo-btn--ghost">Search</button>
              <Link href={`/mlo/contacts/import${kind === "agent" ? "?kind=agents" : ""}`} className="mlo-btn">Import contacts</Link>
            </form>
            <AddPerson
              agent={kind === "agent"}
              relationships={relationshipsFor(kind).map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }))}
              provenances={PROVENANCE.filter((p) => kind !== "agent" || p !== "own_closings").map((p) => ({ value: p, label: cp.provenance[p] }))}
              action={addContactAction.bind(null, kind)}
            />
            {rowTags.length ? (
              <nav className="cc-tagrow" aria-label={tc.tagRow}>
                <span className="cc-tagrow__label">{tc.tagRow}</span>
                <Link href={kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"} className="cc-tag" aria-current={!tag ? "page" : undefined}>{tc.all}</Link>
                {rowTags.map((t) => (
                  <Link key={t.tag} href={tagHref(t.tag, kind)} className="cc-tag" aria-current={tag === t.tag ? "page" : undefined}>
                    {t.tag} <span className="cc-tag__n">{t.count.toLocaleString("en-US")}</span>
                  </Link>
                ))}
              </nav>
            ) : null}
            <section className="mlo-section">
              {total === 0 && (tag || imp || sp.q || sp.rel) ? (
                <p className="mlo-note">Nobody matches. <Link href={kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"}>See everyone</Link>.</p>
              ) : total === 0 ? (
                <p className="mlo-note">
                  Nobody here yet. <Link href={`/mlo/contacts/import${kind === "agent" ? "?kind=agents" : ""}`}>Import contacts</Link> to start.
                </p>
              ) : (
                <>
                  <p className="mlo-note">{imp ? tc.fromImport(total) : tag ? tc.tagged(tag, total) : `${total.toLocaleString("en-US")} ${total === 1 ? "person" : "people"}`}{imp ? <> · <Link href="/mlo/contacts/import/history">{tc.importHistory}</Link> · <Link href={qs({}, ["import"])}>{tc.clear}</Link></> : tag ? <> · <Link href={qs({}, ["tag"])}>{tc.clear}</Link></> : null}</p>
                  <ContactsTable key={`${kind}|${sp.q ?? ""}|${sp.rel ?? ""}|${tag ?? ""}|${imp ?? ""}|${page}`} rows={rows} total={total} filter={{ kind, ...(sp.q?.trim() ? { q: sp.q.trim() } : {}), ...(sp.rel ? { rel: sp.rel } : {}), ...(tag ? { tag } : {}), ...(imp ? { imp } : {}) }} knownTags={listTags.map((t) => t.tag)} selectAll={sp.select === "all"} />
                  {page > 0 || (page + 1) * PAGE < total ? (
                    <nav className="mlo-row-form mlo-actions" aria-label="Pages">
                      {page > 0 ? <Link href={qs({ p: String(page - 1) })} className="mlo-btn mlo-btn--ghost">Previous</Link> : null}
                      {(page + 1) * PAGE < total ? <Link href={qs({ p: String(page + 1) })} className="mlo-btn mlo-btn--ghost">Next</Link> : null}
                    </nav>
                  ) : null}
                </>
              )}
            </section>
            {ownTags.length ? (
              <section className="mlo-section" id="tags">
                <h2>{tc.tagsHeading}</h2>
                <p className="mlo-note">{scopeOf(me) === book ? tc.panelNote : tc.panelNoteTeam}</p>
                <datalist id="cc-own-tags">{ownTags.map((t) => <option key={t.tag} value={t.tag} />)}</datalist>
                <ul className="cc-tagadmin">
                  {ownTags.slice(0, 200).map((t) => (
                    <li key={t.tag} className="cc-tagadmin__row">
                      <div className="cc-tagadmin__head">
                        <Link href={tagHref(t.tag, kind)} className="cc-tag">{t.tag}</Link>
                        <span className="mlo-note">{t.count.toLocaleString("en-US")} {t.count === 1 ? "person" : "people"}</span>
                      </div>
                      <details className="mlo-details cc-tagadmin__change">
                        <summary>{tc.change}</summary>
                        <form action={renameTagAction.bind(null, kind, t.tag)} className="mlo-row-form">
                          <label className="mlo-field"><span>{tc.renameTo}</span><input name="to" defaultValue={t.tag} maxLength={80} required autoComplete="off" /></label>
                          <button type="submit" className="mlo-btn mlo-btn--ghost">{tc.rename}</button>
                        </form>
                        {ownTags.length > 1 ? (
                          <form action={mergeTagAction.bind(null, kind, t.tag)} className="mlo-row-form">
                            <label className="mlo-field"><span>{tc.mergeInto}</span><input name="into" list="cc-own-tags" placeholder={tc.mergePick} maxLength={80} required autoComplete="off" /></label>
                            <button type="submit" className="mlo-btn mlo-btn--ghost">{tc.merge}</button>
                          </form>
                        ) : null}
                        <form action={deleteTagAction.bind(null, kind, t.tag)} className="mlo-row-form">
                          <label className="mlo-field"><span>{tc.deleteConfirm(t.tag)}</span><input name="confirm" aria-label={tc.confirmLabel} maxLength={80} required autoComplete="off" /></label>
                          <button type="submit" className="mlo-btn mlo-btn--ghost">{tc.delete}</button>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
