"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { monthlyPI } from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents } from "@/lib/calc/format";

/**
 * /tools/monthly-payment — full PITI + HOA monthly payment calculator.
 *
 * Purpose: most calculators online show only principal + interest.
 * Borrowers get sticker shock when the LO adds taxes, insurance, HOA.
 * This tool defaults to showing the true total from the first render.
 */
export default function MonthlyPaymentPage() {
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [rate, setRate] = useState(6.375);
  const [termYears, setTermYears] = useState(30);
  const [propertyTaxYr, setPropertyTaxYr] = useState(7000);
  const [insuranceYr, setInsuranceYr] = useState(1800);
  const [hoaMo, setHoaMo] = useState(0);

  const results = useMemo(() => {
    const termMonths = termYears * 12;
    const pi = monthlyPI(loanAmount, rate, termMonths);
    const taxMo = propertyTaxYr / 12;
    const insMo = insuranceYr / 12;
    const total = pi + taxMo + insMo + hoaMo;
    return { pi, taxMo, insMo, hoaMo, total };
  }, [loanAmount, rate, termYears, propertyTaxYr, insuranceYr, hoaMo]);

  return (
    <CalcLayout
      eyebrow="Monthly payment"
      title="What will this mortgage actually cost per month?"
      lede="Principal, interest, taxes, insurance, HOA. All of it — not just the P&I number lenders lead with."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput
            label="Loan amount"
            value={loanAmount}
            onChange={setLoanAmount}
            step={5000}
          />
          <PercentInput
            label="Interest rate"
            value={rate}
            onChange={setRate}
          />
          <CalcInput
            label="Term"
            value={termYears}
            onChange={setTermYears}
            suffix="yrs"
            step={1}
            min={1}
            max={40}
          />
          <DollarInput
            label="Property tax / yr"
            value={propertyTaxYr}
            onChange={setPropertyTaxYr}
            step={100}
            hint="Look up on your county assessor's site — or take last year's tax bill × 1.02."
          />
          <DollarInput
            label="Homeowners insurance / yr"
            value={insuranceYr}
            onChange={setInsuranceYr}
            step={50}
            hint="Typical range: $600–$3,000/yr depending on state and home value."
          />
          <DollarInput
            label="HOA / mo"
            value={hoaMo}
            onChange={setHoaMo}
            step={25}
            hint="Zero if none."
          />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Monthly total (PITI + HOA)" highlight>
            <ResultRow
              label="Total monthly payment"
              value={formatDollarsCents(results.total)}
              emphasis
            />
          </ResultCard>

          <ResultCard title="Breakdown">
            <ResultRow
              label="Principal + interest"
              value={formatDollarsCents(results.pi)}
            />
            <ResultRow
              label="Property tax (÷12)"
              value={formatDollarsCents(results.taxMo)}
            />
            <ResultRow
              label="Homeowners insurance (÷12)"
              value={formatDollarsCents(results.insMo)}
            />
            <ResultRow
              label="HOA"
              value={formatDollarsCents(results.hoaMo)}
            />
          </ResultCard>

          <ResultCard>
            <ResultRow
              label="Over 12 months"
              value={formatDollars(results.total * 12)}
            />
            <ResultRow
              label={`Over ${termYears} years`}
              value={formatDollars(results.total * termYears * 12)}
            />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
