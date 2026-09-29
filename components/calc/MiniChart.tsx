"use client";

import { useId, useMemo, useState } from "react";
import type { PointerEvent } from "react";

/**
 * MiniChart — a small inline SVG line chart. No library.
 *
 * Up to two series. Series 0 is the accent line; series 1 is a dashed
 * neutral line, so the pair is distinguishable without color. A legend
 * is always rendered, a marker can flag the crossing, a crosshair
 * tooltip follows the pointer, and a visually hidden table carries a
 * few data points for screen readers.
 */
export type ChartSeries = { name: string; points: { x: number; y: number }[] };

type MiniChartProps = {
  series: ChartSeries[];
  /** Formats an x value for axis ticks and the table. */
  formatX: (x: number) => string;
  /** Formats a y value for axis ticks, tooltip, and the table. */
  formatY: (y: number) => string;
  xLabel: string;
  yLabel: string;
  /** Optional point to mark (e.g. the break-even). */
  marker?: { x: number; y: number; label: string } | null;
  ariaLabel: string;
  caption?: string;
  /** Number of rows in the hidden table. */
  tableRows?: number;
};

const W = 640;
const H = 280;
const PAD = { top: 16, right: 20, bottom: 40, left: 64 };

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export default function MiniChart({ series, formatX, formatY, xLabel, yLabel, marker, ariaLabel, caption, tableRows = 6 }: MiniChartProps) {
  const uid = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (all.length === 0) return null;
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    let yMin = Math.min(0, ...ys);
    let yMax = Math.max(...ys);
    if (yMax === yMin) yMax = yMin + 1;
    const yStep = niceStep(yMax - yMin, 4);
    yMin = Math.floor(yMin / yStep) * yStep;
    yMax = Math.ceil(yMax / yStep) * yStep;
    const xStep = niceStep(xMax - xMin, 6);
    const sx = (x: number) => PAD.left + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * (W - PAD.left - PAD.right);
    const sy = (y: number) => H - PAD.bottom - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 1e-9; v += yStep) yTicks.push(v);
    const xTicks: number[] = [];
    for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax + 1e-9; v += xStep) xTicks.push(v);
    const paths = series.map((s) =>
      s.points
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
        .join(" ")
    );
    return { xMin, xMax, yMin, yMax, sx, sy, yTicks, xTicks, paths };
  }, [series]);

  if (!model) {
    return <p className="calc-note">Nothing to chart yet. Enter values above.</p>;
  }

  const { sx, sy, yTicks, xTicks, paths, xMin, xMax } = model;
  const base = series[0]?.points ?? [];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (base.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const x = xMin + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (xMax - xMin);
    let best = 0;
    let bestD = Infinity;
    base.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHoverIdx(best);
  };

  const hover = hoverIdx !== null && base[hoverIdx] ? base[hoverIdx] : null;
  const hoverX = hover ? sx(hover.x) : 0;
  const tipRight = hover ? hoverX > W * 0.6 : false;

  // Table rows: evenly spaced sample of the base series.
  const rowIdx: number[] = [];
  if (base.length > 0) {
    const n = Math.min(tableRows, base.length);
    for (let i = 0; i < n; i++) rowIdx.push(Math.round((i / Math.max(1, n - 1)) * (base.length - 1)));
  }

  return (
    <figure className="calc-chart">
      <svg
        className="calc-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={`${uid}-table`}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Gridlines + y ticks */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="calc-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} />
            <text className="calc-chart__axis" x={PAD.left - 8} y={sy(v) + 4} textAnchor="end">
              {formatY(v)}
            </text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((v) => (
          <text key={`x${v}`} className="calc-chart__axis" x={sx(v)} y={H - PAD.bottom + 18} textAnchor="middle">
            {formatX(v)}
          </text>
        ))}
        <text className="calc-chart__axis" x={W - PAD.right} y={H - 4} textAnchor="end">
          {xLabel}
        </text>
        <text className="calc-chart__axis" x={PAD.left - 8} y={PAD.top - 4} textAnchor="end">
          {yLabel}
        </text>
        {/* Series */}
        {paths.map((d, i) => (
          <path key={i} className={`calc-chart__line calc-chart__line--${i}`} d={d} />
        ))}
        {/* Marker */}
        {marker && Number.isFinite(marker.x) && Number.isFinite(marker.y) ? (
          <g>
            <circle className="calc-chart__marker" cx={sx(marker.x)} cy={sy(marker.y)} r={5} />
            <text
              className="calc-chart__marker-label"
              x={sx(marker.x) + (sx(marker.x) > W * 0.6 ? -10 : 10)}
              y={sy(marker.y) - 10}
              textAnchor={sx(marker.x) > W * 0.6 ? "end" : "start"}
            >
              {marker.label}
            </text>
          </g>
        ) : null}
        {/* Hover layer */}
        {hover ? (
          <g aria-hidden="true">
            <line className="calc-chart__hover-line" x1={hoverX} x2={hoverX} y1={PAD.top} y2={H - PAD.bottom} />
            {series.map((s, i) => {
              const p = s.points[hoverIdx as number];
              return p && Number.isFinite(p.y) ? <circle key={i} className={`calc-chart__hover-dot--${i}`} cx={sx(p.x)} cy={sy(p.y)} r={4.5} /> : null;
            })}
            <g transform={`translate(${tipRight ? hoverX - 12 - 190 : hoverX + 12}, ${PAD.top})`}>
              <rect className="calc-chart__tip" width={190} height={16 + 16 * (series.length + 1)} rx={6} />
              <text className="calc-chart__tip-text" x={10} y={18}>
                {formatX(hover.x)}
              </text>
              {series.map((s, i) => {
                const p = s.points[hoverIdx as number];
                return (
                  <text key={i} className="calc-chart__tip-text" x={10} y={34 + 16 * i}>
                    {s.name}: {p && Number.isFinite(p.y) ? formatY(p.y) : "—"}
                  </text>
                );
              })}
            </g>
          </g>
        ) : null}
      </svg>
      <ul className="calc-chart__legend" aria-label="Legend">
        {series.map((s, i) => (
          <li key={s.name}>
            <span className={`calc-chart__swatch calc-chart__swatch--${i}`} aria-hidden="true" />
            {s.name}
          </li>
        ))}
        {marker ? (
          <li>
            <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 9999, background: "var(--accent)" }} />
            {marker.label}
          </li>
        ) : null}
      </ul>
      {caption ? <figcaption className="calc-chart__caption">{caption}</figcaption> : null}
      <table id={`${uid}-table`} className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{xLabel}</th>
            {series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowIdx.map((i) => (
            <tr key={i}>
              <th scope="row">{formatX(base[i].x)}</th>
              {series.map((s) => (
                <td key={s.name}>{s.points[i] && Number.isFinite(s.points[i].y) ? formatY(s.points[i].y) : "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
