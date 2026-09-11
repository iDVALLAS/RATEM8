"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { formatDollars, formatPercent1 } from "@/lib/calc/format";

/**
 * /tools/dti — debt-to-income ratio + affordability guardrail.
 *
 * Two questions borrowers actually ask:
 *   1. What's my DTI right now?
 *   2. How big of a mortgage payment can I fit under the standard
 *      lender guideline (43% back-end DTI is the QM/conforming line)
 *      without stretching myself?
 */
export default function DTIPage() {
  const [monthlyIncome, setMonthlyIncome] = useState(12_000);
  const [existingDebt, setExistingDebt] = useState(600);
  const [propTaxMo, setPropTaxMo] = useState(700);
  const [insMo, setInsMo] = useState(150);
  const [hoaMo, setHoaMo] = useState(0);
  const [proposedPI, setProposedPI] = useState(3300);

  const results = useMemo(() => {
    const proposedHousingMo = proposedPI + propTaxMo + insMo + hoaMo;
    const frontEndDTI = monthlyIncome > 0 ? (proposedHousingMo / monthlyIncome) * 100 : 0;
    const backEndDTI = monthlyIncome > 0 ? ((proposedHousingMo + existingDebt) / monthlyIncome) * 100 : 0;
    // Max housing under 43% back-end DTI:
    const maxBackEnd = monthlyIncome * 0.43;
    const maxHousingAt43 = Math.max(0, maxBackEnd - existingDebt);
    // Same at a more conservative 36%:
    const maxHousingAt36 = Math.max(0, monthlyIncome * 0.36 - existingDebt);
    return {
      proposedHousingMo,
      frontEndDTI,
      backEndDTI,
      maxHousingAt43,
      maxHousingAt36,
    };
  }, [monthlyIncome, existingDebt, propTaxMo, insMo, hoaMo, proposedPI]);

  const flag =
    results.backEndDTI > 43
      ? { color: "red", text: "Exceeds 43% QM guideline. Most lenders will decline." }
      : results.backEndDTI > 36
      ? { color: "amber", text: "Above the comfortable 36% zone but under 43% QM limit." }
      : { color: "green", text: "Under the comfortable 36% zone." };

  return (
    <CalcLayout
      eyebrow="DTI / Affordability"
      title="What can you actually afford — comfortably?"
      lede="Not the maximum a lender will approve. The number that leaves you money for a life. 43% back-end DTI is the QM guideline; 36% is where mortgage stops running your budget."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Your numbers</p>
          <DollarInput
            label="Gross monthly income (household)"
            value={monthlyIncome}
            onChange={setMonthlyIncome}
            step={500}
            hint="Before tax. Add both spouses if joint borrower."
          />
          <DollarInput
            label="Existing monthly debts"
            value={existingDebt}
            onChange={setExistingDebt}
            step={50}
            hint="Car loans, student loans, min credit card payments, child support. Not utilities/groceries."
          />

          <p className="principle-label mt-4">Proposed housing</p>
          <DollarInput label="Proposed P&I / mo" value={proposedPI} onChange={setProposedPI} step={50} />
          <DollarInput label="Property tax / mo" value={propTaxMo} onChange={setPropTaxMo} step={25} />
          <DollarInput label="Insurance / mo" value={insMo} onChange={setInsMo} step={10} />
          <DollarInput label="HOA / mo" value={hoaMo} onChange={setHoaMo} step={25} />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard
            title="Your back-end DTI"
            highlight={flag.color === "green"}
          >
            <ResultRow
              label="Back-end DTI (all debts)"
              value={formatPercent1(results.backEndDTI)}
              emphasis
              hint={flag.text}
            />
            <ResultRow
              label="Front-end DTI (housing only)"
              value={formatPercent1(results.frontEndDTI)}
            />
            <ResultRow
              label="Total housing payment"
              value={formatDollars(results.proposedHousingMo)}
            />
          </ResultCard>

          <ResultCard title="How much housing can you fit?">
            <ResultRow
              label="Max at 43% (QM guideline)"
              value={formatDollars(results.maxHousingAt43)}
              hint="Total monthly housing (P&I + tax + ins + HOA) the QM rule allows."
            />
            <ResultRow
              label="Max at 36% (comfortable)"
              value={formatDollars(results.maxHousingAt36)}
              hint="What most financial planners recommend as a healthy ceiling."
            />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
