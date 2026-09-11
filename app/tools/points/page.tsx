"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { monthlyPI } from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents, formatMonths } from "@/lib/calc/format";

/**
 * /tools/points — is paying discount points worth it?
 *
 * Cost = points × loan amount / 100. Benefit = monthly savings vs
 * no-points scenario. Breakeven = cost / monthly savings. If you'll
 * hold the loan longer than breakeven, points pay off. Common trap:
 * refinancing wipes out the sunk cost.
 */
export default function PointsPage() {
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [rateNoPoints, setRateNoPoints] = useState(6.625);
  const [rateWithPoints, setRateWithPoints] = useState(6.375);
  const [points, setPoints] = useState(1);
  const [termYears, setTermYears] = useState(30);
  const [horizonYears, setHorizonYears] = useState(7);

  const results = useMemo(() => {
    const termMonths = termYears * 12;
    const cost = (points / 100) * loanAmount;
    const paymentNoPoints = monthlyPI(loanAmount, rateNoPoints, termMonths);
    const paymentWithPoints = monthlyPI(loanAmount, rateWithPoints, termMonths);
    const monthlySavings = paymentNoPoints - paymentWithPoints;
    const breakevenMonths = monthlySavings > 0 ? cost / monthlySavings : Infinity;
    const horizonMonths = horizonYears * 12;
    const netSavings = monthlySavings * horizonMonths - cost;
    return {
      cost,
      paymentNoPoints,
      paymentWithPoints,
      monthlySavings,
      breakevenMonths,
      netSavings,
    };
  }, [loanAmount, rateNoPoints, rateWithPoints, points, termYears, horizonYears]);

  const worthIt = results.netSavings > 0;

  return (
    <CalcLayout
      eyebrow="Points buydown"
      title="Are discount points worth paying?"
      lede="Points cost money upfront to lower your rate. They pay off only if you keep the loan longer than the breakeven. Refinance early? The sunk cost is gone."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Loan amount" value={loanAmount} onChange={setLoanAmount} />
          <PercentInput
            label="Rate WITHOUT points"
            value={rateNoPoints}
            onChange={setRateNoPoints}
          />
          <PercentInput
            label="Rate WITH points"
            value={rateWithPoints}
            onChange={setRateWithPoints}
          />
          <CalcInput
            label="Points"
            value={points}
            onChange={setPoints}
            suffix="pts"
            step={0.25}
            min={0}
            max={5}
            hint="1 point = 1% of the loan amount."
          />
          <CalcInput label="Term" value={termYears} onChange={setTermYears} suffix="yrs" min={1} max={40} />
          <CalcInput
            label="How long you'll keep the loan"
            value={horizonYears}
            onChange={setHorizonYears}
            suffix="yrs"
            min={1}
            max={30}
            hint="Selling or refinancing? Use that horizon."
          />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Verdict" highlight={worthIt}>
            <ResultRow
              label="Cost of points"
              value={formatDollars(results.cost)}
              emphasis
            />
            <ResultRow
              label="Monthly savings"
              value={formatDollarsCents(results.monthlySavings)}
            />
            <ResultRow
              label="Breakeven"
              value={
                isFinite(results.breakevenMonths)
                  ? formatMonths(results.breakevenMonths)
                  : "Never (no rate reduction)"
              }
            />
          </ResultCard>

          <ResultCard title={`Over ${horizonYears} years`}>
            <ResultRow
              label="Net savings after point cost"
              value={formatDollars(results.netSavings)}
              hint={
                worthIt
                  ? "Points pay off within your horizon."
                  : "Points DON'T pay off within your horizon. Skip them."
              }
            />
          </ResultCard>

          <ResultCard title="Payment side-by-side">
            <ResultRow label="No points" value={formatDollarsCents(results.paymentNoPoints)} />
            <ResultRow label="With points" value={formatDollarsCents(results.paymentWithPoints)} />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
