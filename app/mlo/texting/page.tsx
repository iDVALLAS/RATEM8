import type { Metadata } from "next";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import { ccAllMlos } from "@/lib/config";
import { singleCompany } from "@/lib/accounts/company";
import { serviceForCompany, twilioConfig } from "@/lib/messaging/twilio";
import { registrationWording, serviceEnvName, webhookUrls } from "@/lib/messaging/registration";
import { MloNav } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Texting setup", robots: { index: false, follow: false } };

/**
 * /mlo/texting — what to register with Twilio (10DLC) for each sponsoring
 * company, ready to paste (D23). Carriers need a brand and a campaign per
 * company; the research (ledger item 14) says register customer care first:
 * mortgage marketing campaigns are often refused, and a refusal is final.
 */
export default async function TextingSetup() {
  const v = await requireAdminPage();
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

        <section className="mlo-section">
          <h2>{connected ? "Twilio is connected" : "Twilio isn't connected yet"}</h2>
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
