import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import PricingDisplay from "@/components/pricing/PricingDisplay";
import { ALL_MLOS } from "@/lib/config";
import { mloContent } from "@/lib/content/mlo";
import { decodeFlash } from "@/lib/mlo/flash";
import { resolveDisplay } from "@/lib/pricing/display";
import { LENDERS, publishable } from "@/lib/pricing/lenders";
import { NICHES, emptyEntry, NOTE_MAX } from "@/lib/pricing/playbook";
import { exampleScenarios } from "@/lib/pricing/providers/mock";
import { getStore } from "@/lib/pricing/store";
import { listTenants } from "@/lib/pricing/tenants";
import { saveSettingsAction } from "../actions";
import { FlashBox, MloNav, TenantPicker } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MLO setup", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ t?: string; f?: string }> };

const SELECTS = [
  { key: "turnTimes", label: "Turn times", options: ["fast", "typical", "slow"] },
  { key: "conditionStyle", label: "Conditions", options: ["light", "standard", "heavy"] },
  { key: "exceptionAppetite", label: "Exception appetite", options: ["low", "medium", "high"] },
  { key: "commsQuality", label: "Communication", options: ["excellent", "good", "fair"] },
] as const;

export default async function MloSetup({ searchParams }: Props) {
  const c = mloContent.setup;
  const { t, f } = await searchParams;
  const tenants = listTenants();
  const tenant = tenants.find((x) => x.id === t) ?? tenants[0];
  const store = getStore();
  const settings = await store.latestSettings(tenant.id);
  const active = new Set(settings?.activeLenderKeys ?? []);
  const scenario = exampleScenarios().find((s) => tenant.states.includes(s.state));
  const preview = scenario ? await resolveDisplay(scenario.id) : null;

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">{mloContent.title}</p>
        <h1 className="tagline text-4xl">{c.heading}</h1>
        <MloNav current="setup" tenantId={tenant.id} />
        <TenantPicker tenants={tenants} current={tenant.id} base="/mlo/setup" />
        <FlashBox flash={decodeFlash(f)} />
        {!store.writable ? <div className="mlo-flash mlo-flash--err" role="alert">{store.reason}</div> : null}

        <section className="mlo-section">
          <h2>{c.identity}</h2>
          <table className="mlo-table">
            <tbody>
              <tr><th scope="row">Sponsoring brokerage</th><td>{tenant.brokerageName} · {tenant.brokerageIdLabel} #{tenant.brokerageIdNumber} · {tenant.states.join(", ")}</td></tr>
              {ALL_MLOS.map((m) => (
                <tr key={m.nmls}><th scope="row">Loan officer seat</th><td>{m.name} · NMLS #{m.nmls} · <a href={m.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer">Verify on NMLS Consumer Access</a> · {c.notVerified}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mlo-note mt-2">{c.identityNote}</p>
        </section>

        <section className="mlo-section">
          <h2>{c.source}</h2>
          <p className="mlo-note">{c.sourceBody}</p>
        </section>

        <form action={saveSettingsAction}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <section className="mlo-section">
            <h2>{c.lenders}</h2>
            <p className="mlo-note">{c.lendersNote}</p>
            <div className="mlo-grid mlo-grid--2">
              {LENDERS.map((l) => (
                <label key={l.key} className="mlo-check">
                  <input type="checkbox" name="active" value={l.key} defaultChecked={active.has(l.key)} />
                  <span>{l.name}{publishable(l.key) ? "" : <><br /><span className="mlo-note">{c.restricted}</span></>}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="mlo-section">
            <h2>{c.playbook}</h2>
            <p className="mlo-note">{c.playbookNote}</p>
            {LENDERS.filter((l) => active.has(l.key)).map((l) => {
              const e = settings?.playbook.find((p) => p.lenderKey === l.key) ?? emptyEntry(l.key);
              return (
                <div key={l.key} className="mlo-lender">
                  <h3>{l.name}</h3>
                  <div className="mlo-grid mlo-grid--2">
                    {SELECTS.map((sel) => (
                      <label key={sel.key} className="mlo-field">
                        {sel.label}
                        <select name={`pb.${l.key}.${sel.key}`} defaultValue={e[sel.key]}>
                          <option value="">Not set</option>
                          {sel.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <fieldset className="mlo-row__wide mt-2">
                    <legend className="mlo-note">Program niches</legend>
                    {NICHES.map((n) => (
                      <label key={n} className="mlo-check"><input type="checkbox" name={`pb.${l.key}.niches`} value={n} defaultChecked={e.niches.includes(n)} />{n.replace(/_/g, " ")}</label>
                    ))}
                  </fieldset>
                  <label className="mlo-field mt-2">
                    Note (max {NOTE_MAX} characters)
                    <textarea name={`pb.${l.key}.note`} maxLength={NOTE_MAX} defaultValue={e.note} />
                  </label>
                </div>
              );
            })}
            <button type="submit" className="mlo-btn" disabled={!store.writable}>{c.save}</button>
          </section>
        </form>

        <section className="mlo-section">
          <h2>{c.test}</h2>
          <p className="mlo-note mb-3">{c.testNote}</p>
          {preview ? <PricingDisplay display={preview} /> : null}
        </section>

        <section className="mlo-section">
          <h2>{c.attest}</h2>
          <p className="mlo-note">{c.attestBlocked}</p>
        </section>
      </div>
    </PageShell>
  );
}
