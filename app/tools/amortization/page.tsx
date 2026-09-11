"use client";

import { useMemo, useState } from "react";
import CalcLayout from "@/components/calc/CalcLayout";
import { DollarInput, PercentInput, CalcInput } from "@/components/calc/CalcInput";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { amortizationSchedule, monthlyPI, totalInterest } from "@/lib/calc/mortgage";
import { formatDollars, formatDollarsCents } from "@/lib/calc/format";

/**
 * /tools/amortization — inline SVG chart of principal vs. interest
 * over the loan's life, plus a summary block. Pure SVG, no chart
 * library — keeps bundle small and works across themes since strokes
 * use CSS custom properties.
 */
export default function AmortizationPage() {
  const [loanAmount, setLoanAmount] = useState(500_000);
  const [rate, setRate] = useState(6.375);
  const [termYears, setTermYears] = useState(30);

  const { schedule, payment, total } = useMemo(() => {
    const termMonths = termYears * 12;
    const s = amortizationSchedule(loanAmount, rate, termMonths);
    const p = monthlyPI(loanAmount, rate, termMonths);
    const t = totalInterest(loanAmount, rate, termMonths);
    return { schedule: s, payment: p, total: t };
  }, [loanAmount, rate, termYears]);

  // Sample once per month for the chart; downsample if huge.
  const chartData = useMemo(() => {
    const points = schedule.map((row, i) => ({
      x: i,
      balance: row.balance,
      cumInterest: row.cumInterest,
      cumPrincipal: row.cumPrincipal,
    }));
    // If longer than 720 months, downsample to every N months
    if (points.length > 400) {
      const step = Math.ceil(points.length / 400);
      return points.filter((_, i) => i % step === 0);
    }
    return points;
  }, [schedule]);

  // SVG viewbox: 800×300, padded 40 all around
  const W = 800;
  const H = 300;
  const pad = 40;
  const maxX = chartData.length - 1 || 1;
  const maxY = loanAmount + total;
  const toX = (x: number) => pad + (x / maxX) * (W - 2 * pad);
  const toY = (y: number) => H - pad - (y / maxY) * (H - 2 * pad);

  const balancePath = chartData
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x)} ${toY(p.balance)}`)
    .join(" ");
  const principalPath = chartData
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x)} ${toY(p.cumPrincipal)}`)
    .join(" ");
  const interestPath = chartData
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x)} ${toY(p.cumInterest)}`)
    .join(" ");

  return (
    <CalcLayout
      eyebrow="Amortization"
      title="Where every dollar of your payment actually goes."
      lede="Early on, most of your monthly payment is interest. It takes years for the split to flip. This chart shows exactly when."
    >
      <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-6">
          <p className="principle-label">Inputs</p>
          <DollarInput label="Loan amount" value={loanAmount} onChange={setLoanAmount} />
          <PercentInput label="Rate" value={rate} onChange={setRate} />
          <CalcInput label="Term" value={termYears} onChange={setTermYears} suffix="yrs" min={1} max={40} />
        </div>

        <div className="flex flex-col gap-6">
          <ResultCard title="Summary" highlight>
            <ResultRow label="Monthly P&I" value={formatDollarsCents(payment)} emphasis />
            <ResultRow label="Total interest over loan" value={formatDollars(total)} />
            <ResultRow label="Total paid" value={formatDollars(loanAmount + total)} />
          </ResultCard>

          <ResultCard title="Balance + cumulative paid">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto"
              role="img"
              aria-label="Amortization chart"
            >
              {/* Axes */}
              <line
                x1={pad}
                y1={H - pad}
                x2={W - pad}
                y2={H - pad}
                stroke="var(--rule)"
              />
              <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="var(--rule)" />
              {/* Balance (declining) */}
              <path
                d={balancePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
              />
              {/* Cumulative principal (rising) */}
              <path
                d={principalPath}
                fill="none"
                stroke="var(--fg)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              {/* Cumulative interest (rising) */}
              <path
                d={interestPath}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.5"
                strokeDasharray="2 3"
              />
              {/* Labels */}
              <text x={pad} y={pad - 10} fontSize="10" fill="var(--muted)" fontFamily="monospace">
                $ (0 → {formatDollars(maxY)})
              </text>
              <text x={W - pad} y={H - pad + 20} fontSize="10" fill="var(--muted)" fontFamily="monospace" textAnchor="end">
                Month {chartData.length - 1}
              </text>
            </svg>
            <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-widest mt-2" style={{ color: "var(--muted)" }}>
              <span><span style={{ color: "var(--accent)" }}>━</span> Remaining balance</span>
              <span><span style={{ color: "var(--fg)" }}>┅</span> Cumulative principal</span>
              <span>┈ Cumulative interest</span>
            </div>
          </ResultCard>
        </div>
      </div>
    </CalcLayout>
  );
}
