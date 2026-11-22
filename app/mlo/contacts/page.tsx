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
import { ADDED_DAYS, CONTACTED, describeRule, hasLoanRule, isEmptyRule, PERMISSIONS, ruleFromParams, ruleToParams } from "@/lib/contacts/filter";
import { LOAN_PROGRAMS, LOAN_PURPOSES, loanLine, RATE_TYPES } from "@/lib/contacts/loan";
import AskList from "./AskList";
import { currentList, listsFor } from "@/lib/contacts/lists";
import { listImports } from "@/lib/contacts/imports";
import { assignees } from "@/lib/contacts/bulk";
import { campaignStore } from "@/lib/campaigns/store";
import { US_STATES } from "@/lib/us-states";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { deleteListAction, freezeListAction, renameListAction, saveListAction } from "./actions";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contacts", robots: { index: false, follow: false } };

const PAGE = 50;

/** /mlo/contacts — the loan officer's people (D2). Loan officers see their own; leads and the owner see the team's. */
export default async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  // D78: the page's filters are one rule (lib/contacts/filter.ts): kind, search, relationship, tag, state,
  // permission, added (days or one import), last contacted and never replied. A saved list is the same rule.
  const rule = ruleFromParams(sp);
  const kind = rule.kind ?? "contact";
  const page = Math.max(0, Number(sp.p) || 0);
  const me = v.user;
  const store = contactStore();
  const tag = rule.tagsAny?.[0];
  const imp = rule.importId;
  const now = new Date();
  const { contacts, total } = me ? await store.list({ ownerUserId: scopeOf(me), rule, now, limit: PAGE, offset: page * PAGE }) : { contacts: [], total: 0 };
  // D73: tags in the list's scope (the chip row) and in the viewer's own book (the Tags panel).
  const book = me ? tagBook(me) : null;
  const listTags = me ? await store.tagCounts(scopeOf(me), kind) : [];
  const ownTags = !book ? [] : scopeOf(me!) === book ? listTags : await store.tagCounts(book, kind);
  const rowTags = listTags.slice(0, 12);
  if (tag && !rowTags.some((t) => t.tag === tag)) rowTags.push({ tag, count: total });
  const consents = await store.consentsFor(contacts.map((c) => c.id));
  // D75: counted in the database (before, only the first 500 people were looked at).
  const held = me ? await store.countLocked(me.id) : 0;
  // D78: saved lists (the four built in, then the viewer's own), and what the bulk bar offers.
  const lists = me ? await listsFor(me) : [];
  const current = currentList(lists, rule);
  const filtered = !isEmptyRule(rule);
  const recentImports = me ? (await listImports(me, 10)).filter((r) => r.kind === (kind === "agent" ? "agents" : "contacts")) : [];
  const campaigns = me ? (await campaignStore().campaigns(me.id)).map((c) => ({ id: c.id, name: c.name, status: c.status })) : [];
  const team = me ? (await assignees(me)).map((u) => ({ id: u.id, name: u.name || u.email })) : [];
  const params = ruleToParams(rule);
  const qs = (extra: Record<string, string>, drop: string[] = []) => {
    const u = new URLSearchParams({ ...params, ...extra });
    for (const k of drop) u.delete(k);
    const s = u.toString();
    return s ? `/mlo/contacts?${s}` : "/mlo/contacts";
  };
  const ruleQs = new URLSearchParams(params).toString();
  const chips = describeRule(rule, { relationship: RELATIONSHIP_LABELS, permission: lc.permissionLabels, chip: lc.chip });
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  // D80: a list about loans shows each person's loan line (their own closed rate, for the loan officer only).
  const loanList = hasLoanRule(rule);
  const asked = sp.asked === "m8" || sp.asked === "words" ? sp.asked : null;
  const askedQs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...params, ...extra });
    return `/mlo/contacts?${u.toString()}`;
  };
  const listHref = (r: typeof rule) => {
    const s = new URLSearchParams(ruleToParams(r)).toString();
    return s ? `/mlo/contacts?${s}` : "/mlo/contacts";
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
      ...(loanList && c.kind === "contact" ? { loan: loanLine(c.loan) || lc.loan.notSet } : {}),
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
            {lists.length ? (
              <nav className="cc-tagrow cc-listrow" aria-label={lc.lists}>
                <span className="cc-tagrow__label">{lc.lists}</span>
                <Link href="/mlo/contacts" className="cc-tag" aria-current={!filtered && kind === "contact" ? "page" : undefined}>{lc.everyone}</Link>
                {lists.map((l) => (
                  <Link key={l.id} href={listHref(l.rule)} className="cc-tag" aria-current={current?.id === l.id ? "page" : undefined}>{l.name}</Link>
                ))}
              </nav>
            ) : null}
            <AskList key={`${ruleQs}|${asked ?? ""}`} rule={rule} asked={asked} />
            <form className="mlo-row-form" action="/mlo/contacts" method="get">
              {Object.entries(params).filter(([k]) => k !== "q").map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
              <input name="q" defaultValue={rule.q ?? ""} placeholder="Search name, phone, email, city, tag" className="mlo-input" aria-label="Search" style={{ flex: "1 1 240px" }} />
              <button type="submit" className="mlo-btn mlo-btn--ghost">Search</button>
              <Link href={`/mlo/contacts/import${kind === "agent" ? "?kind=agents" : ""}`} className="mlo-btn">Import contacts</Link>
            </form>
            <details className="mlo-details cc-filters" id="filters">
              <summary>{lc.filtersOn(chips.filter((c) => c.key !== "q").length)}</summary>
              <form action="/mlo/contacts" method="get" className="cc-filters__form">
                {kind === "agent" ? <input type="hidden" name="kind" value="agent" /> : null}
                {rule.q ? <input type="hidden" name="q" value={rule.q} /> : null}
                {kind === "contact" ? (
                  <label className="mlo-field"><span>{lc.relationship}</span>
                    <select name="rel" defaultValue={rule.relationship ?? ""} className="mlo-select">
                      <option value="">{lc.any}</option>
                      {Object.entries(RELATIONSHIP_LABELS).filter(([k]) => k !== "agent").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="mlo-field"><span>{lc.tag}</span>
                  <select name="tag" defaultValue={tag ?? ""} className="mlo-select">
                    <option value="">{lc.any}</option>
                    {[...new Set([...(tag ? [tag] : []), ...listTags.slice(0, 200).map((t) => t.tag)])].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="mlo-field"><span>{lc.state}</span>
                  <select name="state" defaultValue={rule.state ?? ""} className="mlo-select">
                    <option value="">{lc.any}</option>
                    {US_STATES.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
                  </select>
                </label>
                <label className="mlo-field"><span>{lc.permission}</span>
                  <select name="perm" defaultValue={rule.permission ?? ""} className="mlo-select" aria-describedby="cc-perm-note">
                    <option value="">{lc.any}</option>
                    {PERMISSIONS.map((p) => <option key={p} value={p}>{lc.permissionLabels[p]}</option>)}
                  </select>
                </label>
                <label className="mlo-field"><span>{lc.added}</span>
                  <select name="added" defaultValue={rule.importId ?? (rule.addedWithinDays ? String(rule.addedWithinDays) : "")} className="mlo-select">
                    <option value="">{lc.any}</option>
                    {ADDED_DAYS.map((d) => <option key={d} value={String(d)}>{lc.addedLabels[d]}</option>)}
                    {recentImports.map((r) => <option key={r.id} value={r.id}>{lc.addedImport(dateOf(r.at), r.files.slice(0, 2).join(", "))}</option>)}
                    {rule.importId && !recentImports.some((r) => r.id === rule.importId) ? <option value={rule.importId}>{lc.chip.importOne}</option> : null}
                  </select>
                </label>
                <label className="mlo-field"><span>{lc.contacted}</span>
                  <select name="contacted" defaultValue={params.contacted ?? ""} className="mlo-select">
                    <option value="">{lc.any}</option>
                    {CONTACTED.map((c) => <option key={c} value={c}>{lc.contactedLabels[c]}</option>)}
                  </select>
                </label>
                {kind === "contact" ? (
                  <>
                    <p className="cc-filters__sub">{lc.loanFilters}</p>
                    <label className="mlo-field"><span>{lc.programLabel}</span>
                      <select name="prog" defaultValue={rule.program?.join(",") ?? ""} className="mlo-select">
                        <option value="">{lc.any}</option>
                        {rule.program && rule.program.length > 1 ? <option value={rule.program.join(",")}>{rule.program.map((p) => lc.loan.programs[p]).join(" or ")}</option> : null}
                        {LOAN_PROGRAMS.map((p) => <option key={p} value={p}>{lc.loan.programs[p]}</option>)}
                      </select>
                    </label>
                    <label className="mlo-field"><span>{lc.rateTypeLabel}</span>
                      <select name="rtype" defaultValue={rule.rateType ?? ""} className="mlo-select">
                        <option value="">{lc.any}</option>
                        {RATE_TYPES.map((t) => <option key={t} value={t}>{lc.loan.rateTypes[t]}</option>)}
                      </select>
                    </label>
                    <label className="mlo-field"><span>{lc.rateMinLabel}</span><input name="rmin" type="number" step="0.001" min="0" max="19.999" inputMode="decimal" defaultValue={rule.rateMin ?? ""} className="mlo-input" /></label>
                    <label className="mlo-field"><span>{lc.rateMaxLabel}</span><input name="rmax" type="number" step="0.001" min="0" max="19.999" inputMode="decimal" defaultValue={rule.rateMax ?? ""} className="mlo-input" /></label>
                    <label className="mlo-field"><span>{lc.closedFromLabel}</span><input name="cfrom" type="date" defaultValue={rule.closedFrom ?? ""} className="mlo-input" /></label>
                    <label className="mlo-field"><span>{lc.closedToLabel}</span><input name="cto" type="date" defaultValue={rule.closedTo ?? ""} className="mlo-input" /></label>
                    <label className="mlo-field"><span>{lc.hasClosedLabel}</span>
                      <select name="closed" defaultValue={rule.hasClosedDate === undefined ? "" : rule.hasClosedDate ? "1" : "0"} className="mlo-select">
                        <option value="">{lc.any}</option>
                        {Object.entries(lc.hasClosedOptions).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </label>
                    <label className="mlo-field"><span>{lc.purposeLabel}</span>
                      <select name="purpose" defaultValue={rule.purpose ?? ""} className="mlo-select">
                        <option value="">{lc.any}</option>
                        {LOAN_PURPOSES.map((p) => <option key={p} value={p}>{lc.loan.purposes[p]}</option>)}
                      </select>
                    </label>
                    {rule.armChangeWithinDays ? <input type="hidden" name="armdays" value={rule.armChangeWithinDays} /> : null}
                    {rule.lender ? <input type="hidden" name="lender" value={rule.lender} /> : null}
                    {rule.amountMin !== undefined ? <input type="hidden" name="amin" value={rule.amountMin} /> : null}
                    {rule.amountMax !== undefined ? <input type="hidden" name="amax" value={rule.amountMax} /> : null}
                  </>
                ) : null}
                <label className="mlo-check cc-filters__check">
                  <input type="checkbox" name="noreply" value="1" defaultChecked={!!rule.neverReplied} />
                  <span>{lc.noReplyBox}</span>
                </label>
                <p className="mlo-note cc-filters__note" id="cc-perm-note">{lc.permissionNote}</p>
                <div className="mlo-actions cc-filters__go">
                  <button type="submit" className="mlo-btn">{lc.apply}</button>
                  <Link href={kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"} className="mlo-btn mlo-btn--ghost">{lc.clearAll}</Link>
                </div>
              </form>
            </details>
            {chips.length ? (
              <noscript>
                <ul className="cc-rulechips" aria-label={lc.filters}>
                  {chips.map((c) => (
                    <li key={`${c.key}|${c.label}`}>
                      <Link href={qs({}, c.key.split(","))} className="cc-tag" aria-label={lc.remove(c.label)}>{c.label} <span aria-hidden="true">×</span></Link>
                    </li>
                  ))}
                </ul>
              </noscript>
            ) : null}
            {filtered && !current ? (
              <form action={saveListAction.bind(null, ruleQs)} className="cc-savelist" id="save-list">
                <div className="mlo-row-form">
                  <label className="mlo-field"><span>{lc.saveTitle}</span><input name="name" maxLength={60} required placeholder={lc.savePlaceholder} autoComplete="off" /></label>
                  <button type="submit" className="mlo-btn mlo-btn--ghost">{lc.save}</button>
                </div>
                <label className="mlo-check cc-savelist__freeze">
                  <input type="checkbox" name="freeze" value="yes" />
                  <span>{lc.freezeBox}</span>
                </label>
              </form>
            ) : null}
            {current && !current.builtIn ? (
              <details className="mlo-details cc-savelist">
                <summary>{lc.manage}</summary>
                <p className="mlo-note">{current.frozenAt ? lc.frozenLabel(dateOf(current.frozenAt)) : lc.liveLabel}</p>
                <form action={renameListAction.bind(null, current.id, ruleQs)} className="mlo-row-form">
                  <label className="mlo-field"><span>{lc.renameTo}</span><input name="name" defaultValue={current.name} maxLength={60} required autoComplete="off" /></label>
                  <button type="submit" className="mlo-btn mlo-btn--ghost">{lc.rename}</button>
                </form>
                {!current.frozenAt ? (
                  <form action={freezeListAction.bind(null, current.id)} className="mlo-row-form">
                    <p className="mlo-note">{lc.freezeNote}</p>
                    <button type="submit" className="mlo-btn mlo-btn--ghost">{lc.freeze}</button>
                  </form>
                ) : null}
                <form action={deleteListAction.bind(null, current.id, kind)} className="mlo-row-form">
                  <p className="mlo-note">{lc.deleteNote}</p>
                  <button type="submit" className="mlo-btn mlo-btn--ghost">{lc.deleteList}</button>
                </form>
              </details>
            ) : null}
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
              {total === 0 && filtered ? (
                <p className="mlo-note">Nobody matches. <Link href={kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"}>See everyone</Link>.</p>
              ) : total === 0 ? (
                <p className="mlo-note">
                  Nobody here yet. <Link href={`/mlo/contacts/import${kind === "agent" ? "?kind=agents" : ""}`}>Import contacts</Link> to start.
                </p>
              ) : (
                <>
                  <p className="mlo-note cc-resultline">
                    {current ? <strong>{current.name}: </strong> : null}
                    {imp && chips.length === 1 ? tc.fromImport(total) : tag && chips.length === 1 ? tc.tagged(tag, total) : lc.count(total)}
                    {imp ? <> · <Link href="/mlo/contacts/import/history">{tc.importHistory}</Link></> : null}
                    {filtered && !current ? <> · <a href="#save-list">{lc.ask.saveAs}</a></> : null}
                    {filtered ? <> · <Link href={askedQs({ select: "all", act: "campaign" })}>{lc.ask.addToCampaign}</Link></> : null}
                    {filtered ? <> · <Link href={current ? `/mlo/calls?list=${encodeURIComponent(current.id)}` : `/mlo/calls?from=filter&${ruleQs}`}>{lc.callList}</Link></> : null}
                    {filtered ? <> · <Link href={askedQs({ select: "all", act: "download" })}>{lc.ask.download}</Link></> : null}
                    {total > 0 && sp.select !== "all" ? <> · <Link href={qs({ select: "all" })}>{lc.selectList}</Link></> : null}
                    {filtered ? <> · <Link href={kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"}>{tc.clear}</Link></> : null}
                  </p>
                  {loanList ? <p className="mlo-note cc-ratenote">{lc.ask.rateNote}</p> : null}
                  <ContactsTable
                    key={`${ruleQs}|${page}|${sp.select ?? ""}|${sp.act ?? ""}`}
                    initialAction={sp.act === "campaign" || sp.act === "download" ? sp.act : undefined}
                    rows={rows}
                    total={total}
                    rule={rule}
                    knownTags={listTags.map((t) => t.tag)}
                    selectAll={sp.select === "all"}
                    campaigns={campaigns}
                    team={team}
                    canDelete={me.role !== "assistant"}
                  />
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
