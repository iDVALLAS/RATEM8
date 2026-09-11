"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { monthlyPI, amortizationSchedule } from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents } from "@/lib/calc/format";

/**
 * /tools/rent-vs-buy — 7-year total-cost comparison.
 *
 * Simplification (documented on the page): assumes rent + home value
 * appreciate at the same annual rate. Ignores maintenance, opportunity
 * cost of down payment, and tax deductions — for a rough sanity check,
 * not a life-decision spreadsheet.
 */
export default function RentVsBuyPage() {
  const [homePrice, setHomePrice] = useState(700_000);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(6.375);
  const [rentMo, setRentMo] = useState(3200);
  const [appreciationPct, setAppreciationPct] = useState(4);
  const [horizonYears, setHorizonYears] = useState(7);
  const [propTaxPct, setPropTaxPct] = useState(1.1);
  const [insuranceYr, setInsuranceYr] = useState(1800);

  const results = useMemo(() => {
    const downPayment = homePrice * (downPct / 100);
    const loanAmount = homePrice - downPayment;
    const termMonths = 30 * 12;
    const pi = monthlyPI(loanAmount, rate, termMonths);
    const taxMo = (homePrice * propTaxPct) / 100 / 12;
    const insMo = insuranceYr / 12;
    const monthlyOwning = pi + taxMo + insMo;

    // Buying total cost over horizon
    const horizonMonths = horizonYears * 12;
    const totalOwnPayments = monthlyOwning * horizonMonths;

    // Home value at horizon
    const futureValue = homePrice * Math.pow(1 + appreciationPct / 100, horizonYears);

    // Loan balance at horizon (from amortization schedule)
    const schedule = amortizationSchedule(loanAmount, rate, termMonths);
    const balanceAtHorizon = schedule[horizonMonths - 1]?.balance ?? loanAmount;
    const equity = futureValue - balanceAtHorizon;

    // Owning net cost = payments - equity gain
    const owningNet = downPayment + totalOwnPayments - equity;

    // Renting cost — assume rent grows at appreciation rate
    let totalRent = 0;
    let currentRent = rentMo;
    for (let y = 0; y < horizonYears; y++) {
      totalRent += currentRent * 12;
      currentRent *= 1 + appreciationPct / 100;
    }
    const rentingNet = totalRent;

    return {
      monthlyOwning,
      totalOwnPayments,
      futureValue,
      balanceAtHorizon,
      equity,
      owningNet,
      totalRent,
      rentingNet,
      difference: rentingNet - owningNet,
    };
  }, [homePrice, downPct, rate, rentMo, appreciationPct, horizonYears, propTaxPct, insuranceYr]);

  const buyingCheaper = results.difference > 0;

  return (
    <CalcLayout
      eyebrow="Rent vs. buy"
      title="Which one costs less over the next few years?"
      lede="Rough sanity check — not a life-decision spreadsheet. Assumes rent grows at the same rate homes appreciate, ignores maintenance and tax deductions. Use it to see which direction the math points, then talk to M8 about the nuances."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Home price" value={homePrice} onChange={setHomePrice} />
          <PercentInput label="Down payment" value={downPct} onChange={setDownPct} step={1} />
          <PercentInput label="Interest rate" value={rate} onChange={setRate} />
          <PercentInput
            label="Property tax rate"
            value={propTaxPct}
            onChange={setPropTaxPct}
            step={0.05}
            hint="1.0–1.3% typical, varies by state and county."
          />
          <DollarInput label="Insurance / yr" value={insuranceYr} onChange={setInsuranceYr} step={50} />
          <DollarInput label="Comparable rent / mo" value={rentMo} onChange={setRentMo} step={50} />
          <PercentInput
            label="Annual appreciation / rent growth"
            value={appreciationPct}
            onChange={setAppreciationPct}
            step={0.5}
          />
          <CalcInput
            label="Time horizon"
            value={horizonYears}
            onChange={setHorizonYears}
            suffix="yrs"
            min={1}
            max={30}
          />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Verdict" highlight>
            <ResultRow
              label={
                buyingCheaper
                  ? `Buying wins by`
                  : `Renting wins by`
              }
              value={formatDollars(Math.abs(results.difference))}
              emphasis
              hint={
                buyingCheaper
                  ? "Rough math — talk to M8 about maintenance, opportunity cost, and taxes before deciding."
                  : "Rough math — you might value ownership, stability, or forced saving beyond pure dollars."
              }
            />
          </ResultCard>

          <ResultCard title="Owning">
            <ResultRow label="Monthly (PITI, no HOA)" value={formatDollarsCents(results.monthlyOwning)} />
            <ResultRow label={`Total ${horizonYears}yr payments`} value={formatDollars(results.totalOwnPayments)} />
            <ResultRow label="Home value at horizon" value={formatDollars(results.futureValue)} />
            <ResultRow label="Equity gained" value={formatDollars(results.equity)} />
            <ResultRow
              label="Net cost after equity"
              value={formatDollars(results.owningNet)}
              hint="Down payment + payments − equity gain"
            />
          </ResultCard>

          <ResultCard title="Renting">
            <ResultRow
              label={`Total ${horizonYears}yr rent`}
              value={formatDollars(results.rentingNet)}
              hint="Assumes rent grows at the appreciation rate."
            />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
