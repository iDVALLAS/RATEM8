"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import {
  monthlyPI,
  totalInterest,
  payoffWithExtraPayment,
  payoffWithLumpSum,
  extraNeededForTargetMonths,
} from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents, formatMonths } from "@/lib/calc/format";

/**
 * /tools/payoff-acceleration — three modes for asking the same
 * question in different directions:
 *   - extra: "if I add $X/mo, when do I pay off?"
 *   - lump: "if I throw $X at it today, when do I pay off?"
 *   - target: "if I want to pay off in Y months, how much extra/mo?"
 *
 * All three are pure functions in lib/calc/mortgage.ts. This page
 * is just the input surface for choosing which one to run.
 */

type Mode = "extra" | "lump" | "target";

export default function PayoffAccelerationPage() {
  const [mode, setMode] = useState<Mode>("extra");
  const [balance, setBalance] = useState(400_000);
  const [rate, setRate] = useState(6.375);
  const [remainingYears, setRemainingYears] = useState(28);
  const [extraPerMonth, setExtraPerMonth] = useState(250);
  const [lumpSum, setLumpSum] = useState(20_000);
  const [targetYears, setTargetYears] = useState(20);

  const remainingMonths = remainingYears * 12;

  const results = useMemo(() => {
    const basePI = monthlyPI(balance, rate, remainingMonths);
    const baseInterest = totalInterest(balance, rate, remainingMonths);

    if (mode === "extra") {
      const r = payoffWithExtraPayment(balance, rate, remainingMonths, extraPerMonth);
      return {
        basePI,
        baseInterest,
        newPayment: basePI + extraPerMonth,
        newMonths: r.months,
        newInterest: r.totalInterest,
        monthsShaved: remainingMonths - r.months,
        interestSaved: baseInterest - r.totalInterest,
        extraNeeded: null,
      };
    }
    if (mode === "lump") {
      const r = payoffWithLumpSum(balance, rate, remainingMonths, lumpSum);
      return {
        basePI,
        baseInterest,
        newPayment: basePI,
        newMonths: r.months,
        newInterest: r.totalInterest,
        monthsShaved: remainingMonths - r.months,
        interestSaved: baseInterest - r.totalInterest,
        extraNeeded: null,
      };
    }
    // mode === "target"
    const targetMonths = targetYears * 12;
    const extra = extraNeededForTargetMonths(balance, rate, remainingMonths, targetMonths);
    const r = payoffWithExtraPayment(balance, rate, remainingMonths, extra);
    return {
      basePI,
      baseInterest,
      newPayment: basePI + extra,
      newMonths: r.months,
      newInterest: r.totalInterest,
      monthsShaved: remainingMonths - r.months,
      interestSaved: baseInterest - r.totalInterest,
      extraNeeded: extra,
    };
  }, [mode, balance, rate, remainingMonths, extraPerMonth, lumpSum, targetYears]);

  return (
    <CalcLayout
      eyebrow="Payoff acceleration"
      title="How much faster could you kill this loan?"
      lede="Three ways to ask the same question. Add extra to every payment, throw a lump sum at it today, or work backward from a target date. Pick your angle."
    >
      <div className="mb-8 flex flex-wrap gap-2">
        {(["extra", "lump", "target"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: mode === m ? "var(--accent-soft)" : "transparent",
              color: mode === m ? "var(--accent)" : "var(--muted)",
              border: `1px solid ${mode === m ? "var(--accent)" : "var(--rule)"}`,
            }}
          >
            {m === "extra"
              ? "Extra $/mo"
              : m === "lump"
              ? "One lump sum"
              : "Target payoff date"}
          </button>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Loan basics</p>
          <DollarInput label="Current balance" value={balance} onChange={setBalance} />
          <PercentInput label="Rate" value={rate} onChange={setRate} />
          <CalcInput
            label="Remaining term"
            value={remainingYears}
            onChange={setRemainingYears}
            suffix="yrs"
            min={1}
            max={40}
          />

          {mode === "extra" ? (
            <>
              <p className="principle-label mt-4">Acceleration</p>
              <DollarInput
                label="Extra to principal / mo"
                value={extraPerMonth}
                onChange={setExtraPerMonth}
                step={25}
                hint="Added to every monthly payment. Applied straight to principal."
              />
            </>
          ) : null}

          {mode === "lump" ? (
            <>
              <p className="principle-label mt-4">Acceleration</p>
              <DollarInput
                label="Lump sum today"
                value={lumpSum}
                onChange={setLumpSum}
                step={1000}
                hint="Applied to principal today. Same monthly payment continues."
              />
            </>
          ) : null}

          {mode === "target" ? (
            <>
              <p className="principle-label mt-4">Target</p>
              <CalcInput
                label="Target payoff time"
                value={targetYears}
                onChange={setTargetYears}
                suffix="yrs"
                min={1}
                max={remainingYears}
                hint="We back-solve the extra you'd need per month."
              />
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="What you save" highlight>
            <ResultRow
              label="Months shaved"
              value={formatMonths(results.monthsShaved)}
              emphasis
            />
            <ResultRow
              label="Total interest saved"
              value={formatDollars(results.interestSaved)}
            />
          </ResultCard>

          {mode === "target" && results.extraNeeded !== null ? (
            <ResultCard title="What it takes">
              <ResultRow
                label="Extra needed per month"
                value={formatDollarsCents(results.extraNeeded)}
                hint={`On top of your base P&I of ${formatDollarsCents(results.basePI)}.`}
              />
            </ResultCard>
          ) : null}

          <ResultCard title="Side-by-side">
            <ResultRow
              label="Base monthly P&I"
              value={formatDollarsCents(results.basePI)}
            />
            <ResultRow
              label="Accelerated payment"
              value={formatDollarsCents(results.newPayment)}
            />
            <ResultRow
              label="Original payoff"
              value={formatMonths(remainingMonths)}
            />
            <ResultRow
              label="Accelerated payoff"
              value={formatMonths(results.newMonths)}
            />
            <ResultRow
              label="Base total interest"
              value={formatDollars(results.baseInterest)}
            />
            <ResultRow
              label="Accelerated total interest"
              value={formatDollars(results.newInterest)}
            />
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
