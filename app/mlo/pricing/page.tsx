import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CONFIG } from "@/lib/config";
import { mloContent } from "@/lib/content/mlo";
import { decodeFlash } from "@/lib/mlo/flash";
import { LENDERS, offers, publishable } from "@/lib/pricing/lenders";
import { isFresh } from "@/lib/pricing/providers/manual";
import { HIDDEN_FROM_ADMIN, pricingScenarios } from "@/lib/pricing/daily";
import { SOURCE_TYPES } from "@/lib/pricing/publish";
import { getStore } from "@/lib/pricing/store";
import { listTenants } from "@/lib/pricing/tenants";
import { headers } from "next/headers";
import { bookmarkletUrl } from "@/lib/pricing/loansifterBookmarklet";
import { importLoanSifterAction, publishSnapshotAction } from "../actions";
import { FlashBox, MloNav, TenantPicker } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing snapshots", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ t?: string; s?: string; f?: string }> };
const ROWS = 12;

export default async function MloPricing({ searchParams }: Props) {
  const c = mloContent.pricing;
  const { t, s, f } = await searchParams;
  // C11: the bookmark sends to the LoanM8 site that served it (loanm8.com, a preview, or local).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "loanm8.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const bookmark = bookmarkletUrl(`${proto}://${host}`);
  const tenants = listTenants();
  const tenant = tenants.find((x) => x.id === t) ?? tenants[0];
  const scenarios = pricingScenarios().filter((x) => tenant.states.includes(x.state) && !HIDDEN_FROM_ADMIN.has(x.id));
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
        <p className="mlo-note mt-2">{CONFIG.pricing.manual ? c.flagOn : c.flagOff} {c.stale.replace("{h}", String(CONFIG.pricing.manualStaleHours))}</p>

        <form action={importLoanSifterAction} className="mlo-section">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <h2>{c.importHeading}</h2>
          <ol className="mlo-note">{c.importSteps.map((x) => <li key={x}>{x}</li>)}</ol>
          {/* React blocks javascript: hrefs, so the bookmarklet link is plain HTML. */}
          <p
            className="mt-3"
            dangerouslySetInnerHTML={{ __html: `<a class="mlo-btn" href="${bookmark.replace(/"/g, "&quot;")}" onclick="return false">${c.bookmarklet}</a>` }}
          />
          <details className="mlo-note mt-2">
            <summary>{c.bookmarkletCode}</summary>
            <textarea readOnly rows={3} style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }} defaultValue={bookmark} />
          </details>
          <p className="mlo-note mt-2">{c.importSafety}</p>
          <label className="mlo-field mt-3" style={{ display: "block" }}>{c.capture}
            <textarea name="capture" rows={4} required style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />
          </label>
          <p className="mlo-note mt-2">{settings?.monthlyPmi ? c.importPmiSet.replace("{pmi}", String(settings.monthlyPmi)) : c.importPmiMissing}</p>
          <button type="submit" className="mlo-btn" disabled={!store.writable}>{c.import}</button>
        </form>

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
            <ul className="mlo-note">{scenario.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            {scenario.mi?.kind === "pmi" ? (
              <label className="mlo-field mt-3">{c.pmi}<input name="pmi" inputMode="decimal" placeholder="232" defaultValue={settings?.monthlyPmi ? String(settings.monthlyPmi) : ""} required /></label>
            ) : null}
            {scenario.mi?.kind === "fha" ? <p className="mlo-note mt-2">{c.fha}</p> : null}
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
