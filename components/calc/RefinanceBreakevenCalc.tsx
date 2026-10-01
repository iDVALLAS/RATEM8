"use client";

import { useMemo, useState } from "react";
import Slider from "@/components/calc/Slider";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { ShowWork, AssumptionsList, CalcDisclaimer } from "@/components/calc/ShowWork";
import { refinanceBreakeven } from "@/lib/calc";
import { formatDollars, formatDollarsCents, formatMonths } from "@/lib/calc/format";
import { CALC_CONTENT } from "@/lib/content/calculators";

const content = CALC_CONTENT["refinance-breakeven"];

export default function RefinanceBreakevenCalc() {
  const [balance, setBalance] = useState(350_000);
  const [currentRate, setCurrentRate] = useState(7.0);
  const [remainingYears, setRemainingYears] = useState(27);
  const [newRate, setNewRate] = useState(6.5);
  const [newTermYears, setNewTermYears] = useState(30);
  const [closingCosts, setClosingCosts] = useState(6_000);

  const r = useMemo(
    () =>
      refinanceBreakeven({
        currentBalance: balance,
        currentRate,
        currentRemainingTermMonths: Math.round(remainingYears * 12),
        newRate,
        newTermMonths: Math.round(newTermYears * 12),
        closingCosts,
      }),
    [balance, currentRate, remainingYears, newRate, newTermYears, closingCosts]
  );

  const hasBreakeven = Number.isFinite(r.breakevenMonth);
  const paymentDown = r.monthlyChange < 0;

  const changeSentence = paymentDown
    ? `The payment drops by ${formatDollarsCents(-r.monthlyChange)} a month.`
    : r.monthlyChange > 0
    ? `The payment goes up by ${formatDollarsCents(r.monthlyChange)} a month, so there is no payment break-even.`
    : "The payment does not change.";

  const breakevenSentence = hasBreakeven
    ? r.breakevenMonth === 0
      ? "With no closing costs, the lower payment is a saving from month one."
      : `At that rate of saving, ${formatDollars(closingCosts)} in closing costs is recovered in month ${r.breakevenMonth} (${formatMonths(r.breakevenMonth)}).`
    : "Closing costs are never recovered from payment savings on these inputs.";

  const deltaAbs = formatDollars(Math.abs(r.totalInterestDelta));
  const deltaSentence = !Number.isFinite(r.totalInterestDelta)
    ? "Total interest could not be computed on these inputs."
    : r.totalInterestDelta < 0
    ? `Over the full life of each loan, the new loan plus closing costs costs ${deltaAbs} less in interest than staying put. Negative is good here.`
    : r.totalInterestDelta > 0
    ? `Over the full life of each loan, the new loan plus closing costs costs ${deltaAbs} more in interest than staying put, because the term restarts. A lower payment and a higher lifetime cost can both be true.`
    : "Over the full life of each loan, total interest plus closing costs is unchanged.";

  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <p className="principle-label">Current loan</p>
        <Slider label="Current balance" value={balance} onChange={setBalance} min={25_000} max={2_000_000} step={5_000} prefix="$" />
        <Slider label="Current rate — yours, from your statement" value={currentRate} onChange={setCurrentRate} min={0} max={15} step={0.125} suffix="%" />
        <Slider label="Remaining term" value={remainingYears} onChange={setRemainingYears} min={1} max={40} step={1} suffix="yrs" hint="Years left on the current loan. Converted to months in the math." />

        <p className="principle-label" style={{ marginTop: 8 }}>
          New loan
        </p>
        <Slider
          label="New rate — enter your own"
          value={newRate}
          onChange={setNewRate}
          min={0}
          max={15}
          step={0.125}
          suffix="%"
          hint="From the quote you are considering. This calculator never supplies a rate."
        />
        <Slider label="New term" value={newTermYears} onChange={setNewTermYears} min={5} max={40} step={1} suffix="yrs" />
        <Slider label="Closing costs" value={closingCosts} onChange={setClosingCosts} min={0} max={30_000} step={250} prefix="$" hint="Total from the Loan Estimate, treated as paid in cash." />
      </div>

      <div className="calc-results calc-grid__results">
        <div className="calc-results" aria-live="polite" aria-atomic="true">
          <ResultCard title="Result" highlight={hasBreakeven && r.breakevenMonth > 0}>
            <ResultRow label="Break-even" value={hasBreakeven ? (r.breakevenMonth === 0 ? "Month 0" : formatMonths(r.breakevenMonth)) : "—"} emphasis />
            <ResultRow label="Monthly change" value={Number.isFinite(r.monthlyChange) ? `${r.monthlyChange > 0 ? "+" : r.monthlyChange < 0 ? "−" : ""}${formatDollarsCents(Math.abs(r.monthlyChange))}` : "—"} />
            <ResultRow label="Total interest delta" value={Number.isFinite(r.totalInterestDelta) ? `${r.totalInterestDelta > 0 ? "+" : r.totalInterestDelta < 0 ? "−" : ""}${deltaAbs}` : "—"} hint="Incl. closing costs, full term of each loan" />
          </ResultCard>
          <p className="calc-note">
            {changeSentence} {breakevenSentence}
          </p>
          <p className="calc-note">{deltaSentence}</p>
          <ResultCard title="Payments and lifetime interest">
            <ResultRow label="Current payment" value={formatDollarsCents(r.currentPayment)} hint={`P&I over ${Math.round(remainingYears * 12)} months`} />
            <ResultRow label="New payment" value={formatDollarsCents(r.newPayment)} hint={`P&I over ${Math.round(newTermYears * 12)} months`} />
            <ResultRow label="Current remaining interest" value={formatDollars(r.currentTotalInterest)} />
            <ResultRow label="New total interest" value={formatDollars(r.newTotalInterest)} />
          </ResultCard>
        </div>

        <CalcDisclaimer />
        <ShowWork formulas={content.formulas} notes={content.formulaNotes} assumptions={r.assumptions} />
        <AssumptionsList assumptions={r.assumptions} />
      </div>
    </div>
  );
}
