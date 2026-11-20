import type { Metadata } from "next";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import { ccAllMlos } from "@/lib/config";
import { singleCompany } from "@/lib/accounts/company";
import { serviceForCompany, twilioConfig } from "@/lib/messaging/twilio";
import { registrationWording, serviceEnvName, webhookUrls } from "@/lib/messaging/registration";
import { FlashBox, MloNav } from "../MloChrome";
import { decodeFlash } from "@/lib/mlo/flash";
import { textingStore } from "@/lib/texting/store";
import { FEES, stepsOf, textSetupOn } from "@/lib/texting/service";
import { approveTextingAction, checkTextingAction, retryTextingAction, stopTextingAction } from "../text-setup/actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Texting setup", robots: { index: false, follow: false } };

/**
 * /mlo/texting — what to register with Twilio (10DLC) for each sponsoring
 * company, ready to paste (D23). Carriers need a brand and a campaign per
 * company; the research (ledger item 14) says register customer care first:
 * mortgage marketing campaigns are often refused, and a refusal is final.
 */
export default async function TextingSetup({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireAdminPage();
  const registrations = await textingStore().all().catch(() => []);
  const tenant = listTenants()[0];
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const companies = [...new Map(ccAllMlos().flatMap((m) => m.licenses.map((l) => [l.sponsor.idNumber, l.sponsor] as const))).values()];
  const single = singleCompany();
  const connected = !!twilioConfig();
  const hooks = webhookUrls(base);

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Texting setup</h1>
        <MloNav current="setup" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        <FlashBox flash={decodeFlash(f)} />

        <section className="mlo-section" id="companies">
          <h2>Companies Command Center registers (D56)</h2>
          <p className="mlo-note">
            Loan officers fill in their company&apos;s details on <a href="/mlo/text-setup">Texting for your company</a>; you approve the fees here, and Command Center does the Twilio steps in a subaccount per company. {FEES}
            {textSetupOn() ? "" : " Not ready yet: it needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PRIMARY_PROFILE_SID (your own approved primary business profile in Twilio Trust Hub, as the platform)."}
          </p>
          {registrations.length ? (
            <table className="mlo-table">
              <thead><tr><th scope="col">Company</th><th scope="col">Status</th><th scope="col">Progress</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {registrations.map((r) => {
                  const steps = stepsOf(r);
                  return (
                    <tr key={r.company}>
                      <td>{r.companyName}<br /><span className="mlo-note">NMLS {r.company} · asked by {r.requestedBy}</span></td>
                      <td>{r.status}{r.error ? <><br /><span className="mlo-note">{r.error}</span></> : null}</td>
                      <td>{steps.filter((x) => x.done).length} of {steps.length}{r.phoneNumber ? <><br /><span className="mlo-note">{r.phoneNumber}</span></> : null}</td>
                      <td>
                        <div className="mlo-row-form">
                          {r.status === "review" ? <form action={approveTextingAction.bind(null, r.company)}><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Approve and start</button></form> : null}
                          {r.status === "working" ? <form action={checkTextingAction.bind(null, r.company, "/mlo/texting#companies")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Check now</button></form> : null}
                          {r.status === "attention" && r.approvedAt ? <form action={retryTextingAction.bind(null, r.company, "/mlo/texting#companies")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Send again</button></form> : null}
                          {r.status !== "draft" && r.status !== "review" ? <form action={stopTextingAction.bind(null, r.company)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>{r.status === "stopped" ? "Turn back on" : "Turn off"}</button></form> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mlo-note">None yet.</p>
          )}
        </section>

        <section className="mlo-section">
          <h2>{connected ? "Twilio is connected" : "Twilio isn't connected yet"} (the manual way)</h2>
          <p className="mlo-note">In Vercel: <code>TWILIO_ACCOUNT_SID</code> (not Sensitive) and <code>TWILIO_AUTH_TOKEN</code> (Sensitive), then one Messaging Service per sponsoring company below. In each Messaging Service, set the incoming-message webhook to <code>{hooks.inbound}</code> and the status callback to <code>{hooks.status}</code>. Stuck? The <a href="/mlo/setup-help?topic=texting">setup assistant</a> walks you through it.</p>
        </section>

        {companies.map((c) => {
          const service = serviceForCompany(c.idNumber, single);
          const w = registrationWording(c);
          return (
            <section key={c.idNumber} className="mlo-section">
              <h2>{c.name}</h2>
              <p className="mlo-note">
                {c.idLabel} {c.idNumber} · Messaging Service: {service ? `set (${service.slice(0, 6)}…)` : "not set"}. Put its SID in Vercel as <code>{serviceEnvName(c)}</code> (not Sensitive){single ? <> or, while this is the only sponsor, <code>TWILIO_MESSAGING_SERVICE_SID</code></> : null}.
              </p>
              <table className="mlo-table mlo-table--plain">
                <tbody>
                  <tr><th scope="row">Brand</th><td>{w.brand}</td></tr>
                  <tr><th scope="row">First campaign</th><td>Use case: {w.useCase}</td></tr>
                  <tr><th scope="row">Campaign description</th><td>{w.description}</td></tr>
                  <tr><th scope="row">How people opt in</th><td>{w.optIn}</td></tr>
                  <tr><th scope="row">Sample messages</th><td><ol style={{ paddingLeft: "1.2em", listStyle: "decimal", display: "grid", gap: 6 }}>{w.samples.map((m, i) => <li key={i}>{m}</li>)}</ol></td></tr>
                  <tr><th scope="row">Opt-out and help</th><td>{w.keywords} HELP reply: “{w.help}”</td></tr>
                  <tr><th scope="row">Opt-out confirmation</th><td>Set this in the Messaging Service&apos;s Advanced Opt-Out before 2026-11-25 (FCC 26-67: it may only confirm, with no marketing and no “reply START”): “{w.optOutConfirmation}”</td></tr>
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
