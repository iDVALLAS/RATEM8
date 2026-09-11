"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { biWeeklyComparison } from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents, formatMonths } from "@/lib/calc/format";

/**
 * /tools/bi-weekly — pay half your monthly P&I every 2 weeks.
 *
 * The math: 26 half-payments/year = 13 monthly equivalents (vs 12
 * with monthly). The extra one per year, applied to principal,
 * shaves years off the loan and saves substantial interest.
 *
 * Warning included: some servicers charge a fee to enroll in a
 * bi-weekly program. The DIY equivalent is adding 1/12 of your
 * payment to each monthly payment — same math, no fee.
 */
export default function BiWeeklyPage() {
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [rate, setRate] = useState(6.375);
  const [termYears, setTermYears] = useState(30);

  const results = useMemo(() => {
    return biWeeklyComparison(loanAmount, rate, termYears * 12);
  }, [loanAmount, rate, termYears]);

  return (
    <CalcLayout
      eyebrow="Bi-weekly payments"
      title="What if you paid every two weeks instead of monthly?"
      lede="Half your monthly payment, every two weeks. That's 26 half-payments a year — the equivalent of 13 monthly payments instead of 12. The extra one goes to principal, and the compound effect over 30 years is bigger than most people expect."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Loan amount" value={loanAmount} onChange={setLoanAmount} />
          <PercentInput label="Rate" value={rate} onChange={setRate} />
          <CalcInput label="Term" value={termYears} onChange={setTermYears} suffix="yrs" min={1} max={40} />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="What you save" highlight>
            <ResultRow
              label="Months shaved off loan"
              value={formatMonths(results.monthsShaved)}
              emphasis
            />
            <ResultRow
              label="Total interest saved"
              value={formatDollars(results.interestSaved)}
            />
          </ResultCard>

          <ResultCard title="Payments side-by-side">
            <ResultRow
              label="Monthly payment"
              value={formatDollarsCents(results.monthlyPayment)}
              hint="P&I only, no taxes/insurance."
            />
            <ResultRow
              label="Bi-weekly payment"
              value={formatDollarsCents(results.biWeeklyPayment)}
              hint="Half the monthly, paid 26 times/year."
            />
            <ResultRow
              label="Effective extra per year"
              value={formatDollars(results.extraPerYear)}
              hint="One extra monthly payment / 12 spread across months."
            />
          </ResultCard>

          <ResultCard title="Payoff timeline">
            <ResultRow
              label="Original payoff"
              value={formatMonths(results.originalPayoffMonths)}
            />
            <ResultRow
              label="Bi-weekly payoff"
              value={formatMonths(results.biWeeklyPayoffMonths)}
            />
          </ResultCard>

          <ResultCard>
            <ResultRow
              label="DIY equivalent"
              value="Add 1/12 to each monthly"
              hint="If your servicer charges to enroll in bi-weekly (they sometimes do), just add 1/12 of your monthly P&I to each monthly payment. Same math, no fee, and you get to pause it if a tight month hits."
            />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
