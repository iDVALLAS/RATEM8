"use client";

import SampleBadge from "@/components/SampleBadge";
import { leContent, leSample as s, type LeSectionId } from "@/lib/content/loan-estimate";

/**
 * LoanEstimateDiagram — an HTML/CSS mock of the three-page Loan Estimate
 * built from `.doc` classes. Every section is a `.doc__field` region with
 * a numbered callout button; the active region carries `.is-found`.
 *
 * All figures are fictional (see lib/content/loan-estimate.ts) and every
 * page carries a SampleBadge.
 */
type Props = {
  active: LeSectionId | null;
  onSelect: (id: LeSectionId) => void;
};

export default function LoanEstimateDiagram({ active, onSelect }: Props) {
  return (
    <div className="le-pages">
      {/* ───────── Page 1 ───────── */}
      <Page n={1}>
        <div className="le-meta">
          <div>
            <span>Applicant</span>
            <b>{s.applicant}</b>
          </div>
          <div>
            <span>Property</span>
            <b>{s.property}</b>
          </div>
          <div>
            <span>Sale price</span>
            <b>{s.salePrice}</b>
          </div>
          <div>
            <span>Loan term</span>
            <b>{s.loanTerm}</b>
          </div>
          <div>
            <span>Purpose</span>
            <b>{s.purpose}</b>
          </div>
          <div>
            <span>Product</span>
            <b>{s.product}</b>
          </div>
          <div>
            <span>Loan type</span>
            <b>{s.loanType}</b>
          </div>
          <div>
            <span>Loan ID #</span>
            <b>{s.loanId}</b>
          </div>
          <div>
            <span>Rate lock</span>
            <b>{s.rateLock}</b>
          </div>
        </div>

        <Region id="loan-terms" n={1} title="Loan Terms" active={active} onSelect={onSelect}>
          <Term label="Loan Amount" value={s.loanAmount} q="Can this amount increase after closing?" />
          <Term label="Interest Rate" value={s.interestRate} q="Can this amount increase after closing?" />
          <Term label="Monthly Principal & Interest" value={s.pi} q="Can this amount increase after closing?" />
          <Term label="Prepayment Penalty" q="Does the loan have this feature?" />
          <Term label="Balloon Payment" q="Does the loan have this feature?" last />
        </Region>

        <Region id="projected-payments" n={2} title="Projected Payments" active={active} onSelect={onSelect}>
          <div className="doc__row">
            <span>Payment Calculation</span>
            <b>Years 1–30</b>
          </div>
          <div className="doc__row">
            <span>Principal &amp; Interest</span>
            <span>{s.pi}</span>
          </div>
          <div className="doc__row">
            <span>Mortgage Insurance</span>
            <span>+ {s.mi}</span>
          </div>
          <div className="doc__row">
            <span>Estimated Escrow</span>
            <span>+ {s.escrow}</span>
          </div>
          <div className="doc__row le-total">
            <span>Estimated Total Monthly Payment</span>
            <span>{s.totalPayment}</span>
          </div>
          <div className="le-note-row">
            Estimated Taxes, Insurance &amp; Assessments: {s.escrowMonthly} a month. Property taxes: YES, in escrow. Homeowner&apos;s insurance: YES, in escrow.
          </div>
        </Region>

        <Region id="costs-at-closing" n={3} title="Costs at Closing" active={active} onSelect={onSelect}>
          <div className="doc__row">
            <span>Estimated Closing Costs</span>
            <span className="le-big">{s.closingCosts}</span>
          </div>
          <div className="le-note-row">
            Includes {s.d} in Loan Costs + {s.i} in Other Costs – {s.lenderCredits} in Lender Credits.
          </div>
          <div className="doc__row" style={{ borderBottom: 0 }}>
            <span>Estimated Cash to Close</span>
            <span className="le-big">{s.cashToClose}</span>
          </div>
          <div className="le-note-row">Includes Closing Costs. See Calculating Cash to Close on page 2 for details.</div>
        </Region>
      </Page>

      {/* ───────── Page 2 ───────── */}
      <Page n={2}>
        <div className="le-grid2">
          <Region id="loan-costs" n={4} title="Loan Costs" active={active} onSelect={onSelect}>
            <Block letter="A" title="Origination Charges" total={s.a.total} rows={s.a.rows} />
            <Block letter="B" title="Services You Cannot Shop For" total={s.b.total} rows={s.b.rows} />
            <Block letter="C" title="Services You Can Shop For" total={s.c.total} rows={s.c.rows} />
            <div className="doc__row le-total">
              <span>D. TOTAL LOAN COSTS (A + B + C)</span>
              <span>{s.d}</span>
            </div>
          </Region>

          <Region id="other-costs" n={5} title="Other Costs" active={active} onSelect={onSelect}>
            <Block letter="E" title="Taxes and Other Government Fees" total={s.e.total} rows={s.e.rows} />
            <Block letter="F" title="Prepaids" total={s.f.total} rows={s.f.rows} />
            <Block letter="G" title="Initial Escrow Payment at Closing" total={s.g.total} rows={s.g.rows} />
            <Block letter="H" title="Other" total={s.h.total} rows={s.h.rows} />
            <div className="doc__row le-total">
              <span>I. TOTAL OTHER COSTS (E + F + G + H)</span>
              <span>{s.i}</span>
            </div>
          </Region>
        </div>

        <div className="le-grid2">
          <Region id="total-closing-costs" n={6} title="Total Closing Costs" active={active} onSelect={onSelect}>
            <div className="doc__row">
              <span>D + I</span>
              <span>{s.dPlusI}</span>
            </div>
            <div className="doc__row">
              <span>Lender Credits</span>
              <span>{s.lenderCredits}</span>
            </div>
            <div className="doc__row le-total">
              <span>J. TOTAL CLOSING COSTS</span>
              <span>{s.j}</span>
            </div>
          </Region>

          <Region id="cash-to-close" n={7} title="Calculating Cash to Close" active={active} onSelect={onSelect}>
            {s.cash.map(([k, v], i) => (
              <div key={k} className={`doc__row ${i === s.cash.length - 1 ? "le-total" : ""}`}>
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </Region>
        </div>
      </Page>

      {/* ───────── Page 3 ───────── */}
      <Page n={3}>
        <Region id="comparisons" n={8} title="Comparisons" active={active} onSelect={onSelect}>
          <div className="le-note-row" style={{ paddingTop: 0 }}>
            Use these measures to compare this loan with other loans.
          </div>
          <div className="doc__row">
            <span>
              <b>In 5 Years</b>
            </span>
            <span style={{ textAlign: "right" }}>
              <b>{s.in5Total}</b> Total you will have paid in principal, interest, mortgage insurance, and loan costs.
              <br />
              <b>{s.in5Principal}</b> Principal you will have paid off.
            </span>
          </div>
          <div className="doc__row">
            <span>
              <b>Annual Percentage Rate (APR)</b>
            </span>
            <span style={{ textAlign: "right" }}>
              <b>{s.apr}</b> Your costs over the loan term expressed as a rate. This is not your interest rate.
            </span>
          </div>
          <div className="doc__row" style={{ borderBottom: 0 }}>
            <span>
              <b>Total Interest Percentage (TIP)</b>
            </span>
            <span style={{ textAlign: "right" }}>
              <b>{s.tip}</b> The total amount of interest that you will pay over the loan term as a percentage of your loan amount.
            </span>
          </div>
        </Region>

        <Region id="other-considerations" n={9} title="Other Considerations" active={active} onSelect={onSelect}>
          {s.other.map(([k, v]) => (
            <div key={k} className="doc__row">
              <b style={{ flex: "0 0 34%" }}>{k}</b>
              <span style={{ textAlign: "right" }}>{v}</span>
            </div>
          ))}
          <div className="le-note-row" style={{ marginTop: 6 }}>
            <b>Confirm Receipt.</b> By signing, you are only confirming that you have received this form. You do not have to accept this loan because you have signed or received this form.
          </div>
          <div className="le-sig" aria-hidden="true">
            <div>Applicant Signature · Date</div>
            <div>Co-Applicant Signature · Date</div>
          </div>
        </Region>
      </Page>
    </div>
  );
}

/* ───────── pieces ───────── */

function Page({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="doc le-page" aria-label={`Loan Estimate, ${leContent.pageLabel(n)} (sample)`}>
      <div className="le-page__head">
        <span className="le-page__title">Loan Estimate</span>
        <span className="flex items-center gap-2">
          <SampleBadge />
          <span className="le-page__num">{leContent.pageLabel(n).toUpperCase()}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function Region({
  id,
  n,
  title,
  active,
  onSelect,
  children,
}: {
  id: LeSectionId;
  n: number;
  title: string;
  active: LeSectionId | null;
  onSelect: (id: LeSectionId) => void;
  children: React.ReactNode;
}) {
  const on = active === id;
  return (
    <div
      id={`le-region-${id}`}
      className={`doc__field le-region ${on ? "is-found" : ""}`}
      onClick={() => onSelect(id)}
      data-section={id}
    >
      <div className="le-region__title">
        <span>{title}</span>
        <button
          type="button"
          className="le-callout"
          aria-pressed={on}
          aria-label={`${n}. ${title}: show explanation`}
          aria-controls={`le-note-${id}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(id);
          }}
        >
          {n}
        </button>
      </div>
      {children}
    </div>
  );
}

function Term({ label, value, q, last = false }: { label: string; value?: string; q: string; last?: boolean }) {
  return (
    <div className="le-term" style={last ? { borderBottom: 0 } : undefined}>
      <div>
        <span>{label}</span>
        {value ? <span className="le-big">{value}</span> : null}
      </div>
      <div>
        <span className="le-sub">{q}</span>
        <span className="le-yesno">NO</span>
      </div>
    </div>
  );
}

function Block({ letter, title, total, rows }: { letter: string; title: string; total: string; rows: readonly (readonly [string, string])[] }) {
  return (
    <>
      <div className="doc__section" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>
          {letter}. {title}
        </span>
        <span>{total}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="doc__row">
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </>
  );
}
