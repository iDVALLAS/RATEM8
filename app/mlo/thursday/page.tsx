import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CONFIG } from "@/lib/config";
import { decodeFlash } from "@/lib/mlo/flash";
import { gridScenarios, gridShortLabel } from "@/lib/pricing/grid";
import { isFresh } from "@/lib/pricing/providers/manual";
import { currentPostedWeek, dayLabel, financeCharges, latestForWeek, pacificLabel, postedLoanAmount, thisThursday, addDays } from "@/lib/pricing/posted-rate";
import { getStore } from "@/lib/pricing/store";
import { tenantForState } from "@/lib/pricing/tenants";
import { getRecords } from "@/lib/records";
import { publishPostedAction, withdrawPostedAction } from "../actions";
import { FlashBox, MloNav } from "../MloChrome";
import "../mlo.css";

/**
 * /mlo/thursday — the weekly sitting (v37, L4): Freddie Mac's averages in,
 * the two posted rates out (after the honor confirmation), and the six
 * grid scenarios' status with links to price each one.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thursday pricing", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ f?: string }> };

export default async function MloThursday({ searchParams }: Props) {
  const { f } = await searchParams;
  const now = new Date();
  const weekOf = thisThursday(now);
  const showing = await currentPostedWeek(now);
  const thisWeek = await latestForWeek(weekOf);
  const p = CONFIG.pricing.postedProfile;
  const store = getStore();
  const grid = await Promise.all(
    gridScenarios().map(async (s) => {
      const t = tenantForState(s.state)!;
      const snap = await store.latestSnapshot(t.id, s.id);
      const fresh = snap ? isFresh(snap.run.pricedAt, now, CONFIG.pricing.weeklyStaleHours) : false;
      return { s, t, snap, fresh };
    }),
  );

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">{`// Thursday, ${dayLabel(weekOf)}`}</p>
        <h1 className="tagline text-4xl">This week&apos;s posted rates and grid</h1>
        <MloNav current="thursday" tenantId={grid[0]?.t.id ?? ""} />
        <FlashBox flash={decodeFlash(f)} />
        {!getRecords().writable ? <div className="mlo-flash mlo-flash--err" role="alert">{getRecords().reason}</div> : null}

        <div className="mlo-grid mlo-grid--2">
          <section className="mlo-section" aria-labelledby="posted-h">
            <h2 id="posted-h">Freddie Mac PMMS · posted rates</h2>
            {!CONFIG.pricing.postedRates ? <p className="mlo-note">POSTED_RATES is off on this deployment: you can publish, but /rates won&apos;t show the cards.</p> : null}
            {showing ? (
              <p className="mlo-flash mlo-flash--ok">
                Showing now (week of {dayLabel(showing.weekOf)}): 30-yr {showing.lines[0].rate.toFixed(3)}% (APR {showing.lines[0].apr.toFixed(3)}%), 15-yr {showing.lines[1].rate.toFixed(3)}% (APR {showing.lines[1].apr.toFixed(3)}%). Honor through {pacificLabel(showing.honorUntil)}.
              </p>
            ) : <p className="mlo-note">No posted rates are showing.</p>}
            <form action={publishPostedAction} className="mt-3">
              <div className="mlo-grid mlo-grid--2">
                <label className="mlo-field">Release date (Thursday)<input name="weekOf" type="date" defaultValue={weekOf} required /></label>
                <span />
                <label className="mlo-field">30-year average %<input name="pmms30" inputMode="decimal" placeholder="6.17" required defaultValue={thisWeek?.lines[0].pmms ?? ""} /></label>
                <label className="mlo-field">15-year average %<input name="pmms15" inputMode="decimal" placeholder="5.41" required defaultValue={thisWeek?.lines[1].pmms ?? ""} /></label>
              </div>
              <p className="mlo-note mt-2">
                Posted = average − {CONFIG.pricing.postedMargin.toFixed(2)}%, rounded down to the nearest {CONFIG.pricing.postedStep}%. Zero discount points. APR on a {`$${postedLoanAmount().toLocaleString("en-US")}`} loan with {`$${financeCharges().toLocaleString("en-US")}`} in lender fees. Honor window: release through {dayLabel(addDays(weekOf, 6))}, 11:59 PM PT.
              </p>
              <label className="mlo-field mt-2">ARIVE screenshot as evidence (optional, kept private)<input type="file" name="evidence" accept="image/png,image/jpeg,application/pdf" /></label>
              <label className="mlo-check mt-2">
                <input type="checkbox" name="confirm" />
                I confirm I can honor these two rates for qualified borrowers ({p.creditFloor}+ credit, {p.minDownPct}%+ down, purchase, primary residence, single-family, conforming) who lock by Wednesday, 11:59 PM PT.
              </label>
              <button type="submit" className="mlo-btn">Publish posted rates</button>
            </form>
            {thisWeek && !thisWeek.withdrawn ? (
              <form action={withdrawPostedAction}>
                <input type="hidden" name="weekOf" value={weekOf} />
                <button type="submit" className="mlo-btn mlo-btn--danger">Withdraw this week&apos;s posted rates</button>
              </form>
            ) : null}
          </section>

          <section className="mlo-section" aria-labelledby="grid-h">
            <h2 id="grid-h">Six-scenario grid</h2>
            {!CONFIG.pricing.weekly ? <p className="mlo-note">PRICING_WEEKLY is off on this deployment, so the grid is stored but not shown.</p> : null}
            <table className="mlo-table">
              <thead><tr><th scope="col">Scenario</th><th scope="col">Status</th><th scope="col"></th></tr></thead>
              <tbody>
                {grid.map(({ s, t, snap, fresh }) => (
                  <tr key={s.id}>
                    <td>{s.title.replace(" purchase", "").replace(" rate-and-term refinance", " refi")} · {gridShortLabel(s)}</td>
                    <td><span className={`mlo-tag ${fresh ? "mlo-tag--approved" : "mlo-tag--priced"}`}>{fresh ? `Showing · ${pacificLabel(snap!.run.pricedAt)}` : snap ? "Expired" : "Not priced"}</span></td>
                    <td><Link href={`/mlo/pricing?t=${encodeURIComponent(t.id)}&s=${s.id}`}>{fresh ? "Re-price" : "Price"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mlo-note mt-2">Publishing a scenario is your approval. With L4b, your assistant fills these in and they wait here for you.</p>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
