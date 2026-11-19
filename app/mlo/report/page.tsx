import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { LABELS, weeklyFor, type WeekNumbers } from "@/lib/report/weekly";
import { MloNav } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly report", robots: { index: false, follow: false } };

/** /mlo/report — the last 7 days, next to the 7 before (D27). */
export default async function Report() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const w = me ? await weeklyFor(me) : null;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Your week</h1>
        <MloNav current="report" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        {!me || !w ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your report.</p></section>
        ) : (
          <section className="mlo-section">
            <h2>{w.from} to {w.to}</h2>
            <table className="mlo-table">
              <thead><tr><th></th><th>Last 7 days</th><th>The 7 before</th></tr></thead>
              <tbody>
                {(Object.keys(LABELS) as (keyof WeekNumbers)[]).map((k) => (
                  <tr key={k}><th scope="row">{LABELS[k]}</th><td>{w.week[k]}</td><td className="mlo-note">{w.before[k]}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mlo-note" style={{ marginTop: 8 }}>Turn on the Monday email in your <Link href="/mlo/concierge">Concierge settings</Link>.</p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
