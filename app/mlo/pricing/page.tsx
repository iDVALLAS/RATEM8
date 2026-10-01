import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CONFIG } from "@/lib/config";
import { mloContent } from "@/lib/content/mlo";
import { decodeFlash } from "@/lib/mlo/flash";
import { LENDERS, publishable } from "@/lib/pricing/lenders";
import { isFresh } from "@/lib/pricing/providers/manual";
import { exampleScenarios } from "@/lib/pricing/providers/mock";
import { SOURCE_TYPES } from "@/lib/pricing/publish";
import { getStore } from "@/lib/pricing/store";
import { listTenants } from "@/lib/pricing/tenants";
import { publishSnapshotAction } from "../actions";
import { FlashBox, MloNav, TenantPicker } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing snapshots", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ t?: string; s?: string; f?: string }> };
const ROWS = 12;

export default async function MloPricing({ searchParams }: Props) {
  const c = mloContent.pricing;
  const { t, s, f } = await searchParams;
  const tenants = listTenants();
  const tenant = tenants.find((x) => x.id === t) ?? tenants[0];
  const scenarios = exampleScenarios().filter((x) => tenant.states.includes(x.state));
  const scenario = scenarios.find((x) => x.id === s) ?? scenarios[0];
  const store = getStore();
  const settings = await store.latestSettings(tenant.id);
  const lenders = LENDERS.filter((l) => settings?.activeLenderKeys.includes(l.key) && publishable(l.key));
  const recent = scenario ? (await store.listSnapshots(tenant.id, scenario.id)).slice(0, 10) : [];

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">{mloContent.title}</p>
        <h1 className="tagline text-4xl">{c.heading}</h1>
        <MloNav current="pricing" tenantId={tenant.id} />
        <TenantPicker tenants={tenants} current={tenant.id} base="/mlo/pricing" />
        <FlashBox flash={decodeFlash(f)} />
        {!store.writable ? <div className="mlo-flash mlo-flash--err" role="alert">{store.reason}</div> : null}
        <p className="mlo-note mt-3">{c.intro}</p>
        <p className="mlo-note mt-2">{CONFIG.pricing.manual ? c.flagOn : c.flagOff} {c.stale.replace("{h}", String(CONFIG.pricing.manualStaleHours))}</p>

        {scenarios.length ? (
          <nav className="mlo-nav" aria-label={c.scenario}>
            {scenarios.map((x) => (
              <Link key={x.id} href={`/mlo/pricing?t=${encodeURIComponent(tenant.id)}&s=${x.id}`} aria-current={x.id === scenario?.id ? "page" : undefined}>{x.title} · {x.location}</Link>
            ))}
          </nav>
        ) : <p className="mlo-note">This brokerage has no scenarios yet.</p>}

        {scenario ? (
          <form action={publishSnapshotAction} className="mlo-section">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <input type="hidden" name="scenarioId" value={scenario.id} />
            <h2>{scenario.title} · {scenario.location}</h2>
            <ul className="mlo-note">{scenario.assumptions.slice(0, 4).map((a) => <li key={a}>{a}</li>)}</ul>
            {lenders.length < 3 ? <p className="mlo-flash mlo-flash--err">Fewer than three active lenders can be shown to consumers. Set go-to lenders on the Setup page.</p> : null}
            {Array.from({ length: ROWS }, (_, i) => (
              <div key={i} className="mlo-row">
                <label className="mlo-field">Lender
                  <select name={`r${i}.lender`} defaultValue="">
                    <option value="">—</option>
                    {lenders.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
                  </select>
                </label>
                <label className="mlo-field">Product<input name={`r${i}.product`} defaultValue="30-year fixed" /></label>
                <label className="mlo-field">Result
                  <select name={`r${i}.status`} defaultValue="eligible"><option value="eligible">Eligible</option><option value="ineligible">Not eligible</option></select>
                </label>
                <label className="mlo-field">Rate %<input name={`r${i}.rate`} inputMode="decimal" placeholder="6.250" /></label>
                <label className="mlo-field">Points %<input name={`r${i}.points`} inputMode="decimal" placeholder="0.500 or -0.250" /></label>
                <label className="mlo-field">Origination $<input name={`r${i}.orig`} inputMode="decimal" placeholder="0" /></label>
                <label className="mlo-field">Lender fees $<input name={`r${i}.fees`} inputMode="decimal" placeholder="1195" /></label>
                <label className="mlo-field">Lock days<input name={`r${i}.lock`} inputMode="numeric" defaultValue="30" /></label>
                <label className="mlo-field">IO months<input name={`r${i}.io`} inputMode="numeric" defaultValue="0" /></label>
                <div className="mlo-row__wide">
                  <label className="mlo-field" style={{ flex: "1 1 100%" }}>Reason (if not eligible)<input name={`r${i}.reason`} /></label>
                  {[["prepay", "Prepayment penalty"], ["balloon", "Balloon in first 7 years"], ["negam", "Negative amortization"], ["io", "Interest-only"], ["demand", "Demand feature"], ["shared", "Shared equity"]].map(([k, label]) => (
                    <label key={k} className="mlo-check"><input type="checkbox" name={`r${i}.f.${k}`} />{label}</label>
                  ))}
                </div>
              </div>
            ))}
            <label className="mlo-field mt-3">{c.source}<input type="file" name="source" accept={SOURCE_TYPES.join(",")} required /></label>
            <button type="submit" className="mlo-btn" disabled={!store.writable}>{c.publish}</button>
          </form>
        ) : null}

        <section className="mlo-section">
          <h2>{c.recent}</h2>
          {recent.length ? (
            <div style={{ overflowX: "auto" }}>
            <table className="mlo-table">
              <thead><tr>{c.columns.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={r.run.runId}>
                    <td>{new Date(r.run.pricedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td>
                    <td>{i === 0 && CONFIG.pricing.manual && isFresh(r.run.pricedAt) ? "Yes" : "No"}</td>
                    <td><code>{r.run.inputsHash.slice(0, 12)}</code></td>
                    <td><code>{r.sourceSha256.slice(0, 12)}</code></td>
                    <td>{r.enteredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : <p className="mlo-note">{c.none}</p>}
        </section>
      </div>
    </PageShell>
  );
}
