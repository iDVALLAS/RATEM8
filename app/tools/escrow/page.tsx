"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { formatDollars, formatDollarsCents } from "@/lib/calc/format";

/**
 * /tools/escrow — how much will monthly escrow / impound collect,
 * and what's the upfront cushion at close?
 *
 * The escrow account holds property tax + homeowners insurance so the
 * servicer can pay both when due. Two costs borrowers underestimate:
 *   1. Monthly escrow = (tax + ins) / 12 — no surprise there
 *   2. Upfront reserve at close = ~2 months of escrow, sometimes
 *      more depending on when your first tax bill hits after closing
 *
 * States (WA/CA/TX/AZ) vary but the 2-month cushion is the RESPA
 * federal cap. This calculator shows the "reasonable middle" of that
 * cushion — actual varies by servicer.
 */
export default function EscrowPage() {
  const [homePrice, setHomePrice] = useState(600_000);
  const [propTaxPct, setPropTaxPct] = useState(1.1);
  const [insuranceYr, setInsuranceYr] = useState(1800);
  const [floodInsuranceYr, setFloodInsuranceYr] = useState(0);
  const [monthsToFirstTax, setMonthsToFirstTax] = useState(3);

  const results = useMemo(() => {
    const propTaxYr = (homePrice * propTaxPct) / 100;
    const totalYr = propTaxYr + insuranceYr + floodInsuranceYr;
    const monthlyEscrow = totalYr / 12;
    // RESPA allows up to 2-month cushion. Servicers often collect
    // enough at close to cover both the cushion + the months of tax
    // that will hit before the borrower has paid enough in escrow.
    const cushionMonths = 2;
    const cushionAmount = monthlyEscrow * cushionMonths;
    // Prepaid taxes: fraction of the annual tax that's already accrued
    // between the last tax bill and closing (proration handled at close).
    const prepaidTax = (propTaxYr * monthsToFirstTax) / 12;
    const upfrontReserve = cushionAmount + prepaidTax;
    return {
      propTaxYr,
      monthlyEscrow,
      cushionAmount,
      prepaidTax,
      upfrontReserve,
    };
  }, [homePrice, propTaxPct, insuranceYr, floodInsuranceYr, monthsToFirstTax]);

  return (
    <CalcLayout
      eyebrow="Escrow / impound"
      title="What will the escrow account collect — every month, and upfront?"
      lede="Your monthly mortgage payment includes 1/12 of your annual property tax and homeowners insurance. The servicer holds it and pays both bills when due. At closing, they'll ask for a cushion so the account never runs dry."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Home price / value" value={homePrice} onChange={setHomePrice} />
          <PercentInput
            label="Property tax rate"
            value={propTaxPct}
            onChange={setPropTaxPct}
            step={0.05}
            hint="Typical: 0.6% (HI/AL) to 2.4% (NJ). WA ~1.0%, AZ ~0.7%, CA ~1.1%, TX ~1.7%."
          />
          <DollarInput
            label="Homeowners insurance / yr"
            value={insuranceYr}
            onChange={setInsuranceYr}
            step={50}
          />
          <DollarInput
            label="Flood insurance / yr"
            value={floodInsuranceYr}
            onChange={setFloodInsuranceYr}
            step={50}
            hint="Zero unless the property is in a FEMA flood zone."
          />
          <CalcInput
            label="Months to first tax bill"
            value={monthsToFirstTax}
            onChange={setMonthsToFirstTax}
            suffix="mo"
            min={0}
            max={12}
            step={1}
            hint="Depends on when you close relative to your county's tax bill cycle."
          />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Monthly escrow (added to P&I)" highlight>
            <ResultRow
              label="Monthly escrow"
              value={formatDollarsCents(results.monthlyEscrow)}
              emphasis
              hint="Added to your P&I every month."
            />
          </ResultCard>

          <ResultCard title="Upfront at closing">
            <ResultRow
              label="RESPA cushion (~2 months)"
              value={formatDollars(results.cushionAmount)}
              hint="Federal RESPA maximum. Prevents the account from running short."
            />
            <ResultRow
              label="Prepaid property tax"
              value={formatDollars(results.prepaidTax)}
              hint={`Fraction of annual tax accrued before your first tax bill (${monthsToFirstTax} mo).`}
            />
            <ResultRow
              label="Total escrow deposit at close"
              value={formatDollars(results.upfrontReserve)}
              hint="Part of closing costs. Add this to the closing cost calculator's total."
            />
          </ResultCard>

          <ResultCard title="Annual context">
            <ResultRow label="Annual property tax" value={formatDollars(results.propTaxYr)} />
            <ResultRow label="Annual insurance" value={formatDollars(insuranceYr + floodInsuranceYr)} />
          </ResultCard>

          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Escrow is required for most FHA, VA, and low-down conventional
            loans. Conventional loans with 20%+ down can typically waive
            escrow (you pay tax + insurance yourself). Estimate only — actual
            upfront amount is on your Loan Estimate.
          </p>
        </div>
      </div>
    </CalcLayout>
  );
}
