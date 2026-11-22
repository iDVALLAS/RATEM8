import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { mloById } from "@/lib/config";
import { CATEGORIES } from "@/lib/expenses/categories";
import { pacificToday, yearSummary } from "@/lib/expenses/service";
import { estimatedTaxDates, HOME_OFFICE, MILEAGE_RATES } from "@/lib/expenses/tax";
import PrintButton from "./PrintButton";
import "../../mlo.css";
import "../expenses.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Year-end report", robots: { index: false, follow: false } };

const $ = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** /mlo/expenses/report?year= — the year's books on one printout for the CPA (D37). */
export default async function Report({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: y } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const today = pacificToday();
  const year = Number(y) >= 2020 && Number(y) <= Number(today.slice(0, 4)) ? Number(y) : Number(today.slice(0, 4));
  if (!me) return <PageShell><div className="mlo-wrap"><p className="mlo-note"><Link href="/sign-in">Sign in</Link> to see your report.</p></div></PageShell>;
  const s = await yearSummary(me, year);
  const mlo = mloById(me.mloId);
  const trips = s.entries.filter((e) => e.kind === "mileage");
  const spend = s.entries.filter((e) => e.kind === "expense");
  const meals = spend.filter((e) => e.category === "meals");
  const gifts = spend.filter((e) => e.category === "gifts");
  const rates = MILEAGE_RATES.filter((r) => r.from.startsWith(String(year)));
  const net = s.incomeCents - s.expenseCents;
  return (
    <PageShell>
      <div className="mlo-wrap ex-report">
        <p className="ex-noprint mlo-row-form"><Link href={`/mlo/expenses?year=${year}`}>← Back to Expenses</Link> <PrintButton /> <a href={`/api/cc/expenses/csv?year=${year}`}>Download CSV</a></p>
        <p className="eyebrow">Business income and expenses · {year}</p>
        <h1 className="tagline text-4xl ex-name">{me.name || me.email}</h1>
        <p className="mlo-note">Self-employed mortgage loan originator{mlo ? `, NMLS #${mlo.nmls}` : ""} · {me.email} · Prepared {today} from MLO Command Center</p>
        <p className="mlo-note" style={{ marginTop: 6 }}><strong>Organizer for your tax preparer, not tax advice.</strong> Amounts are what was entered and confirmed. &ldquo;Counts&rdquo; applies the business-use share, 50% for meals, $25 per person for gifts and the IRS mileage rate; your CPA makes the final call on every line.</p>
        {s.drafts ? <p className="mlo-flash mlo-flash--err ex-noprint">{s.drafts} {s.drafts === 1 ? "entry is" : "entries are"} still waiting to be confirmed and aren&apos;t in this report.</p> : null}

        <h2>Summary</h2>
        <table><tbody>
          <tr><td>Gross receipts (Schedule C line 1)</td><td className="num">{$(s.incomeCents)}</td></tr>
          <tr><td>Total expenses that count (lines 8–27a, and 30)</td><td className="num">{$(s.expenseCents)}</td></tr>
          <tr className="ex-total"><td>Net before your CPA&apos;s adjustments</td><td className="num">{$(net)}</td></tr>
        </tbody></table>

        <h2>Income</h2>
        {s.income.length ? (
          <table>
            <thead><tr><th>Payer</th><th className="num">Payments</th><th className="num">Total</th></tr></thead>
            <tbody>{s.income.map((i) => <tr key={i.payer}><td>{i.payer}</td><td className="num">{i.n}</td><td className="num">{$(i.cents)}</td></tr>)}</tbody>
          </table>
        ) : <p className="mlo-note">No income entered. Bring each 1099-NEC you receive; your CPA reports what&apos;s on them.</p>}

        <h2>Expenses by Schedule C line</h2>
        {/* D83: in the scroll box like the other wide tables (four-figure amounts pushed it past a phone's width). */}
        <div className="ex-scroll"><table>
          <thead><tr><th>Line</th><th>Category</th><th className="num">Items</th><th className="num">Spent</th><th className="num">Counts</th></tr></thead>
          <tbody>
            {s.lines.flatMap((l) =>
              l.detail.length
                ? l.detail.map((d, i) => <tr key={`${l.line}-${d.category}`}><td>{i === 0 ? `${l.line} ${l.name}` : ""}</td><td>{d.label}</td><td className="num">{d.n}</td><td className="num">{$(d.spentCents)}</td><td className="num">{$(d.countedCents)}</td></tr>)
                : [<tr key={l.line}><td>{l.line} {l.name}</td><td>{HOME_OFFICE.centsPerSqFt / 100 === 5 ? `${s.homeOffice.sqft} sq ft × $5` : ""}</td><td className="num"></td><td className="num"></td><td className="num">{$(l.cents)}</td></tr>],
            )}
            <tr className="ex-total"><td colSpan={4}>Total</td><td className="num">{$(s.expenseCents)}</td></tr>
          </tbody>
        </table></div>
        {s.membership.months ? <p className="mlo-note">Includes the LoanM8 membership ({plural(s.membership.months, "month", "months")}), from the Membership ledger.</p> : null}

        <h2>Mileage log</h2>
        <p className="mlo-note">{plural(s.miles.trips, "business trip", "business trips")}, {plural(s.miles.miles, "mile", "miles")}, {$(s.miles.cents)} at the IRS business rate{rates.length ? ` (${rates.map((r) => `${r.cents}¢ from ${r.from}`).join("; ")})` : ""}. With the standard rate, gas and repairs aren&apos;t added separately.</p>
        {trips.length ? (
          <div className="ex-scroll"><table>
            <thead><tr><th>Date</th><th>Business purpose</th><th className="num">Miles</th><th className="num">Amount</th></tr></thead>
            <tbody>{trips.map((e) => <tr key={e.id}><td>{e.date}</td><td>{e.purpose}</td><td className="num">{e.miles}</td><td className="num">{$(e.amountCents)}</td></tr>)}</tbody>
          </table></div>
        ) : null}

        {meals.length ? (
          <>
            <h2>Business meals</h2>
            <div className="ex-scroll"><table>
              <thead><tr><th>Date</th><th>Where</th><th>Business purpose</th><th className="num">Spent</th><th className="num">Counts (50%)</th></tr></thead>
              <tbody>{meals.map((e) => <tr key={e.id}><td>{e.date}</td><td>{e.vendor}</td><td>{e.purpose}</td><td className="num">{$(e.amountCents)}</td><td className="num">{$(s.countedById.get(e.id) ?? 0)}</td></tr>)}</tbody>
            </table></div>
          </>
        ) : null}

        {gifts.length ? (
          <>
            <h2>Client gifts</h2>
            <div className="ex-scroll"><table>
              <thead><tr><th>Date</th><th>For</th><th>What</th><th className="num">Spent</th><th className="num">Counts</th></tr></thead>
              <tbody>{gifts.map((e) => <tr key={e.id}><td>{e.date}</td><td>{e.recipient || "(not given)"}</td><td>{e.purpose || e.vendor}</td><td className="num">{$(e.amountCents)}</td><td className="num">{$(s.countedById.get(e.id) ?? 0)}</td></tr>)}</tbody>
            </table></div>
          </>
        ) : null}

        <h2>Every expense</h2>
        {spend.length === 0 ? <p className="mlo-note">No expenses confirmed for {year}.</p> : <div className="ex-scroll"><table>
          <thead><tr><th>Date</th><th>Line</th><th>Vendor</th><th>Business purpose</th><th className="num">Spent</th><th className="num">Bus. %</th><th className="num">Counts</th><th>Receipt</th></tr></thead>
          <tbody>{spend.map((e) => <tr key={e.id}><td>{e.date}</td><td>{CATEGORIES[e.category].line}</td><td>{e.vendor}</td><td>{e.purpose}</td><td className="num">{$(e.amountCents)}</td><td className="num">{e.businessPct}</td><td className="num">{$(s.countedById.get(e.id) ?? 0)}</td><td>{e.receiptId ? s.receiptNo.get(e.receiptId) : ""}</td></tr>)}</tbody>
        </table></div>}
        {s.missingReceipts ? <p className="mlo-note">{s.missingReceipts} {s.missingReceipts === 1 ? "expense" : "expenses"} of $75 or more {s.missingReceipts === 1 ? "has" : "have"} no receipt attached. The IRS expects receipts for lodging and for expenses of $75 or more.</p> : null}

        {s.receiptNo.size ? (
          <>
            <h2>Receipts</h2>
            <p className="mlo-note">Numbered to match the list above. Each opens from Command Center → Expenses.</p>
            <ul className="ex-noprint">{[...s.receiptNo.entries()].map(([id, n]) => <li key={id}><a href={`/api/cc/expenses/receipt/${id}`} target="_blank" rel="noopener noreferrer">{n}</a></li>)}</ul>
          </>
        ) : null}

        <h2>Other information</h2>
        <table><tbody>
          <tr><td>Home office (simplified method)</td><td>{s.homeOffice.sqft ? `${s.homeOffice.sqft} sq ft, ${$(s.homeOffice.cents)}` : "None entered"}</td></tr>
          <tr><td>Charity miles (Schedule A if you itemize; not business)</td><td>{s.charity.trips ? `${plural(s.charity.trips, "trip", "trips")}, ${plural(s.charity.miles, "mile", "miles")}, ${$(s.charity.cents)} at 14¢ a mile` : "None entered"}</td></tr>
          <tr><td>Estimated tax payment dates for {year}</td><td>{estimatedTaxDates(year).join(", ")}</td></tr>
          {s.profile?.notes ? <tr><td>Notes</td><td>{s.profile.notes}</td></tr> : null}
        </tbody></table>
        <p className="mlo-note" style={{ marginTop: 18 }}>Sources: IRS business standard mileage rates; IRC 274(n) (meals, 50%) and 274(b) (gifts, $25 per recipient); Rev. Proc. 2013-13 (simplified home office). Health insurance, retirement contributions and self-employment tax are handled on other forms; ask your CPA.</p>
      </div>
    </PageShell>
  );
}
