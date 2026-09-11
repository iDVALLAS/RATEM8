"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { monthlyPI } from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents, formatMonths } from "@/lib/calc/format";

/**
 * /tools/refi-breakeven — how many months until a refinance pays for
 * itself? Compares your current monthly P&I vs. the new monthly P&I
 * at the new rate/balance, then divides closing costs by monthly
 * savings.
 *
 * If the "when will you sell / refinance again" horizon is shorter
 * than the breakeven, the refi is a net loss. Says so explicitly.
 */
export default function RefiBreakevenPage() {
  const [balance, setBalance] = useState(450_000);
  const [currentRate, setCurrentRate] = useState(7.5);
  const [newRate, setNewRate] = useState(6.375);
  const [termYears, setTermYears] = useState(30);
  const [closingCosts, setClosingCosts] = useState(6500);
  const [horizonYears, setHorizonYears] = useState(7);

  const results = useMemo(() => {
    const termMonths = termYears * 12;
    const currentPI = monthlyPI(balance, currentRate, termMonths);
    const newPI = monthlyPI(balance, newRate, termMonths);
    const monthlySavings = currentPI - newPI;
    const breakevenMonths = monthlySavings > 0 ? closingCosts / monthlySavings : Infinity;
    const horizonMonths = horizonYears * 12;
    const netSavings = monthlySavings * horizonMonths - closingCosts;
    return {
      currentPI,
      newPI,
      monthlySavings,
      breakevenMonths,
      netSavings,
      horizonMonths,
    };
  }, [balance, currentRate, newRate, termYears, closingCosts, horizonYears]);

  const worthIt = results.netSavings > 0 && results.monthlySavings > 0;

  return (
    <CalcLayout
      eyebrow="Refinance breakeven"
      title="How long until this refi pays for itself?"
      lede="The number your current lender won't put in the offer letter — how many months you need to stay in the loan before the closing costs are earned back."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Current balance" value={balance} onChange={setBalance} />
          <PercentInput label="Current rate" value={currentRate} onChange={setCurrentRate} />
          <PercentInput label="New rate" value={newRate} onChange={setNewRate} />
          <CalcInput label="Term" value={termYears} onChange={setTermYears} suffix="yrs" min={1} max={40} />
          <DollarInput
            label="Closing costs"
            value={closingCosts}
            onChange={setClosingCosts}
            step={100}
            hint="Origination + title + appraisal + escrow. Ask for a Loan Estimate."
          />
          <CalcInput
            label="How long you'll keep the loan"
            value={horizonYears}
            onChange={setHorizonYears}
            suffix="yrs"
            min={1}
            max={30}
            hint="Selling or refinancing again? Use that horizon."
          />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Breakeven" highlight>
            <ResultRow
              label="Months to break even"
              value={
                isFinite(results.breakevenMonths)
                  ? formatMonths(results.breakevenMonths)
                  : "Never (new rate ≥ current rate)"
              }
              emphasis
            />
            <ResultRow
              label="Monthly savings"
              value={formatDollarsCents(results.monthlySavings)}
            />
          </ResultCard>

          <ResultCard title={`Net over ${horizonYears} years`}>
            <ResultRow
              label="Net savings after closing costs"
              value={formatDollars(results.netSavings)}
              hint={
                worthIt
                  ? "Refi pays off within your horizon."
                  : "Refi does NOT pay off within your horizon. Skip unless something else changed."
              }
            />
          </ResultCard>

          <ResultCard title="Payment side-by-side">
            <ResultRow label="Current P&I" value={formatDollarsCents(results.currentPI)} />
            <ResultRow label="New P&I" value={formatDollarsCents(results.newPI)} />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
