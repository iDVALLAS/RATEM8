import type { Metadata } from "next";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { DEFAULT_RULE, ruleFor, STATE_ZONES } from "@/lib/send-gate/rules";
import { stateClearances } from "@/lib/messaging/service";
import { usStateName } from "@/lib/us-states";
import { MloNav } from "../MloChrome";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";
import { TechSteps } from "@/app/mlo/NotOnYet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact rules", robots: { index: false, follow: false } };

const h = (n: number) => `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? "AM" : "PM"}`;

/** /mlo/rules — the per-state rules the send gate applies (D3). Read-only; values are in lib/send-gate/rules.ts. */
export default async function Rules() {
  const v = await requireViewer();
  const clear = stateClearances();
  const tenant = listTenants()[0];
  const states = Object.keys(STATE_ZONES).sort();
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="rules" title="Contact rules" />
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
          <h2>State rules waiting for counsel</h2>
          <p className="mlo-note">These stay closed until counsel confirms and the owner turns them on. Loan updates and other service messages aren&apos;t affected.</p>
          <TechSteps owner={v.user?.role === "owner"}>
            <p className="mlo-note">In Vercel, set each one to exactly <code>true</code> (not Sensitive), then redeploy: Texas <code>GATE_TX_302_CLEARED</code>, Arizona <code>GATE_AZ_PHONE_CLEARED</code>, California <code>GATE_CA_AI_VOICE_CLEARED</code>.</p>
          </TechSteps>
          <div className="mlo-scroll">
            <table className="mlo-table mlo-table--plain">
              <tbody>
                <tr><th scope="row">Texas: sales calls and texts (telephone-solicitor registration, Bus. &amp; Com. ch. 302, or an exemption)</th><td>{clear.tx302 ? "Open" : "Closed"}</td></tr>
                <tr><th scope="row">Arizona: sales calls and texts (A.R.S. 44-1271)</th><td>{clear.azPhone ? "Open" : "Closed"}</td></tr>
                <tr><th scope="row">California: calls from M8&apos;s AI voice (Pub. Util. Code 2871–2876)</th><td>{clear.caAiVoice ? "Open" : "Closed"}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mlo-note" style={{ marginTop: 8 }}>Always on: Connecticut needs written permission for sales calls and texts (except existing customers of your current company); in Washington, a no means no sales calls for a year; a phone&apos;s area code adds that state&apos;s rules; and daily limits count every text and call to the number, from anyone on the platform.</p>
        </section>

        <section className="mlo-section">
          <h2>By state</h2>
          <div className="mlo-scroll">
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
          </div>
        </section>
      </div>
    </PageShell>
  );
}
