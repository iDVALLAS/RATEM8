"use client";

import { useMemo, useState } from "react";
import Slider from "@/components/calc/Slider";
import MiniChart from "@/components/calc/MiniChart";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { ShowWork, AssumptionsList, CalcDisclaimer } from "@/components/calc/ShowWork";
import { pointsBreakeven } from "@/lib/calc";
import { formatDollars, formatDollarsCents, formatMonths } from "@/lib/calc/format";
import { CALC_CONTENT } from "@/lib/content/calculators";

const content = CALC_CONTENT["points-breakeven"];

const fmtMoneyShort = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);

export default function PointsBreakevenCalc() {
  const [loanAmount, setLoanAmount] = useState(400_000);
  const [rateWithout, setRateWithout] = useState(6.5);
  const [rateWith, setRateWith] = useState(6.25);
  const [pointsCost, setPointsCost] = useState(4_000);

  const r = useMemo(
    () => pointsBreakeven({ loanAmount, rateWithoutPoints: rateWithout, rateWithPoints: rateWith, pointsCost, chartMonths: 360 }),
    [loanAmount, rateWithout, rateWith, pointsCost]
  );

  const hasBreakeven = Number.isFinite(r.breakevenMonth);
  const chartMonths = hasBreakeven ? Math.min(360, Math.max(60, Math.ceil(r.breakevenMonth * 1.5))) : 120;
  const chartRows = r.chart.slice(0, chartMonths);

  const sentence = !hasBreakeven
    ? r.monthlySavings <= 0
      ? "The rate with points is not lower than the rate without, so there is no monthly saving and no break-even."
      : "No break-even within the chart."
    : r.breakevenMonth === 0
    ? "The points cost is zero, so the lower rate is pure saving from month one."
    : `You pay ${formatDollars(pointsCost)} now and save ${formatDollarsCents(r.monthlySavings)} a month. The savings cover the cost in month ${r.breakevenMonth} (${formatMonths(r.breakevenMonth)}). Keep the loan longer than that and the points helped.`;

  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <p className="principle-label">Inputs</p>
        <Slider label="Loan amount" value={loanAmount} onChange={setLoanAmount} min={50_000} max={2_000_000} step={5_000} prefix="$" />
        <Slider
          label="Rate without points — enter your own"
          value={rateWithout}
          onChange={setRateWithout}
          min={0}
          max={15}
          step={0.125}
          suffix="%"
          hint="From your quote or Loan Estimate. LoanM8 does not display rates."
        />
        <Slider label="Rate with points — enter your own" value={rateWith} onChange={setRateWith} min={0} max={15} step={0.125} suffix="%" />
        <Slider
          label="Points cost"
          value={pointsCost}
          onChange={setPointsCost}
          min={0}
          max={50_000}
          step={250}
          prefix="$"
          hint="The dollar amount for the points, from the Loan Estimate. One point is 1% of the loan amount."
        />
      </div>

      <div className="calc-results calc-grid__results">
        <div className="calc-results" aria-live="polite" aria-atomic="true">
          <ResultCard title="Result" highlight={hasBreakeven && r.breakevenMonth > 0}>
            <ResultRow label="Break-even" value={hasBreakeven ? (r.breakevenMonth === 0 ? "Month 0" : formatMonths(r.breakevenMonth)) : "—"} emphasis />
            <ResultRow label="Monthly savings" value={r.monthlySavings > 0 ? formatDollarsCents(r.monthlySavings) : "—"} />
            <ResultRow label="Points cost" value={formatDollars(pointsCost)} />
          </ResultCard>
          <p className="calc-note">{sentence}</p>
          <ResultCard title="Payment side by side">
            <ResultRow label="Without points" value={formatDollarsCents(r.paymentWithoutPoints)} hint="Principal & interest" />
            <ResultRow label="With points" value={formatDollarsCents(r.paymentWithPoints)} hint="Principal & interest" />
          </ResultCard>
        </div>

        <ResultCard title="Cumulative savings vs. points cost">
          <MiniChart
            series={[
              { name: "Cumulative savings", points: chartRows.map((p) => ({ x: p.month, y: p.cumulativeSavings })) },
              { name: "Points cost", points: chartRows.map((p) => ({ x: p.month, y: p.pointsCost })) },
            ]}
            formatX={(m) => `${Math.round(m)}`}
            formatY={fmtMoneyShort}
            xLabel="Month"
            yLabel="Dollars"
            marker={hasBreakeven && r.breakevenMonth > 0 ? { x: r.breakevenMonth, y: pointsCost, label: `Break-even, month ${r.breakevenMonth}` } : null}
            ariaLabel="Cumulative payment savings by month against the flat points cost, with the break-even month marked"
            caption={hasBreakeven ? "Where the rising line crosses the dashed line, the points have paid for themselves." : "The savings line never reaches the points cost on these inputs."}
          />
        </ResultCard>

        <CalcDisclaimer />
        <ShowWork formulas={content.formulas} notes={content.formulaNotes} assumptions={r.assumptions} />
        <AssumptionsList assumptions={r.assumptions} />
      </div>
    </div>
  );
}
