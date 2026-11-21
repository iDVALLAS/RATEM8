import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import { accountStore } from "@/lib/accounts/store";
import { ROLE_LABELS } from "@/lib/accounts/auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { pilotOn, pilotOverview, refOf, reportInbox, reportsFor } from "@/lib/pilot/service";
import { REPORT_KINDS, REPORT_STATUS, type ReportStatus } from "@/lib/pilot/store";
import { FlashBox } from "../MloChrome";
import { pilotInviteAction, triageAction } from "../pilot-actions";
import { invitedWaiting, MAX_INVITES } from "@/lib/pilot/invite";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pilot", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "Never");
const ORDER: ReportStatus[] = ["open", "seen", "fixed", "wontfix"];

/** /mlo/pilot — who's set up, who's signed in, and every problem reported (D44). */
export default async function Pilot({ searchParams }: { searchParams: Promise<{ f?: string; all?: string }> }) {
  const { f, all } = await searchParams;
  const v = await requireAdminPage();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Pilot</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see the pilot.</p></div>
      </PageShell>
    );
  }
  const [rows, reports, users] = await Promise.all([pilotOverview(me), reportsFor(me), accountStore().listUsers()]);
  const nameOf = new Map(users.map((u) => [u.id, u.name || u.email]));
  const shown = (all ? reports : reports.filter((r) => r.status === "open" || r.status === "seen")).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.at.localeCompare(a.at));
  const inbox = reportInbox();
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="pilot" title="Pilot" />
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note">
            Everyone you manage, how far they are through their first day, and what they&apos;ve reported. New reports are emailed to {inbox ? "the owner's sign-in address" : "nobody yet (set MLO_OWNER_EMAIL)"}, with Reply-To set to the loan officer so you can answer straight from your inbox.
            {pilotOn() ? " The Pilot label shows in everyone's top bar while CC_PILOT is \"true\"." : " Set CC_PILOT to \"true\" in Vercel to show a Pilot label in everyone's top bar and the pilot welcome."}
          </p>
          <p className="mlo-row-form" style={{ marginTop: 10 }}>
            <Link className="mlo-btn" href="/mlo/signups">Sign-ups to review</Link>
            <Link className="mlo-btn mlo-btn--ghost" href="/mlo/team">Invite someone directly</Link>
            <Link className="mlo-btn mlo-btn--ghost" href="/mlo/welcome">See what they see</Link>
          </p>
        </section>

        <section className="mlo-section" id="invite">
          <h2>Invite loan officers to the pilot</h2>
          <form action={pilotInviteAction} className="mlo-grid">
            <label className="mlo-field">
              <span>One per line: a name and email, or just the email (up to {MAX_INVITES} at a time)</span>
              <textarea name="people" rows={4} className="mlo-textarea" required placeholder={"Ann Lee, ann@example.com\nbo@example.com"} />
            </label>
            <button type="submit" className="mlo-btn">Email their invites</button>
          </form>
          <p className="mlo-note">Each person gets their own sign-up link (good for 14 days) with their name and email filled in. They add their NMLS ID, sponsoring company and states, and it comes straight to <Link href="/mlo/signups">Sign-ups</Link> marked Invited. Open their NMLS record, tick the box, approve: they get their sign-in link. {(await invitedWaiting().catch(() => 0)) ? <strong>{await invitedWaiting()} invited sign-up(s) waiting for you now.</strong> : null}</p>
          <p className="mlo-note">Assistants, or a loan officer whose record is already in Command Center: use <Link href="/mlo/team">People &amp; roles</Link>, Add someone.</p>
        </section>

        <section className="mlo-section">
          <h2>People ({rows.length})</h2>
          {rows.length === 0 ? <p className="mlo-note">No one yet. Invite your pilot loan officers on Team.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table className="mlo-table">
                <thead><tr><th>Who</th><th>Last sign-in</th><th>First day</th><th>Reports</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user.id}>
                      <td>{r.user.name || r.user.email}<br /><span className="mlo-note">{ROLE_LABELS[r.user.role]} · {r.user.email}{r.user.mloId ? "" : " · no loan officer record"}</span></td>
                      <td>{when(r.lastSignIn)}</td>
                      <td>{r.firstDay} of {r.steps}</td>
                      <td>{r.open ? <strong>{r.open} open</strong> : "None open"}{r.total ? <span className="mlo-note"> · {r.total} total</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mlo-section" id="reports">
          <h2>{all ? `Every report (${reports.length})` : `Open reports (${shown.length})`}</h2>
          <p className="mlo-note"><Link href={all ? "/mlo/pilot#reports" : "/mlo/pilot?all=1#reports"}>{all ? "Show open only" : `Show all ${reports.length}`}</Link></p>
          {shown.length === 0 ? <p className="mlo-note">Nothing open.</p> : (
            <ol className="ex-drafts" style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
              {shown.map((r) => (
                <li key={r.id} className="cc-card">
                  <p className="cc-card__title">{refOf(r.id)} · {REPORT_KINDS[r.kind]} · {nameOf.get(r.userId) ?? "Someone"} · {when(r.at)}</p>
                  <p className="mlo-note">Page <a href={r.path}>{r.path}</a>{r.width ? ` · ${r.width}px wide` : ""}{r.theme ? ` · ${r.theme}` : ""}</p>
                  <p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{r.message}</p>
                  <form action={triageAction.bind(null, r.id)} className="mlo-grid">
                    <label className="mlo-field" style={{ maxWidth: 240 }}><span>Status</span>
                      <select name="status" defaultValue={r.status} className="mlo-select">
                        {ORDER.map((s) => <option key={s} value={s}>{REPORT_STATUS[s]}</option>)}
                      </select>
                    </label>
                    <label className="mlo-field"><span>Note to them (emailed when you save)</span><textarea name="note" rows={2} maxLength={1000} defaultValue={r.note} className="mlo-textarea" /></label>
                    <button type="submit" className="mlo-btn">Save</button>
                  </form>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PageShell>
  );
}
