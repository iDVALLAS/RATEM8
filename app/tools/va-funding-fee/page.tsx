"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { formatDollars, formatPercent1 } from "@/lib/calc/format";

/**
 * /tools/va-funding-fee — VA funding fee estimate.
 *
 * Rates below reflect VA schedules effective April 2023 through 2028
 * per Public Law 116-315 (Blue Water Navy Vietnam Veterans Act
 * extension), for VA purchase and cash-out refinance loans.
 *
 * IRRRL (streamline refi) is a flat 0.5% regardless of down payment
 * or use count. Not included in this calculator (separate tool).
 *
 * Exemptions from the fee (not asked here; borrower knows their
 * status): veterans receiving VA disability compensation, surviving
 * spouses receiving DIC, active-duty Purple Heart recipients.
 *
 * Confirmation of exact fee always happens at the LO stage — this
 * is estimate-only. Compliance note in the footer of the page.
 */

// Purchase / Construction rates. Cash-out refi shares the "first use"
// vs "subsequent use" split but uses slightly different tiers.
// For simplicity + accuracy on the common case, we cover purchase.
type UseCount = "first" | "subsequent";

function getFundingFeeRate(downPct: number, useCount: UseCount): number {
  if (useCount === "first") {
    if (downPct < 5) return 2.15;
    if (downPct < 10) return 1.5;
    return 1.25;
  }
  // subsequent use
  if (downPct < 5) return 3.3;
  if (downPct < 10) return 1.5;
  return 1.25;
}

export default function VAFundingFeePage() {
  const [homePrice, setHomePrice] = useState(500_000);
  const [downPct, setDownPct] = useState(0);
  const [useCount, setUseCount] = useState<UseCount>("first");
  const [rollIntoLoan, setRollIntoLoan] = useState(true);

  const results = useMemo(() => {
    const downPayment = homePrice * (downPct / 100);
    const baseLoan = homePrice - downPayment;
    const feePct = getFundingFeeRate(downPct, useCount);
    const fee = baseLoan * (feePct / 100);
    const totalLoan = rollIntoLoan ? baseLoan + fee : baseLoan;
    return { downPayment, baseLoan, feePct, fee, totalLoan };
  }, [homePrice, downPct, useCount, rollIntoLoan]);

  return (
    <CalcLayout
      eyebrow="VA funding fee"
      title="What's the VA funding fee on this loan?"
      lede="Every VA loan carries a one-time funding fee. It varies by down payment and whether it's your first VA loan or a subsequent one. Most borrowers roll it into the loan — costs a bit more in interest, no cash out of pocket."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Home price" value={homePrice} onChange={setHomePrice} />
          <PercentInput
            label="Down payment"
            value={downPct}
            onChange={setDownPct}
            step={0.5}
            min={0}
            max={100}
            hint="VA allows 0%. Larger downs reduce the fee tier."
          />

          <div className="flex flex-col gap-2">
            <span className="principle-label">VA loan use</span>
            <div className="flex gap-2">
              <button
                onClick={() => setUseCount("first")}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: useCount === "first" ? "var(--accent-soft)" : "transparent",
                  color: useCount === "first" ? "var(--accent)" : "var(--muted)",
                  border: `1px solid ${useCount === "first" ? "var(--accent)" : "var(--rule)"}`,
                }}
              >
                First-time use
              </button>
              <button
                onClick={() => setUseCount("subsequent")}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: useCount === "subsequent" ? "var(--accent-soft)" : "transparent",
                  color: useCount === "subsequent" ? "var(--accent)" : "var(--muted)",
                  border: `1px solid ${useCount === "subsequent" ? "var(--accent)" : "var(--rule)"}`,
                }}
              >
                Subsequent use
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 mt-4">
            <input
              type="checkbox"
              checked={rollIntoLoan}
              onChange={(e) => setRollIntoLoan(e.target.checked)}
            />
            <span className="text-sm" style={{ color: "var(--fg)" }}>
              Roll the fee into the loan (typical)
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Funding fee" highlight>
            <ResultRow
              label="Funding fee"
              value={formatDollars(results.fee)}
              emphasis
              hint={`${formatPercent1(results.feePct)} of the base loan amount`}
            />
          </ResultCard>

          <ResultCard title="Loan structure">
            <ResultRow label="Down payment" value={formatDollars(results.downPayment)} />
            <ResultRow label="Base loan" value={formatDollars(results.baseLoan)} />
            <ResultRow
              label={rollIntoLoan ? "Total loan (with fee rolled in)" : "Total loan (fee paid at close)"}
              value={formatDollars(results.totalLoan)}
            />
          </ResultCard>

          <ResultCard>
            <ResultRow
              label="Exempt from the fee?"
              value="Talk to Jason"
              hint="Veterans receiving VA disability compensation, DIC-receiving surviving spouses, and active-duty Purple Heart recipients are exempt. Jason confirms via COE at file start."
            />
          </ResultCard>

          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Fee schedule reflects VA rates in effect through Sept 2028. Cash-out
            refi and IRRRL streamline refi use separate fee tables — not this
            calculator. Estimate only; exact fee is confirmed on your Loan
            Estimate.
          </p>
        </div>
      </div>
    </CalcLayout>
  );
}
