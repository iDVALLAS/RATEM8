"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { LICENSED_STATES, STATE_FULL_NAMES } from "@/lib/states";
import type { StateCode } from "@/lib/licensing";
import { formatDollars, formatPercent1 } from "@/lib/calc/format";

/**
 * /tools/closing-costs — RANGE estimator, not a quote.
 *
 * Purposefully returns a range (low/high) rather than a single number
 * so no visitor mistakes this for a Loan Estimate. TRID compliance:
 * an actual quote requires the six pieces of borrower info that
 * trigger LE issuance. This calculator does not collect those.
 *
 * State-aware coefficients reflect typical ranges observed across
 * counties in the LICENSED_STATES set. Not authoritative — actual
 * closing costs vary by county recording fees, title company chosen,
 * lender fees, and borrower-shopped items (survey, pest).
 */

// Rough coefficients (low/high as % of home price) for state-level averages.
// TX is notably higher due to state title insurance rates being set by regulators.
const STATE_COEFFICIENTS: Record<StateCode, { low: number; high: number }> = {
  WA: { low: 1.5, high: 3.0 },
  AZ: { low: 1.4, high: 2.8 },
  CA: { low: 1.3, high: 2.8 },
  TX: { low: 2.0, high: 3.5 },
};

export default function ClosingCostsPage() {
  const [homePrice, setHomePrice] = useState(600_000);
  const [downPct, setDownPct] = useState(20);
  const [state, setState] = useState<StateCode>("WA");

  const results = useMemo(() => {
    const coef = STATE_COEFFICIENTS[state];
    const loanAmount = homePrice * (1 - downPct / 100);
    const lowTotal = homePrice * (coef.low / 100);
    const highTotal = homePrice * (coef.high / 100);
    // Rough breakdowns (illustrative — real numbers come from the LE):
    const originationLow = loanAmount * 0.005; // 0.5%
    const originationHigh = loanAmount * 0.015; // 1.5%
    const titleLow = homePrice * 0.003;
    const titleHigh = homePrice * 0.008;
    const escrowLow = homePrice * 0.001;
    const escrowHigh = homePrice * 0.003;
    // Third-party (appraisal, credit, inspection etc.) rough flat
    const thirdPartyLow = 900;
    const thirdPartyHigh = 1800;
    return {
      loanAmount,
      lowTotal,
      highTotal,
      originationLow,
      originationHigh,
      titleLow,
      titleHigh,
      escrowLow,
      escrowHigh,
      thirdPartyLow,
      thirdPartyHigh,
      pctLow: coef.low,
      pctHigh: coef.high,
    };
  }, [homePrice, downPct, state]);

  return (
    <CalcLayout
      eyebrow="Closing costs"
      title="What will closing on this house probably cost?"
      lede="A range, not a quote. Closing costs vary by state title-insurance rates, county recording fees, lender origination charges, and which third parties you use. Use this to budget; get the actual number on your Loan Estimate."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Home price" value={homePrice} onChange={setHomePrice} />
          <PercentInput
            label="Down payment %"
            value={downPct}
            onChange={setDownPct}
            step={1}
          />

          <div className="flex flex-col gap-2">
            <span className="principle-label">State</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value as StateCode)}
              className="rounded-lg px-4 py-2 text-base bg-transparent"
              style={{
                border: "1px solid var(--rule)",
                color: "var(--fg)",
              }}
            >
              {LICENSED_STATES.map((s) => (
                <option key={s} value={s} style={{ background: "var(--bg)" }}>
                  {STATE_FULL_NAMES[s]}
                </option>
              ))}
            </select>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              LoanM8 currently supports {LICENSED_STATES.join(", ")}. Coefficients
              reflect typical state-wide averages.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Estimated range" highlight>
            <ResultRow
              label="Total closing costs"
              value={`${formatDollars(results.lowTotal)} – ${formatDollars(results.highTotal)}`}
              emphasis
              hint={`Approximately ${formatPercent1(results.pctLow)}–${formatPercent1(results.pctHigh)} of the home price in ${STATE_FULL_NAMES[state]}.`}
            />
          </ResultCard>

          <ResultCard title="Rough breakdown">
            <ResultRow
              label="Lender fees (origination, underwriting)"
              value={`${formatDollars(results.originationLow)} – ${formatDollars(results.originationHigh)}`}
              hint="Loan-amount based. Wholesale brokers usually run low end."
            />
            <ResultRow
              label="Title insurance + settlement"
              value={`${formatDollars(results.titleLow)} – ${formatDollars(results.titleHigh)}`}
              hint="Home-price based. TX rates are regulated; other states vary by carrier."
            />
            <ResultRow
              label="Escrow + recording"
              value={`${formatDollars(results.escrowLow)} – ${formatDollars(results.escrowHigh)}`}
              hint="Set by county and escrow company."
            />
            <ResultRow
              label="Third-party (appraisal, credit, inspection)"
              value={`${formatDollars(results.thirdPartyLow)} – ${formatDollars(results.thirdPartyHigh)}`}
              hint="Roughly flat regardless of loan size."
            />
          </ResultCard>

          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Rough state-level averages. Actual costs vary by county recording
            fees, title company, lender origination, and borrower-shopped
            services (survey, pest, HOA doc fees). Prepaids (upfront escrow
            deposit + interim interest) are NOT included — those add roughly
            2–8 months of tax + insurance on top of the numbers here. Your
            Loan Estimate has the exact figure.
          </p>
        </div>
      </div>
    </CalcLayout>
  );
}
