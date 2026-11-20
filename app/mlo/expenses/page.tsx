import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { listenOn } from "@/lib/voice/google";
import { ccAnthropicKey } from "@/lib/concierge/agent";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/expenses/categories";
import { expenseStore, type Entry } from "@/lib/expenses/store";
import { pacificToday, yearSummary } from "@/lib/expenses/service";
import { mileageRate, nextEstimatedDate } from "@/lib/expenses/tax";
import { FlashBox, MloNav } from "../MloChrome";
import Tell from "./Tell";
import { profileAction, removeEntryAction, saveEntryAction } from "./actions";
import "../mlo.css";
import "./expenses.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Expenses", robots: { index: false, follow: false } };

const $ = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function EntryFields({ e, today }: { e: Partial<Entry> & { kind: Entry["kind"] }; today: string }) {
  return (
    <div className="ex-fields">
      <label className="mlo-field"><span>Type</span>
        <select name="kind" defaultValue={e.kind} className="mlo-select">
          <option value="expense">Expense</option>
          <option value="mileage">Business miles</option>
          <option value="charity">Charity miles</option>
          <option value="income">Income</option>
        </select>
      </label>
      <label className="mlo-field"><span>Date</span><input type="date" name="date" defaultValue={e.date ?? today} max={today} className="mlo-input" required /></label>
      <label className="mlo-field"><span>Amount $</span><input type="number" name="dollars" min={0} step="0.01" defaultValue={e.kind === "mileage" || e.kind === "charity" || !e.amountCents ? "" : (e.amountCents / 100).toFixed(2)} className="mlo-input" inputMode="decimal" /></label>
      <label className="mlo-field"><span>Miles</span><input type="number" name="miles" min={0} step="0.1" defaultValue={e.miles ?? ""} className="mlo-input" inputMode="decimal" /></label>
      <label className="mlo-field"><span>Vendor or payer</span><input name="vendor" defaultValue={e.vendor ?? ""} maxLength={80} className="mlo-input" /></label>
      <label className="mlo-field"><span>Category</span>
        <select name="category" defaultValue={e.category ?? "other"} className="mlo-select">
          {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].label} (line {CATEGORIES[k].line})</option>)}
        </select>
      </label>
      <label className="mlo-field"><span>Business %</span><input type="number" name="businessPct" min={1} max={100} step={1} defaultValue={e.businessPct ?? 100} className="mlo-input" inputMode="numeric" /></label>
      <label className="mlo-field ex-wide"><span>Business purpose</span><input name="purpose" defaultValue={e.purpose ?? ""} maxLength={200} className="mlo-input" placeholder="Who, where and why (the IRS asks)" /></label>
      <label className="mlo-field"><span>Gift for (first name)</span><input name="recipient" defaultValue={e.recipient ?? ""} maxLength={40} className="mlo-input" /></label>
    </div>
  );
}

/** /mlo/expenses — the tax-ready expense tracker for 1099 loan officers (D37). */
export default async function Expenses({ searchParams }: { searchParams: Promise<{ f?: string; year?: string }> }) {
  const { f, year: y } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const today = pacificToday();
  const year = Number(y) >= 2020 && Number(y) <= Number(today.slice(0, 4)) ? Number(y) : Number(today.slice(0, 4));
  const sum = me ? await yearSummary(me, year) : null;
  const all = me ? await expenseStore().list(me.id, null) : [];
  const drafts = all.filter((e) => e.status === "draft");
  const recent = (sum?.entries ?? []).slice().reverse().slice(0, 60);
  const rate = mileageRate(today);
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Expenses</h1>
        <MloNav current="expenses" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me || !sum ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to keep your books. They&apos;re private to you.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <p className="mlo-note">For loan officers paid on a 1099. Keep the year&apos;s business expenses, income and miles here, and at year end print one report for your CPA, sorted by Schedule C line, with every receipt numbered. Only you can see this, not the owner or anyone on your team.</p>
              <div className="ex-tiles">
                <div className="ex-tile"><span className="ex-tile__k">{year} income</span><span className="ex-tile__v">{$(sum.incomeCents)}</span></div>
                <div className="ex-tile"><span className="ex-tile__k">Expenses that count</span><span className="ex-tile__v">{$(sum.expenseCents)}</span></div>
                <div className="ex-tile"><span className="ex-tile__k">Business miles</span><span className="ex-tile__v">{sum.miles.miles.toLocaleString("en-US")}</span></div>
                <div className="ex-tile"><span className="ex-tile__k">Next estimated tax payment</span><span className="ex-tile__v">{nice(nextEstimatedDate(today))}</span></div>
              </div>
              <p className="mlo-row-form" style={{ marginTop: 12 }}>
                <Link href={`/mlo/expenses/report?year=${year}`} className="mlo-btn" style={{ marginTop: 0 }}>Year-end report for your CPA</Link>
                <a href={`/api/cc/expenses/csv?year=${year}`} className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Download CSV</a>
              </p>
            </section>

            <section className="mlo-section" id="tell">
              <h2>Add something</h2>
              <Tell micOn={listenOn("cc")} aiOn={!!ccAnthropicKey()} />
              {rate ? <p className="mlo-note" style={{ marginTop: 8 }}>Miles are counted at the IRS business rate for the trip&apos;s date ({rate.cents}¢ a mile today; {rate.source}).</p> : null}
            </section>

            <section className="mlo-section" id="drafts">
              <h2>To confirm ({drafts.length})</h2>
              {drafts.length === 0 ? <p className="mlo-note">Nothing waiting.</p> : (
                <ol className="ex-drafts">
                  {drafts.map((d) => (
                    <li key={d.id} className="cc-card">
                      <p className="cc-card__title">{d.source === "receipt" ? "From a receipt" : "From what you told M8"}{d.receiptId ? <> · <a href={`/api/cc/expenses/receipt/${d.receiptId}`} target="_blank" rel="noopener noreferrer">see the receipt</a></> : null}</p>
                      <form action={saveEntryAction.bind(null, d.id)} className="mlo-grid">
                        <EntryFields e={d} today={today} />
                        <div className="mlo-row-form">
                          <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Confirm</button>
                          <button type="submit" formAction={removeEntryAction.bind(null, d.id)} formNoValidate className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Delete</button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ol>
              )}
              <details className="mlo-details">
                <summary>Add one by hand</summary>
                <form action={saveEntryAction.bind(null, null)} className="mlo-grid">
                  <EntryFields e={{ kind: "expense" }} today={today} />
                  <button type="submit" className="mlo-btn">Save</button>
                </form>
              </details>
            </section>

            <section className="mlo-section" id="entries">
              <h2>{year} so far</h2>
              <form className="mlo-row-form" action="/mlo/expenses" method="get">
                <label className="mlo-field" style={{ maxWidth: 140 }}><span>Year</span><input type="number" name="year" min={2020} max={Number(today.slice(0, 4))} defaultValue={year} className="mlo-input" /></label>
                <button type="submit" className="mlo-btn mlo-btn--ghost">Show</button>
              </form>
              {sum.lines.length ? (
                <table className="mlo-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>Schedule C line</th><th>Counts</th></tr></thead>
                  <tbody>{sum.lines.map((l) => <tr key={l.line}><td>Line {l.line}: {l.name}</td><td>{$(l.cents)}</td></tr>)}</tbody>
                </table>
              ) : null}
              {recent.length === 0 ? <p className="mlo-note">Nothing confirmed for {year} yet.</p> : (
                <table className="mlo-table" style={{ marginTop: 14 }}>
                  <thead><tr><th>Date</th><th>What</th><th>Amount</th><th></th></tr></thead>
                  <tbody>
                    {recent.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.kind === "income" ? "Income" : e.kind === "charity" ? "Charity miles" : CATEGORIES[e.category].label}{e.vendor ? ` · ${e.vendor}` : ""}<br /><span className="mlo-note">{e.purpose}{e.miles !== null ? ` · ${e.miles} mi` : ""}{e.businessPct < 100 ? ` · ${e.businessPct}% business` : ""}{e.receiptId ? " · receipt" : ""}</span></td>
                        <td>{$(e.amountCents)}</td>
                        <td><form action={removeEntryAction.bind(null, e.id)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} aria-label={`Delete ${e.date} ${e.vendor}`}>Delete</button></form></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {sum.membership.months ? <p className="mlo-note" style={{ marginTop: 8 }}>Your LoanM8 membership ({sum.membership.months} {sum.membership.months === 1 ? "month" : "months"}, {$(sum.membership.cents)}) is added for you from Membership.</p> : null}
            </section>

            <section className="mlo-section" id="year">
              <h2>For the {year} report</h2>
              <form action={profileAction.bind(null, year)} className="mlo-grid">
                <label className="mlo-field" style={{ maxWidth: 260 }}><span>Home office, square feet (used only for work; 0 for none)</span><input type="number" name="sqft" min={0} max={5000} step={1} defaultValue={sum.profile?.homeOfficeSqFt ?? 0} className="mlo-input" /></label>
                <label className="mlo-field"><span>Notes for your CPA</span><textarea name="notes" rows={2} maxLength={1000} defaultValue={sum.profile?.notes ?? ""} className="mlo-textarea" /></label>
                <button type="submit" className="mlo-btn">Save</button>
              </form>
              <p className="mlo-note">The report uses the simplified home office method ($5 a square foot, up to 300). Your CPA may use the regular method instead.</p>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
