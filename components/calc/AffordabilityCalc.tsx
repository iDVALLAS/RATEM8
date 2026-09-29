"use client";

import { useMemo, useState } from "react";
import Slider from "@/components/calc/Slider";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { ShowWork, AssumptionsList, CalcDisclaimer } from "@/components/calc/ShowWork";
import { affordability } from "@/lib/calc";
import { formatDollars } from "@/lib/calc/format";
import { CALC_CONTENT } from "@/lib/content/calculators";

const content = CALC_CONTENT["affordability"];

export default function AffordabilityCalc() {
  const [annualIncome, setAnnualIncome] = useState(95_000);
  const [monthlyDebts, setMonthlyDebts] = useState(500);
  const [downPayment, setDownPayment] = useState(40_000);
  const [rate, setRate] = useState(6.5);
  const [propertyTaxPct, setPropertyTaxPct] = useState(1.0);
  const [insuranceAnnual, setInsuranceAnnual] = useState(1_500);
  const [hoaMonthly, setHoaMonthly] = useState(0);

  const r = useMemo(
    () => affordability({ annualIncome, monthlyDebts, downPayment, rate, propertyTaxPct, insuranceAnnual, hoaMonthly }),
    [annualIncome, monthlyDebts, downPayment, rate, propertyTaxPct, insuranceAnnual, hoaMonthly]
  );

  const ok = Number.isFinite(r.conservativePayment) && Number.isFinite(r.upperPayment) && annualIncome > 0;
  const noRoom = ok && r.upperPayment <= 0;
  const noPrice = ok && r.upperPrice <= 0;

  const range = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) ? formatDollars(lo) : `${formatDollars(lo)} – ${formatDollars(hi)}`);

  const sentence = !ok
    ? "Enter an annual income above zero to see a range."
    : noRoom
    ? "On these numbers the monthly debts use up the whole debt-to-income allowance, so the indicative housing budget is zero. Lowering the debts changes that."
    : noPrice
    ? "The monthly budget is smaller than the fixed costs you entered for insurance and HOA, so no price is supported. Adjust those or the budget."
    : `On ${formatDollars(r.monthlyIncome)} a month gross, the conservative test (28% housing, 36% total debt) allows about ${formatDollars(r.conservativePayment)} for the all-in housing payment; the upper guideline (31% / 43%) allows about ${formatDollars(r.upperPayment)}. At the rate you entered and ${formatDollars(downPayment)} down, that supports a price of roughly ${range(r.conservativePrice, r.upperPrice)}.`;

  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <p className="principle-label">Inputs</p>
        <Slider label="Annual gross income" value={annualIncome} onChange={setAnnualIncome} min={10_000} max={600_000} step={1_000} prefix="$" hint="Before taxes. All borrowers combined." />
        <Slider label="Monthly debt payments" value={monthlyDebts} onChange={setMonthlyDebts} min={0} max={10_000} step={25} prefix="$" hint="Minimum payments on cards, auto, student loans, support orders." />
        <Slider label="Down payment" value={downPayment} onChange={setDownPayment} min={0} max={500_000} step={1_000} prefix="$" />
        <Slider label="Your rate — enter your own" value={rate} onChange={setRate} min={0} max={15} step={0.125} suffix="%" hint="From a quote. LoanM8 does not display rates." />

        <p className="principle-label" style={{ marginTop: 8 }}>
          Optional
        </p>
        <Slider label="Property tax" value={propertyTaxPct} onChange={setPropertyTaxPct} min={0} max={4} step={0.05} suffix="% / yr" hint="Of the price, per year. Varies by county." />
        <Slider label="Homeowners insurance" value={insuranceAnnual} onChange={setInsuranceAnnual} min={0} max={10_000} step={100} prefix="$" suffix="/ yr" />
        <Slider label="HOA" value={hoaMonthly} onChange={setHoaMonthly} min={0} max={1_500} step={25} prefix="$" suffix="/ mo" />
      </div>

      <div className="calc-results calc-grid__results">
        <div className="calc-results" aria-live="polite" aria-atomic="true">
          <ResultCard title="Indicative all-in payment" highlight={ok && !noRoom}>
            <ResultRow label="Conservative → upper" value={ok && !noRoom ? range(r.conservativePayment, r.upperPayment) : "—"} hint="P&I + tax + insurance + HOA, per month" emphasis />
            <ResultRow label="Ratios used" value="28/36 → 31/43" hint="Housing ÷ income / all debts ÷ income" />
          </ResultCard>
          <ResultCard title="Indicative price range">
            <ResultRow label="Conservative → upper" value={ok && !noPrice ? range(r.conservativePrice, r.upperPrice) : "—"} hint={`At your entered rate, ${formatDollars(downPayment)} down, 30-year term`} />
            <ResultRow label="Gross monthly income" value={ok ? formatDollars(r.monthlyIncome) : "—"} />
          </ResultCard>
          <p className="calc-note">{sentence}</p>
          <p className="calc-note">
            <strong style={{ color: "var(--fg)", fontWeight: 500 }}>This is not a pre-approval.</strong> It is ratio math on numbers you typed. Mortgage insurance, credit history, reserves, and program limits are not modeled and can lower the real figure. Nothing entered here is stored.
          </p>
        </div>

        <CalcDisclaimer />
        <ShowWork formulas={content.formulas} notes={content.formulaNotes} assumptions={r.assumptions} />
        <AssumptionsList assumptions={r.assumptions} />
      </div>
    </div>
  );
}
