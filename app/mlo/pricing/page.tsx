import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CONFIG } from "@/lib/config";
import { mloContent } from "@/lib/content/mlo";
import { decodeFlash } from "@/lib/mlo/flash";
import { LENDERS, offers, publishable } from "@/lib/pricing/lenders";
import { isFresh } from "@/lib/pricing/providers/manual";
import { allScenarios, isGridScenario } from "@/lib/pricing/grid";
import { SOURCE_TYPES } from "@/lib/pricing/publish";
import { getStore } from "@/lib/pricing/store";
import { listTenants } from "@/lib/pricing/tenants";
import { publishSnapshotAction } from "../actions";
import { FlashBox, MloNav, TenantPicker } from "../MloChrome";
import { LenderRows } from "../LenderRows";
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
  const scenarios = allScenarios().filter((x) => tenant.states.includes(x.state));
  const scenario = scenarios.find((x) => x.id === s) ?? scenarios[0];
  const store = getStore();
  const settings = await store.latestSettings(tenant.id);
  // v27: every scenario is a first mortgage, so HELOC-only programs are not offered here.
  const lenders = LENDERS.filter((l) => settings?.activeLenderKeys.includes(l.key) && publishable(l.key) && offers(l.key, "first_mortgage"));
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
        <p className="mlo-note mt-2">{c.weekly.replace("{h}", String(CONFIG.pricing.weeklyStaleHours))} {CONFIG.pricing.weekly ? "" : c.weeklyOff}</p>

        {scenarios.length ? (
          <nav className="mlo-nav" aria-label={c.scenario}>
            {scenarios.map((x) => (
              <Link key={x.id} href={`/mlo/pricing?t=${encodeURIComponent(tenant.id)}&s=${x.id}`} aria-current={x.id === scenario?.id ? "page" : undefined}>{isGridScenario(x.id) ? `${x.title} · ${x.downPct}% ${x.purpose === "rate_term_refi" ? "equity" : "down"} · ${x.creditScore}` : `${x.title} · ${x.location}`}</Link>
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
            <LenderRows lenders={lenders} rows={ROWS} defaultFees={String(CONFIG.pricing.fees.underwriting + CONFIG.pricing.fees.processing)} />
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
                    <td>{i === 0 && (isGridScenario(scenario.id) ? CONFIG.pricing.weekly && isFresh(r.run.pricedAt, new Date(), CONFIG.pricing.weeklyStaleHours) : CONFIG.pricing.manual && isFresh(r.run.pricedAt)) ? "Yes" : "No"}</td>
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
