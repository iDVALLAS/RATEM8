import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { DEFAULT_RULE, ruleFor, STATE_ZONES } from "@/lib/send-gate/rules";
import { usStateName } from "@/lib/us-states";
import { MloNav } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact rules", robots: { index: false, follow: false } };

const h = (n: number) => `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? "AM" : "PM"}`;

/** /mlo/rules — the per-state rules the send gate applies (D3). Read-only; values are in lib/send-gate/rules.ts. */
export default async function Rules() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const states = Object.keys(STATE_ZONES).sort();
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Contact rules</h1>
        <MloNav current="rules" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        <section className="mlo-section">
          <h2>How every text, call and email is checked</h2>
          <ol className="mlo-note" style={{ paddingLeft: 18, listStyle: "decimal" }}>
            <li>Not on hold, and they haven&apos;t said stop (a stop on calls or texts covers every phone channel).</li>
            <li>Permission strong enough: texts and M8 calls need permission on file; marketing texts and M8 marketing calls need it in writing (a signed form, a web form or a texted yes); M8 calls need proof, not just your word. You can hand-dial a past client whose loan closed in the last 18 months.</li>
            <li>For anything about a loan offer: you&apos;re licensed in their property state.</li>
            <li>For marketing by phone: their number was checked against do-not-call lists in the last 31 days.</li>
            <li>Marketing limits: {DEFAULT_RULE.callsPerDay} calls in 24 hours, {DEFAULT_RULE.textsPerDay} text a day and {DEFAULT_RULE.textsPerWeek} a week.</li>
            <li>Quiet hours in their local time, in every time zone their state spans.</li>
          </ol>
          <p className="mlo-note">These are conservative defaults for counsel to confirm. Email follows CAN-SPAM: no prior permission needed, every marketing email has an unsubscribe link, and an unsubscribe is honored at once.</p>
        </section>
        <section className="mlo-section">
          <h2>By state</h2>
          <table className="mlo-table mlo-table--plain">
            <tbody>
              {states.map((s) => {
                const r = ruleFor(s);
                return (
                  <tr key={s}>
                    <th scope="row">{usStateName(s) ?? s}</th>
                    <td>{h(r.start)}–{h(r.end)}{r.sunday === null ? ", no Sunday marketing" : r.sunday ? `, Sundays ${h(r.sunday.start)}–${h(r.sunday.end)}` : ""}</td>
                    <td>{r.allPartyRecording ? "All-party recording consent" : "One-party recording"}</td>
                    <td className="mlo-note">{r.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </PageShell>
  );
}
