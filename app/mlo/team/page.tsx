import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ALL_MLOS } from "@/lib/config";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { canManage, ROLE_LABELS } from "@/lib/accounts/auth";
import { accountStore, ROLES } from "@/lib/accounts/store";
import { requireViewer } from "@/lib/mlo/page-auth";
import { FlashBox, MloNav } from "../MloChrome";
import { inviteAction, updateAction } from "./actions";
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
  const addable = me ? ROLES.filter((r) => canManage(me, r)) : [];

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
                      </td>
                      <td>
                        {canManage(me, u.role) && u.id !== me.id ? (
                          <form action={updateAction} className="mlo-row-form">
                            <input type="hidden" name="userId" value={u.id} />
                            <select name="role" defaultValue={u.role} className="mlo-select" aria-label={`Role for ${u.name}`}>
                              {ROLES.filter((r) => canManage(me, r)).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                            <select name="status" defaultValue={u.status} className="mlo-select" aria-label={`Status for ${u.name}`}>
                              <option value="active">Active</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Save</button>
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
