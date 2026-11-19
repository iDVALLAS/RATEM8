import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { listSignUps } from "@/lib/registry/service";
import { nmlsRecordUrl } from "@/lib/registry/cache";
import { usStateName } from "@/lib/us-states";
import type { SignUp } from "@/lib/registry/store";
import { FlashBox } from "../MloChrome";
import { approveAction, declineAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign-ups", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "");
const companyUrl = (nmls: string) => `https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/${encodeURIComponent(nmls)}`;

function Details({ s }: { s: SignUp }) {
  return (
    <table className="mlo-table" style={{ marginTop: 8 }}>
      <tbody>
        <tr><th scope="row">Email</th><td>{s.email}{s.phone ? ` · ${s.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}` : ""}</td></tr>
        <tr><th scope="row">NMLS ID</th><td>{s.nmls} · <a href={nmlsRecordUrl(s.nmls)} target="_blank" rel="noopener noreferrer">Open their NMLS record</a></td></tr>
        <tr><th scope="row">Sponsor</th><td>{s.sponsorName}, NMLS {s.sponsorNmls} · <a href={companyUrl(s.sponsorNmls)} target="_blank" rel="noopener noreferrer">Company record</a><br /><span className="mlo-note">{s.sponsorAddress}</span></td></tr>
        <tr><th scope="row">Licensed in</th><td>{s.licenses.map((l) => `${usStateName(l.state) ?? l.state}${l.license ? ` (${l.license})` : ""}`).join(", ")}</td></tr>
        <tr><th scope="row">Links</th><td>{s.calendly || "No booking link"} · {s.applicationUrl || "No application link"}</td></tr>
        {s.heardFrom ? <tr><th scope="row">Heard from</th><td>{s.heardFrom}</td></tr> : null}
        <tr><th scope="row">Outside systems</th><td>{s.sponsorAllows ? "Their sponsor allows client contacts in an outside system." : <strong>Their sponsor doesn&apos;t, or they aren&apos;t sure.</strong>}</td></tr>
      </tbody>
    </table>
  );
}

/** /mlo/signups — the owner checks each sign-up's NMLS record and approves it (D45). */
export default async function SignUps({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireAdminPage();
  const me = v.user;
  const h = await headers();
  const link = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/sign-up`;
  if (!me || me.role !== "owner") {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Sign-ups</h1><p className="mlo-note">Only the owner reviews sign-ups{me ? "" : <>. <Link href="/sign-in">Sign in with your email</Link></>}.</p></div>
      </PageShell>
    );
  }
  const all = await listSignUps(me);
  const pending = all.filter((s) => s.status === "pending");
  const waiting = all.filter((s) => s.status === "unconfirmed");
  const done = all.filter((s) => s.status === "approved" || s.status === "declined");
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Sign-ups</h1>
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note">Loan officers sign themselves up at <a href={link}>{link}</a>. Send that link to anyone you want in the pilot. Each one confirms their email, then waits here for you.</p>
          <p className="mlo-note" style={{ marginTop: 8 }}>For each one, open their NMLS record and check that the name, NMLS ID, the states they listed (each license active) and the sponsoring company all match. Command Center never looks the record up itself, because NMLS Consumer Access doesn&apos;t allow automated lookups. A RETR check can take this step later.</p>
        </section>

        <section className="mlo-section">
          <h2>Waiting for you ({pending.length})</h2>
          {pending.length === 0 ? <p className="mlo-note">Nothing waiting.</p> : (
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
              {pending.map((s) => (
                <li key={s.id} className="cc-card">
                  <p className="cc-card__title">{s.name} · NMLS {s.nmls} · signed up {when(s.createdAt)}</p>
                  <Details s={s} />
                  {s.sponsorAllows ? (
                    <form action={approveAction.bind(null, s.id)} className="mlo-grid" style={{ marginTop: 12 }}>
                      <label className="su-check" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" name="checked" required style={{ marginTop: 4 }} /> <span>I opened their NMLS record and it matches: name, NMLS ID, every state listed and the sponsor.</span></label>
                      <button type="submit" className="mlo-btn">Approve and send their sign-in link</button>
                    </form>
                  ) : (
                    <p className="mlo-flash mlo-flash--err" style={{ marginTop: 12 }}>Can&apos;t approve one person here: their company would need to allow client data in an outside system. Talk to {s.sponsorName} about a company-wide plan.</p>
                  )}
                  <details className="mlo-details" style={{ marginTop: 10 }}>
                    <summary>Decline</summary>
                    <form action={declineAction.bind(null, s.id)} className="mlo-grid">
                      <label className="mlo-field"><span>Note to them (emailed)</span><textarea name="note" rows={2} maxLength={1000} className="mlo-textarea" defaultValue={s.sponsorAllows ? "" : `For now, Command Center has to be set up with ${s.sponsorName} as a company. We'll reach out to them.`} /></label>
                      <button type="submit" className="mlo-btn mlo-btn--ghost">Decline</button>
                    </form>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>

        {waiting.length ? (
          <section className="mlo-section">
            <h2>Haven&apos;t confirmed their email ({waiting.length})</h2>
            <ul className="mlo-note" style={{ paddingLeft: 18 }}>{waiting.map((s) => <li key={s.id}>{s.name} · {s.email} · {when(s.createdAt)}</li>)}</ul>
          </section>
        ) : null}

        <section className="mlo-section">
          <h2>Decided ({done.length})</h2>
          {done.length === 0 ? <p className="mlo-note">None yet.</p> : (
            <table className="mlo-table">
              <thead><tr><th>Who</th><th>Decision</th><th>Checked by</th></tr></thead>
              <tbody>
                {done.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}<br /><span className="mlo-note">NMLS {s.nmls} · {s.sponsorName}</span></td>
                    <td>{s.status === "approved" ? "Approved" : "Declined"} {when(s.decidedAt)}{s.note ? <><br /><span className="mlo-note">{s.note}</span></> : null}</td>
                    <td>{s.verifiedBy === "human" ? `A person (${s.decidedBy})` : s.verifiedBy === "retr" ? "RETR" : s.decidedBy ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageShell>
  );
}
