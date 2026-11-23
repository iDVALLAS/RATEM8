import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { contactStore, listAll } from "@/lib/contacts/store";
import { scopeOf, summarize } from "@/lib/contacts/service";
import { refinanceReference } from "@/lib/today/facts";
import { estimate } from "@/lib/refi/watch";
import { FlashBox, MloNav } from "../MloChrome";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refi watch", robots: { index: false, follow: false } };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (s: string | undefined, d: number, lo: number, hi: number) => {
  const v = Number(s);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : d;
};

/** /mlo/refi — past clients who may be worth a refinance look, with estimated numbers (D12). Loan officer's eyes only. */
export default async function RefiWatch({ searchParams }: { searchParams: Promise<{ f?: string; ref?: string; cost?: string; gap?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const priced = await refinanceReference();
  const refRate = num(sp.ref, priced?.rate ?? 0, 1, 15);
  const cost = num(sp.cost, 4000, 0, 50000);
  const minGap = num(sp.gap, 0.5, 0, 5);
  const now = new Date();
  const { contacts } = me ? await listAll({ ownerUserId: scopeOf(me), kind: "contact" }) : { contacts: [] };
  const consents = me ? await contactStore().consentsFor(contacts.map((c) => c.id)) : [];
  const rows = refRate
    ? contacts
        .filter((c) => !c.locked && c.loan?.amount && c.loan.noteRate && c.loan.closedOn)
        .map((c) => ({ c, e: estimate({ amount: c.loan!.amount!, noteRate: c.loan!.noteRate!, closedOn: c.loan!.closedOn! }, refRate, cost, now), stopped: Object.values(summarize(consents.filter((x) => x.contactId === c.id))).some((p) => p.service.evidence === "revoked" || p.marketing.evidence === "revoked") }))
        .filter((r) => r.e && r.e.gap >= minGap)
        .sort((a, b) => b.e!.monthly30 - a.e!.monthly30)
    : [];

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="refi" title="Refi watch" />
        <MloNav current="refi" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(sp.f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your refi watch.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>Past clients who may be worth a look</h2>
              <p className="mlo-note">
                For your eyes only, and only estimates: from each loan&apos;s original amount, note rate and closing date, assuming a 30-year fixed loan paid on schedule. Price their real scenario (today&apos;s balance, value, credit and costs) before you say anything about rates or savings to a client.
              </p>
              <form className="mlo-row-form" method="get">
                <label className="mlo-field" style={{ flex: "1 1 220px" }}><span>Compare with this rate (%){priced ? `: today's priced example is ${priced.rate}% for a ${priced.label}, priced ${new Date(priced.pricedAt).toLocaleDateString("en-US")}` : ": no priced example today, so enter your own"}</span><input name="ref" inputMode="decimal" defaultValue={refRate || ""} placeholder="6.25" /></label>
                <label className="mlo-field" style={{ flex: "1 1 220px" }}><span>Estimated closing costs ($)</span><input name="cost" inputMode="numeric" defaultValue={cost} /></label>
                <label className="mlo-field" style={{ flex: "1 1 220px" }}><span>Show rates at least this much higher (points)</span><input name="gap" inputMode="decimal" defaultValue={minGap} /></label>
                <button type="submit" className="mlo-btn">Update</button>
              </form>
            </section>

            <section className="mlo-section">
              <h2>{refRate ? `${rows.length} ${rows.length === 1 ? "client" : "clients"}` : "Enter a rate to compare"}</h2>
              {refRate && rows.length === 0 ? <p className="mlo-note">No past clients with a rate {minGap} or more above {refRate}%. Clients need a loan amount, note rate and closing date on file (from your import or your loan system).</p> : null}
              {rows.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="mlo-table">
                    <thead>
                      <tr><th>Client</th><th>Their loan</th><th>Est. balance</th><th>New 30-year: est. change</th><th>Same term left: est. change</th><th></th></tr>
                    </thead>
                    <tbody>
                      {rows.map(({ c, e, stopped }) => (
                        <tr key={c.id}>
                          <th scope="row"><Link href={`/mlo/contacts/${c.id}`}>{`${c.firstName} ${c.lastName}`.trim()}</Link>{stopped ? <><br /><span className="mlo-note">said stop</span></> : null}</th>
                          <td>{c.loan!.noteRate}% · {c.loan!.closedOn!.slice(0, 4)}<br /><span className="mlo-note">{money(c.loan!.amount!)} · {e!.gap} above</span></td>
                          <td>{money(e!.balance)}<br /><span className="mlo-note">{Math.round(e!.monthsLeft / 12)} yrs left</span></td>
                          <td>{e!.monthly30 > 0 ? `about ${money(e!.monthly30)}/mo less` : "no lower"}<br /><span className="mlo-note">{e!.breakEven30 ? `costs back in ~${e!.breakEven30} mo; restarts 30 years` : ""}</span></td>
                          <td>{e!.monthlySameTerm > 0 ? `about ${money(e!.monthlySameTerm)}/mo less` : e!.monthlySameTerm < 0 ? `about ${money(-e!.monthlySameTerm)}/mo more` : "about the same"}<br /><span className="mlo-note">{e!.breakEvenSameTerm ? `costs back in ~${e!.breakEvenSameTerm} mo` : ""}</span></td>
                          <td><Link href={`/mlo/contacts/${c.id}#script`}>Script</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="mlo-note" style={{ marginTop: 8 }}>Principal and interest only (taxes, insurance and mortgage insurance aren&apos;t included). Your public <Link href="/calculators/refinance-breakeven">refinance break-even calculator</Link> is there for clients.</p>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
