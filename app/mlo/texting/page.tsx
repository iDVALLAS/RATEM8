import type { Metadata } from "next";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import { ALL_MLOS } from "@/lib/config";
import { singleCompany } from "@/lib/accounts/company";
import { serviceForCompany, twilioConfig } from "@/lib/messaging/twilio";
import { STEPS } from "@/lib/journey/steps";
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
  const companies = [...new Map(ALL_MLOS.flatMap((m) => m.licenses.map((l) => [l.sponsor.idNumber, l.sponsor] as const))).values()];
  const single = singleCompany();
  const connected = !!twilioConfig();
  const sample = (key: string) => STEPS.find((s) => s.key === key)?.message?.({ first: "Ann", me: "Pat", portal: null }) ?? "";

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Texting setup</h1>
        <MloNav current="setup" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />

        <section className="mlo-section">
          <h2>{connected ? "Twilio is connected" : "Twilio isn't connected yet"}</h2>
          <p className="mlo-note">In Vercel: <code>TWILIO_ACCOUNT_SID</code> (not Sensitive) and <code>TWILIO_AUTH_TOKEN</code> (Sensitive), then one Messaging Service per sponsoring company below. In each Messaging Service, set the incoming-message webhook to <code>{base}/api/twilio/inbound</code> and the status callback to <code>{base}/api/twilio/status</code>.</p>
        </section>

        {companies.map((c) => {
          const nmls = c.idNumber.replace(/\D/g, "");
          const service = serviceForCompany(c.idNumber, single);
          return (
            <section key={c.idNumber} className="mlo-section">
              <h2>{c.name}</h2>
              <p className="mlo-note">
                {c.idLabel} {c.idNumber} · Messaging Service: {service ? `set (${service.slice(0, 6)}…)` : "not set"}. Put its SID in Vercel as <code>TWILIO_MESSAGING_SERVICE_SID_{nmls}</code> (not Sensitive){single ? <> or, while this is the only sponsor, <code>TWILIO_MESSAGING_SERVICE_SID</code></> : null}.
              </p>
              <table className="mlo-table mlo-table--plain">
                <tbody>
                  <tr><th scope="row">Brand</th><td>The sponsoring company itself ({c.name}), with its EIN and business address. Each company registers its own brand; texts never go out under another company&apos;s brand.</td></tr>
                  <tr><th scope="row">First campaign</th><td>Use case: <strong>Customer Care</strong>. Register this one first. Mortgage marketing campaigns are often refused, and a refusal is final; check-ins go by email until a marketing campaign is approved.</td></tr>
                  <tr><th scope="row">Campaign description</th><td>{`${c.name} loan officers text their own borrowers and clients about loans in process (application, disclosures, appraisal, underwriting, closing), document requests that point to a secure portal, and replies to messages the client sent. No lead generation, no third-party lists, no lending marketing to anyone without permission.`}</td></tr>
                  <tr><th scope="row">How people opt in</th><td>{`Borrowers give written permission to receive texts from ${c.name} and its loan officer in their loan application (an e-signed consent naming ${c.name}), or by replying YES to a loan officer. The loan officer records each permission, with where the proof is, before any text is sent. Permission is never a condition of getting a loan.`}</td></tr>
                  <tr><th scope="row">Sample messages</th><td><ol style={{ paddingLeft: "1.2em", listStyle: "decimal", display: "grid", gap: 6 }}>{["14B", "17", "22"].map((k) => <li key={k}>{sample(k)}</li>)}<li>{`Hi Ann, it's Pat at ${c.name}. Reply STOP to opt out.`}</li></ol></td></tr>
                  <tr><th scope="row">Opt-out and help</th><td>Keywords STOP, QUIT, END, CANCEL, UNSUBSCRIBE, REVOKE and OPTOUT (Command Center also honors plain-language requests like “stop texting me”). HELP reply: {`“${c.name}: loan updates from your loan officer. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.”`}</td></tr>
                  <tr><th scope="row">Opt-out confirmation</th><td>Set this in the Messaging Service&apos;s Advanced Opt-Out before 2026-11-25 (FCC 26-67: it may only confirm, with no marketing and no “reply START”): {`“You won't get more texts from ${c.name}.”`}</td></tr>
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
