import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ALL_MLOS } from "@/lib/config";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { canManage, ROLE_LABELS } from "@/lib/accounts/auth";
import { accountStore, ROLES } from "@/lib/accounts/store";
import { requireViewer } from "@/lib/mlo/page-auth";
import { singleCompany } from "@/lib/accounts/company";
import { contactStore } from "@/lib/contacts/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { conciergeStore } from "@/lib/concierge/store";
import { FlashBox, MloNav } from "../MloChrome";
import { inviteAction, resetMfaAction, updateAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team", robots: { index: false, follow: false } };

/** /mlo/team — accounts and roles (D1). Owners manage everyone; team leads manage loan officers and assistants. */
export default async function Team({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const store = accountStore();
  const [users, audit] = me ? await Promise.all([store.listUsers(), store.recentAudit(20)]) : [[], []];
  // D34: who has the second sign-in step on.
  const mfa = new Set((await Promise.all(users.map(async (u) => ((await store.getMfa(u.id))?.enabledAt ? u.id : null)))).filter(Boolean));
  const addable = me ? ROLES.filter((r) => canManage(me, r)) : [];
  // D22: per-book counts for the owner, never client details.
  const bookUsers = me?.role === "owner" ? users.filter((u) => u.role !== "assistant" && u.status === "active") : [];
  const bookCounts = await Promise.all(bookUsers.map(async (u) => ({ id: u.id, name: u.name, contacts: (await contactStore().list({ ownerUserId: u.id, limit: 1 })).total, loans: (await pipelineStore().list(u.id)).filter((l) => !l.closed && !l.dead).length, drafts: (await conciergeStore().proposals(u.id, "pending")).length })));
  const books = users.filter((u) => u.role !== "assistant" && u.status === "active");
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? "nobody yet";

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Team</h1>
        <MloNav current="team" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section">
            <p className="mlo-note">
              Managing the team needs your own account. <Link href="/sign-in">Sign in with your email</Link>.
            </p>
          </section>
        ) : (
          <>
            {addable.length ? (
              <section className="mlo-section">
                <h2>Add someone</h2>
                <form action={inviteAction} className="mlo-grid">
                  <label className="mlo-field"><span>Name</span><input name="name" required className="mlo-input" maxLength={80} /></label>
                  <label className="mlo-field"><span>Email</span><input name="email" type="email" required className="mlo-input" /></label>
                  <label className="mlo-field">
                    <span>Role</span>
                    <select name="role" className="mlo-select" defaultValue="lo">
                      {addable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </label>
                  <label className="mlo-field">
                    <span>Loan officer record (for loan officers)</span>
                    <select name="mloId" className="mlo-select" defaultValue="">
                      <option value="">None</option>
                      {ALL_MLOS.map((m) => <option key={m.id} value={m.id}>{m.name} · NMLS #{m.nmls}</option>)}
                    </select>
                  </label>
                  <label className="mlo-field">
                    <span>Works for (assistants only: they see just this loan officer&apos;s clients)</span>
                    <select name="assists" className="mlo-select" defaultValue="">
                      <option value="">Not an assistant</option>
                      {books.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="mlo-btn">Add and email a sign-in link</button>
                </form>
                <p className="mlo-note" style={{ marginTop: 8 }}>A new loan officer also needs a record in the site&apos;s licensing file (name, NMLS number, licenses) before they can be matched with borrowers.</p>
              </section>
            ) : null}
            <section className="mlo-section">
              <h2>People</h2>
              <table className="mlo-table">
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <th scope="row">
                        {u.name}
                        <br />
                        <span className="mlo-note">{u.email}</span>
                      </th>
                      <td>
                        <span className={`mlo-pill ${u.status === "disabled" ? "mlo-pill--off" : ""}`}>{u.status === "disabled" ? "Disabled" : ROLE_LABELS[u.role]}</span>
                        {u.role === "assistant" ? <><br /><span className="mlo-note">Works for {nameOf(u.assistsUserId)}</span></> : null}
                        <br /><span className="mlo-note">{mfa.has(u.id) ? "Code from phone: on" : "Code from phone: off"}</span>
                      </td>
                      <td>
                        {canManage(me, u.role) && u.id !== me.id ? (
                          <form action={updateAction} className="mlo-row-form">
                            <input type="hidden" name="userId" value={u.id} />
                            <select name="role" defaultValue={u.role} className="mlo-select" aria-label={`Role for ${u.name}`}>
                              {ROLES.filter((r) => canManage(me, r)).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                            {u.role === "assistant" ? (
                              <select name="assists" defaultValue={u.assistsUserId ?? ""} className="mlo-select" aria-label={`Who ${u.name} works for`}>
                                <option value="">Pick a loan officer</option>
                                {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            ) : null}
                            <select name="status" defaultValue={u.status} className="mlo-select" aria-label={`Status for ${u.name}`}>
                              <option value="active">Active</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Save</button>
                            {mfa.has(u.id) ? <button type="submit" formAction={resetMfaAction.bind(null, u.id)} className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Reset phone code</button> : null}
                          </form>
                        ) : (
                          <span className="mlo-note">{u.id === me.id ? "You" : ""}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {me.role === "owner" ? (
              <section className="mlo-section">
                <h2>Books</h2>
                <p className="mlo-note">{singleCompany() ? "Every loan officer is under one sponsor, so you can open any book." : "Loan officers here are under more than one sponsoring company, so client details stay inside each book: you see counts only."}</p>
                <table className="mlo-table">
                  <thead><tr><th>Loan officer</th><th>Contacts</th><th>Active loans</th><th>Drafts waiting</th></tr></thead>
                  <tbody>
                    {bookCounts.map((b) => (
                      <tr key={b.id}><th scope="row">{b.name}</th><td>{b.contacts}</td><td>{b.loans}</td><td>{b.drafts}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
            {me.role === "owner" ? (
              <section className="mlo-section">
                <h2>Recent activity</h2>
                <table className="mlo-table">
                  <tbody>
                    {audit.map((a, i) => (
                      <tr key={i}>
                        <th scope="row">{new Date(a.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</th>
                        <td>{a.actor}</td>
                        <td>{a.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
