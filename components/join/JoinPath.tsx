"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Orb, { type OrbState } from "@/components/Orb";

/**
 * JoinPath — one segment of the path that runs down the five scenes.
 *
 * The scenes are stacked sheets (each sticky, the next sliding over
 * the last), so one document-length overlay would drift off the sheet
 * it belongs to. Each sheet therefore carries its own segment: an
 * absolute overlay covering the whole sheet, drawn in px from the
 * measured sheet size so the SVG path and the CSS `offset-path` the
 * orb rides are identical. Segments start and end at the same x, so
 * they read as one continuous line as the sheets stack.
 *
 * - `progress` (0 | 1) draws the segment and moves the orb to its end.
 * - `showOrb` puts the orb on this segment (only the latest started
 *   scene carries it, so it "travels" sheet to sheet).
 * - `pins` (the states scene) sit on the segment, spread evenly, and
 *   turn on once the path has passed them.
 * - Mobile (<768px): straight line down the left gutter.
 *   Desktop: a gentle weave inside the gutter.
 *
 * Decorative (aria-hidden); the scenes carry the text.
 */

export type JoinPin = { label: string };

export type JoinPathProps = {
  progress: number;
  orbState: OrbState;
  showOrb: boolean;
  pins?: JoinPin[];
};

type Geometry = { w: number; h: number; d: string; x: number; pinTargets: number[] };
type PinPos = { x: number; y: number; f: number };

const r = (n: number) => Math.round(n);

function buildGeometry(host: HTMLDivElement, pinCount: number): Geometry {
  const w = host.clientWidth;
  const h = host.clientHeight;
  const pinTargets = Array.from({ length: pinCount }, (_, i) => (h * (i + 1)) / (pinCount + 1));

  if (w < 768) {
    const x = 20;
    return { w, h, d: `M ${x} 0 L ${x} ${h}`, x, pinTargets };
  }
  const a = 28;
  const b = 48;
  const d = [`M ${a} 0`, `C ${a} ${r(h * 0.3)} ${b} ${r(h * 0.35)} ${b} ${r(h * 0.5)}`, `S ${a} ${r(h * 0.7)} ${a} ${h}`].join(" ");
  return { w, h, d, x: a, pinTargets };
}

export default function JoinPath({ progress, orbState, showOrb, pins = [] }: JoinPathProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [pinPos, setPinPos] = useState<PinPos[]>([]);
  const pinCount = pins.length;

  // Measure the sheet (and remeasure on resize / content growth).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setGeo(buildGeometry(host, pinCount));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [pinCount]);

  // Place pins on the path: nearest sampled point to each target y.
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line || !geo || !pinCount) return;
    const total = line.getTotalLength();
    if (!total) return;
    const samples = 240;
    const pts: PinPos[] = [];
    for (let i = 0; i <= samples; i++) {
      const f = i / samples;
      const p = line.getPointAtLength(f * total);
      pts.push({ x: p.x, y: p.y, f });
    }
    setPinPos(
      geo.pinTargets.map((ty) => {
        let best = pts[0];
        for (const p of pts) if (Math.abs(p.y - ty) < Math.abs(best.y - ty)) best = p;
        return best;
      })
    );
  }, [geo, pinCount]);

  const orbStyle = geo
    ? ({
        offsetPath: `path("${geo.d}")`,
        "--join-x": `${geo.x}px`,
        "--join-h": `${geo.h}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div ref={hostRef} className="join-path" aria-hidden="true" style={{ "--join-seg": progress } as CSSProperties}>
      {geo ? (
        <>
          <svg className="join-path__svg" viewBox={`0 0 ${geo.w} ${geo.h}`} preserveAspectRatio="none" focusable="false">
            <path d={geo.d} className="join-path__ghost" fill="none" />
            <path ref={lineRef} d={geo.d} className="join-path__line draw-path" fill="none" pathLength="1" strokeLinecap="round" />
          </svg>

          {pinPos.map((p, i) => {
            const on = progress >= p.f;
            return (
              <span key={pins[i]?.label ?? i} className={`join-pin ${on ? "is-on" : ""}`} style={{ left: p.x, top: p.y, "--i": i } as CSSProperties}>
                <span className={`tl-dot ${on ? "is-on" : ""}`} />
                <span className="join-pin__label">{pins[i]?.label}</span>
              </span>
            );
          })}

          {showOrb ? (
            <span className="join-path__orb" style={orbStyle}>
              <Orb size="ambient" state={orbState} />
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
