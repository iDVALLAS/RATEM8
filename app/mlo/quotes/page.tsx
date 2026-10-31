import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CONFIG, mloById } from "@/lib/config";
import { decodeFlash } from "@/lib/mlo/flash";
import { LENDERS, lenderByKey, offers, publishable } from "@/lib/pricing/lenders";
import { getStore } from "@/lib/pricing/store";
import { tenantForState } from "@/lib/pricing/tenants";
import { getRecords } from "@/lib/records";
import { scenarioLine, LABELS, loanAmount } from "@/lib/quotes/scenario";
import { adminMlo, approvalBlocker } from "@/lib/quotes/service";
import { listQuotes, maskEmail, type Quote } from "@/lib/quotes/store";
import { pacificLabel } from "@/lib/pricing/posted-rate";
import { approveQuoteAction, priceQuoteAction, rejectQuoteAction } from "../actions";
import { FlashBox, MloNav } from "../MloChrome";
import { LenderRows } from "../LenderRows";
import "../mlo.css";

/**
 * /mlo/quotes — the approval queue (v37, L4). Every personal estimate
 * request lands here. The loan officer prices it (today by hand; with
 * L4b the assistant fills it in), reviews the three options with real
 * lender names, and approves or rejects. Nothing reaches the borrower
 * until "Approve and send".
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quotes", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ q?: string; f?: string }> };

const TAG: Record<Quote["status"], string> = { requested: "Needs pricing", priced: "Ready to approve", approved: "Approved", rejected: "Rejected" };
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(3)}%`);

export default async function MloQuotes({ searchParams }: Props) {
  const { q, f } = await searchParams;
  const records = getRecords();
  const quotes = await listQuotes();
  const open = quotes.filter((x) => x.status === "requested" || x.status === "priced");
  const current = quotes.find((x) => x.id === q) ?? open[0] ?? quotes[0];
  const me = adminMlo();
  const tenant = current ? tenantForState(current.requested.state) : undefined;
  const settings = tenant ? await getStore().latestSettings(tenant.id) : null;
  const lenders = LENDERS.filter((l) => settings?.activeLenderKeys.includes(l.key) && publishable(l.key) && offers(l.key, "first_mortgage"));

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO admin</p>
        <h1 className="tagline text-4xl">Quotes{open.length ? ` · ${open.length} open` : ""}</h1>
        <MloNav current="quotes" tenantId={tenant?.id ?? ""} />
        <FlashBox flash={decodeFlash(f)} />
        {!records.writable ? <div className="mlo-flash mlo-flash--err" role="alert">{records.reason}</div> : null}
        {!CONFIG.pricing.personalQuotes ? <p className="mlo-note">PERSONAL_QUOTES is off on this deployment, so M8 isn&apos;t taking requests here.</p> : null}
        <p className="mlo-note mt-2">Signed in as {me ? `${me.name} (NMLS #${me.nmls})` : "an unmapped login"}. You can approve quotes for the states you&apos;re licensed in.</p>

        {quotes.length === 0 ? (
          <p className="mlo-section mlo-note">No requests yet. They arrive from M8 (&quot;Get my personal estimate&quot; on /rates){CONFIG.featureFlags.agentPricing ? " and from AI assistants" : ""}.</p>
        ) : (
          <div className="mlo-queue mt-4">
            <nav className="mlo-qlist" aria-label="Requests">
              {quotes.slice(0, 60).map((x) => (
                <Link key={x.id} href={`/mlo/quotes?q=${x.id}`} className="mlo-qitem" aria-current={x.id === current?.id ? "true" : undefined}>
                  <span className={`mlo-tag mlo-tag--${x.status}`}>{TAG[x.status]}</span>
                  <br />
                  <strong style={{ fontWeight: 500, color: "var(--fg)" }}>{x.id}</strong> · {LABELS.purpose[x.requested.scenario.purpose]} · {usd(loanAmount(x.requested.scenario))} loan
                  <br />
                  {LABELS.creditBand[x.requested.scenario.creditBand]} · {x.requested.state} {x.requested.scenario.zip} · {pacificLabel(x.requested.at)}
                </Link>
              ))}
            </nav>
            {current ? <Detail quote={current} lenders={lenders} blocker={approvalBlocker(current, me)} /> : null}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Detail({ quote, lenders, blocker }: { quote: Quote; lenders: { key: string; name: string }[]; blocker: string | null }) {
  const r = quote.requested;
  const s = r.scenario;
  const assigned = mloById(r.mloId);
  const run = quote.priced?.run;
  const name = (label: string) => lenderByKey(quote.priced?.mapping[label] ?? "")?.name ?? label;
  const rows = run
    ? ([
        ["Lowest rate", run.selection.lowestRate?.lender],
        ["Lowest rate · no risky features", run.selection.lowestRateWithoutRiskyFeatures?.lender],
        ["Lowest points and origination", run.selection.lowestPointsAndOrigination?.lender],
      ] as const)
    : [];
  return (
    <section className="mlo-section" style={{ marginTop: 0 }} aria-label={`Quote ${quote.id}`}>
      <p className="mlo-tag">{quote.id} · {r.source === "agent" ? `AI assistant${r.agentOrigin ? ` (${r.agentOrigin})` : ""}` : "M8 chat"} · received {pacificLabel(r.at)} · borrower email {maskEmail(r.email)}</p>
      <p style={{ color: "var(--fg)" }}>{scenarioLine(s)}</p>
      <dl className="mlo-facts">
        <div><dt>Loan amount</dt><dd>{usd(loanAmount(s))}</dd></div>
        <div><dt>Property state</dt><dd>{r.state}</dd></div>
        <div><dt>Routed to</dt><dd>{assigned?.name ?? r.mloId}</dd></div>
        <div><dt>Lock</dt><dd>30 days</dd></div>
      </dl>

      {quote.status === "requested" || quote.status === "priced" ? (
        <details open={quote.status === "requested"}>
          <summary className="mlo-note" style={{ cursor: "pointer" }}>{quote.status === "requested" ? "Enter pricing from your pricing engine" : "Re-price (replaces the numbers below)"}</summary>
          <form action={priceQuoteAction}>
            <input type="hidden" name="id" value={quote.id} />
            {lenders.length < 3 ? <p className="mlo-flash mlo-flash--err">Fewer than three active lenders can be shown to consumers. Set go-to lenders on the Setup page.</p> : null}
            <LenderRows lenders={lenders} rows={6} defaultFees={String(CONFIG.pricing.fees.underwriting + CONFIG.pricing.fees.processing)} defaultProduct={s.term === "15" ? "15-year fixed" : "30-year fixed"} />
            <label className="mlo-field mt-3">Pricing screenshot or PDF (required, kept private)<input type="file" name="source" accept="image/png,image/jpeg,application/pdf" required /></label>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Save pricing</button>
          </form>
        </details>
      ) : null}

      {run ? (
        <>
          <div style={{ overflowX: "auto" }} className="mt-4">
            <table className="mlo-table">
              <thead><tr><th scope="col">Option</th><th scope="col">Lender (you see names)</th><th scope="col">Rate</th><th scope="col">APR</th><th scope="col">Points</th><th scope="col">Payment</th></tr></thead>
              <tbody>
                {rows.map(([label, l]) => {
                  const x = run.quotes.find((y) => y.lender === l);
                  return (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{l ? name(l) : "—"}</td>
                      <td>{pct(x?.noteRate ?? null)}</td>
                      <td>{pct(x?.apr ?? null)}</td>
                      <td>{x ? x.pointsPct.toFixed(3) : "—"}</td>
                      <td>{x?.monthlyPayment ? usd(x.monthlyPayment) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mlo-note mt-2">The borrower sees Lender 1, 2, 3. APR includes your {usd(CONFIG.pricing.fees.underwriting + CONFIG.pricing.fees.processing)} in lender fees. Priced {pacificLabel(quote.priced!.at)} by {quote.priced!.by}. <a href={`/mlo/source/${quote.priced!.sourceSha256}`} target="_blank" rel="noreferrer">Open the screenshot</a></p>
        </>
      ) : null}

      {quote.status === "priced" ? (
        <div className="mlo-grid mlo-grid--2 mt-4">
          <form action={approveQuoteAction} className="mlo-section" style={{ marginTop: 0 }}>
            <input type="hidden" name="id" value={quote.id} />
            <label className="mlo-field">Your note to the borrower (optional)<textarea name="note" maxLength={600} placeholder="e.g. FHA may beat this with 10% down; happy to run it." /></label>
            <label className="mlo-check"><input type="checkbox" name="confirm" />I reviewed these numbers against the screenshot.</label>
            {blocker ? <p className="mlo-flash mlo-flash--err">{blocker}</p> : null}
            <button type="submit" className="mlo-btn" disabled={Boolean(blocker)}>Approve and send</button>
          </form>
          <form action={rejectQuoteAction} className="mlo-section" style={{ marginTop: 0 }}>
            <input type="hidden" name="id" value={quote.id} />
            <label className="mlo-field">Reason (internal; the borrower sees a general line)<input name="reason" maxLength={600} /></label>
            <button type="submit" className="mlo-btn mlo-btn--danger">Reject</button>
          </form>
        </div>
      ) : quote.status === "requested" ? (
        <form action={rejectQuoteAction} className="mt-4">
          <input type="hidden" name="id" value={quote.id} />
          <label className="mlo-field">Can&apos;t price it? Reason (internal)<input name="reason" maxLength={600} /></label>
          <button type="submit" className="mlo-btn mlo-btn--danger">Reject</button>
        </form>
      ) : null}

      {quote.approved ? <p className="mlo-flash mlo-flash--ok">Approved {pacificLabel(quote.approved.at)} as {mloById(quote.approved.mloId)?.name}. {quote.sent?.ok ? "Emailed to the borrower." : "Not emailed (email isn't configured); the borrower's link shows it."}</p> : null}
      {quote.rejected ? <p className="mlo-flash mlo-flash--err">Rejected {pacificLabel(quote.rejected.at)}: {quote.rejected.reason}</p> : null}

      <details className="mt-4">
        <summary className="mlo-note" style={{ cursor: "pointer" }}>History</summary>
        <ul className="mlo-note">{quote.events.map((e, i) => <li key={i}>{pacificLabel(e.at)} · {e.type}{"by" in e ? ` · ${e.by}` : ""}</li>)}</ul>
      </details>
    </section>
  );
}
