import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { hasApplicationUrl, mloById } from "@/lib/config";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { textSender } from "@/lib/texting/service";
import { firstDay, liveStatus, pilotOn, refOf, reportsFor } from "@/lib/pilot/service";
import { REPORT_KINDS, REPORT_STATUS } from "@/lib/pilot/store";
import FirstDay from "../FirstDay";
import { ReportForm } from "../ReportProblem";
import { firstDayAction } from "../pilot-actions";
import { linksAction } from "../signups/actions";
import { companyDetails } from "@/lib/accounts/company";
import { decodeFlash } from "@/lib/mlo/flash";
import { FlashBox } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Getting started", robots: { index: false, follow: false } };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

/** /mlo/welcome — the first-day guide for a new loan officer (D44). */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Getting started</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your first-day steps.</p></div>
      </PageShell>
    );
  }
  const pilot = pilotOn();
  const [first, mine] = await Promise.all([firstDay(me), reportsFor(me)]);
  const own = mine.filter((r) => r.userId === me.id);
  const mlo = mloById(me.mloId);
  const live = liveStatus(me, !!(await textSender(companyOfMlo(me.mloId), singleCompany())));
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">{pilot ? "Welcome to the pilot" : "Getting started"}</h1>
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note">
            {pilot
              ? "You're one of the first loan officers using Command Center with your real book. Some things will change because of what you tell us, so if anything is broken, confusing or missing, say so with Report a problem. It's at the bottom right of every page, under your initials, and in More on a phone."
              : "Six steps get you working. Each one checks itself off when it's done."}
          </p>
        </section>

        <FirstDay steps={first.steps} done={first.done} pilot={pilot} canHide={false} />
        {first.hidden ? (
          <form action={firstDayAction.bind(null, false)} style={{ marginTop: 10 }}>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Show it on Home again</button>
          </form>
        ) : null}

        <section className="mlo-section" id="details">
          <h2>Your details</h2>
          {!mlo ? (
            <p className="mlo-note">Your account isn&apos;t linked to a loan officer record yet, so nothing can be sent in your name. Ask the owner to link it; until then you can look around and import your contacts.</p>
          ) : (
            <>
              <p className="mlo-note">These go on every email and text you send{mlo.source === "signup" ? `, with ${companyDetails(mlo).name} and its address in every email footer` : ""}. If your name, NMLS ID, licenses or sponsor are wrong, report it and the owner will fix it.</p>
              <table className="mlo-table" style={{ marginTop: 10 }}>
                <tbody>
                  <tr><th scope="row">Name</th><td>{mlo.name}</td></tr>
                  <tr><th scope="row">NMLS</th><td>{mlo.nmls}</td></tr>
                  {mlo.licenses.map((l) => (
                    <tr key={l.state}><th scope="row">{l.state} license</th><td>{l.license} · sponsored by {l.sponsor.name} ({l.sponsor.idLabel} {l.sponsor.idNumber})</td></tr>
                  ))}
                  <tr><th scope="row">Booking link</th><td>{/^https:\/\//.test(mlo.calendly) ? <a href={mlo.calendly} target="_blank" rel="noopener noreferrer">{mlo.calendly}</a> : "Not set yet"}</td></tr>
                  <tr><th scope="row">Application link</th><td>{hasApplicationUrl(mlo) ? <a href={mlo.applicationUrl} target="_blank" rel="noopener noreferrer">{mlo.applicationUrl}</a> : "Not set yet"}</td></tr>
                </tbody>
              </table>
              {mlo.source === "signup" ? (
                <form action={linksAction} className="mlo-grid" style={{ marginTop: 14 }}>
                  <label className="mlo-field"><span>Booking link (https://)</span><input name="calendly" type="url" maxLength={300} defaultValue={mlo.calendly} className="mlo-input" /></label>
                  <label className="mlo-field"><span>Secure application or document upload link (https://)</span><input name="applicationUrl" type="url" maxLength={300} defaultValue={hasApplicationUrl(mlo) ? mlo.applicationUrl : ""} className="mlo-input" /></label>
                  <label className="mlo-field"><span>Phone</span><input name="phone" type="tel" maxLength={30} defaultValue={mlo.phone ?? ""} className="mlo-input" /></label>
                  <button type="submit" className="mlo-btn">Save my links</button>
                </form>
              ) : null}
            </>
          )}
        </section>

        <section className="mlo-section">
          <h2>What works right now</h2>
          <ul className="cc-live">
            {live.map((x) => (
              <li key={x.label}>
                <span className={`cc-live__state ${x.on ? "cc-live__state--on" : "cc-live__state--off"}`}>{x.on ? "On" : "Not yet"}</span>
                <span><strong>{x.label}.</strong> {x.on ? x.onText : x.offText}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mlo-section">
          <h2>Who sees your work</h2>
          <ul className="mlo-note" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Your contacts, loans and messages: you, and an assistant if you&apos;re paired with one.{singleCompany() ? " The platform owner can also see them while every loan officer is under one sponsoring company." : " Loan officers at other sponsoring companies never see them, and neither does the owner."} Other loan officers never see your book.</li>
            <li>Your expenses: only you.</li>
            <li>Nothing is ever sent without you. Every text and email the Concierge drafts waits for your OK, and each one is re-checked against your contact rules when you approve it.</li>
            <li>Reports you send here go to the owner, with phone numbers, other people&apos;s emails and anything like an SSN, date of birth or account number masked first.</li>
          </ul>
        </section>

        <section className="mlo-section" id="report">
          <h2>Report a problem</h2>
          <ReportForm />
        </section>

        <section className="mlo-section" id="reports">
          <h2>What you&apos;ve reported ({own.length})</h2>
          {own.length === 0 ? <p className="mlo-note">Nothing yet.</p> : (
            <table className="mlo-table">
              <thead><tr><th>Sent</th><th>What</th><th>Status</th></tr></thead>
              <tbody>
                {own.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.at)}<br /><span className="mlo-note">{refOf(r.id)}</span></td>
                    <td>{REPORT_KINDS[r.kind]} · <span className="mlo-note">{r.path}</span><br />{r.message.length > 160 ? `${r.message.slice(0, 160)}…` : r.message}</td>
                    <td>{REPORT_STATUS[r.status]}{r.note ? <><br /><span className="mlo-note">{r.note}</span></> : null}</td>
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
