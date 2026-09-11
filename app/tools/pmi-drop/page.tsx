"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { amortizationSchedule } from "@/lib/calc/mortgage";
import { formatDollars, formatMonths } from "@/lib/calc/format";

/**
 * /tools/pmi-drop — when does PMI fall off, and when can I request
 * removal early?
 *
 * Per the Homeowners Protection Act (HPA):
 *   - AUTO drop at 78% LTV based on the ORIGINAL amortization schedule
 *     (servicer must remove it without you asking)
 *   - You can REQUEST removal at 80% LTV based on either the original
 *     schedule OR the current appraised value (if you got an appraisal)
 *
 * This calculator projects both dates from the amortization schedule.
 * Does NOT factor in extra principal payments or appraisal-based
 * revaluation — those are covered by the payoff-acceleration tool.
 */
export default function PMIDropPage() {
  const [homePrice, setHomePrice] = useState(500_000);
  const [downPct, setDownPct] = useState(10);
  const [rate, setRate] = useState(6.375);
  const [termYears, setTermYears] = useState(30);
  const [monthlyPMI, setMonthlyPMI] = useState(160);

  const results = useMemo(() => {
    const downPayment = homePrice * (downPct / 100);
    const loanAmount = homePrice - downPayment;
    const startingLTV = (loanAmount / homePrice) * 100;

    // If already at or below 80%, no PMI in the first place (typical).
    if (startingLTV <= 80) {
      return {
        loanAmount,
        startingLTV,
        request80Month: null,
        auto78Month: null,
        totalPMIThrough78: 0,
        alreadyBelowThreshold: true,
      };
    }

    const schedule = amortizationSchedule(loanAmount, rate, termYears * 12);
    let request80Month: number | null = null;
    let auto78Month: number | null = null;
    for (const row of schedule) {
      const ltv = (row.balance / homePrice) * 100;
      if (ltv <= 80 && request80Month === null) request80Month = row.month;
      if (ltv <= 78 && auto78Month === null) {
        auto78Month = row.month;
        break;
      }
    }

    const totalPMIThrough78 = auto78Month ? monthlyPMI * auto78Month : 0;

    return {
      loanAmount,
      startingLTV,
      request80Month,
      auto78Month,
      totalPMIThrough78,
      alreadyBelowThreshold: false,
    };
  }, [homePrice, downPct, rate, termYears, monthlyPMI]);

  return (
    <CalcLayout
      eyebrow="PMI drop-off"
      title="When does your PMI actually go away?"
      lede="Two dates matter. At 80% LTV you can request removal. At 78% LTV the servicer must drop it automatically. Both are calculated off the original amortization schedule — extra principal payments can accelerate both."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Loan basics</p>
          <DollarInput label="Home price at purchase" value={homePrice} onChange={setHomePrice} />
          <PercentInput label="Down payment %" value={downPct} onChange={setDownPct} step={1} />
          <PercentInput label="Interest rate" value={rate} onChange={setRate} />
          <CalcInput label="Term" value={termYears} onChange={setTermYears} suffix="yrs" min={1} max={40} />
          <DollarInput
            label="Monthly PMI"
            value={monthlyPMI}
            onChange={setMonthlyPMI}
            step={10}
            hint="Check your Loan Estimate — usually 0.3%–1.5% of the loan / 12."
          />
        </div>

        <div className="flex flex-col gap-6">
          {results.alreadyBelowThreshold ? (
            <ResultCard title="No PMI required" highlight>
              <ResultRow
                label="Starting LTV"
                value={`${results.startingLTV.toFixed(1)}%`}
                emphasis
                hint="20%+ down means no PMI on conventional loans. You're done."
              />
            </ResultCard>
          ) : (
            <>
              <ResultCard title="Auto drop-off (78% LTV)" highlight>
                <ResultRow
                  label="Month PMI falls off automatically"
                  value={results.auto78Month ? formatMonths(results.auto78Month) : "Not before loan matures"}
                  emphasis
                  hint="Servicer must remove without you asking, per Homeowners Protection Act."
                />
              </ResultCard>

              <ResultCard title="Request removal (80% LTV)">
                <ResultRow
                  label="Month you can request removal"
                  value={results.request80Month ? formatMonths(results.request80Month) : "Not before maturity"}
                  hint="Write your servicer at this point. You may need a $500–$700 appraisal to prove value."
                />
              </ResultCard>

              <ResultCard title="Total PMI you'll pay before auto-drop">
                <ResultRow
                  label="Cumulative PMI"
                  value={formatDollars(results.totalPMIThrough78)}
                  hint="Monthly PMI × months until 78% LTV. Requesting removal early saves the difference."
                />
              </ResultCard>
            </>
          )}

          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Timeline is based on your original amortization schedule. Extra
            principal payments accelerate both dates — see the payoff
            acceleration calculator. FHA MIP has different rules (typically
            stays for the life of the loan under most 2013+ FHA loans).
          </p>
        </div>
      </div>
    </CalcLayout>
  );
}
