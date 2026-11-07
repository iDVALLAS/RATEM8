"use client";

import { useMemo, useState } from "react";
import Slider from "@/components/calc/Slider";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { ShowWork, AssumptionsList, CalcDisclaimer } from "@/components/calc/ShowWork";
import { BUYDOWN_STRUCTURES, temporaryBuydown, type BuydownStructure } from "@/lib/calc";
import { formatDollars, formatDollarsCents } from "@/lib/calc/format";
import { CALC_CONTENT } from "@/lib/content/calculators";

const content = CALC_CONTENT["temporary-buydown"];
const STRUCTURES = Object.keys(BUYDOWN_STRUCTURES) as BuydownStructure[];
const pct = (n: number) => `${n.toFixed(3)}%`;

/** Temporary buydown (owner request, 2026-11-07): each year's payment and the buydown cost. */
export default function TemporaryBuydownCalc() {
  const [loanAmount, setLoanAmount] = useState(400_000);
  const [noteRate, setNoteRate] = useState(7);
  const [structure, setStructure] = useState<BuydownStructure>("2-1");

  const r = useMemo(() => temporaryBuydown({ loanAmount, noteRate, structure }), [loanAmount, noteRate, structure]);
  const first = r.years[0];

  const sentence =
    first && first.monthlySavings > 0
      ? `Year 1 payment is ${formatDollarsCents(first.payment)}, ${formatDollarsCents(first.monthlySavings)} less than the full ${formatDollarsCents(r.notePayment)}. From year ${r.fullRateFromYear} you pay the full amount. The buydown costs ${formatDollars(r.cost)} (${r.costPct.toFixed(2)}% of the loan), usually paid by the seller, builder or lender at closing.`
      : "At a 0% note rate there is nothing to buy down.";

  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <p className="principle-label">Inputs</p>
        <Slider label="Loan amount" value={loanAmount} onChange={setLoanAmount} min={50_000} max={2_000_000} step={5_000} prefix="$" />
        <Slider
          label="Note rate — enter your own"
          value={noteRate}
          onChange={setNoteRate}
          min={0}
          max={15}
          step={0.125}
          suffix="%"
          hint="The full rate on your loan, from your quote or Loan Estimate. This calculator never supplies a rate."
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="principle-label mb-2">Buydown</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Buydown structure">
            {STRUCTURES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={structure === s}
                onClick={() => setStructure(s)}
                className="rounded-lg px-4 py-2 font-mono text-sm"
                style={{
                  border: `1px solid ${structure === s ? "var(--accent)" : "var(--rule)"}`,
                  color: structure === s ? "var(--accent)" : "var(--fg)",
                  background: "transparent",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Points below the note rate in each year: {BUYDOWN_STRUCTURES[structure].join(", ")}.
          </span>
        </fieldset>
      </div>

      <div className="calc-results calc-grid__results">
        <div className="calc-results" aria-live="polite" aria-atomic="true">
          <ResultCard title="Buydown cost" highlight={r.cost > 0}>
            <ResultRow label="Total" value={formatDollars(r.cost)} emphasis />
            <ResultRow label="Percent of loan" value={`${r.costPct.toFixed(2)}%`} />
          </ResultCard>
          <p className="calc-note">{sentence}</p>
          <ResultCard title="Payment by year">
            {r.years.map((y) => (
              <ResultRow
                key={y.year}
                label={`Year ${y.year} · ${pct(y.rate)}`}
                value={formatDollarsCents(y.payment)}
                hint={`${formatDollarsCents(y.monthlySavings)} less a month · ${formatDollars(y.yearSavings)} for the year`}
              />
            ))}
            <ResultRow label={`Year ${r.fullRateFromYear} on · ${pct(noteRate)}`} value={formatDollarsCents(r.notePayment)} hint="Full note-rate payment, principal & interest" />
          </ResultCard>
        </div>

        <CalcDisclaimer />
        <ShowWork formulas={content.formulas} notes={content.formulaNotes} assumptions={r.assumptions} />
        <AssumptionsList assumptions={r.assumptions} />
      </div>
    </div>
  );
}
