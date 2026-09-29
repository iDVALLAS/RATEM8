"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import Orb, { type OrbState } from "@/components/Orb";

/**
 * JoinPath — the one SVG path that runs down the whole five-scene
 * sequence. Decorative (aria-hidden); the scenes carry the text.
 *
 * - The path `d` is built in px from the measured host size so the
 *   SVG path and the CSS `offset-path` the orb rides are identical.
 * - `--join-progress` (0..1, set by JoinScenes on the host) drives
 *   `stroke-dashoffset` on the line and `offset-distance` on the orb.
 *   Browsers without `offset-distance` get a translateY fallback.
 * - Four state pins sit on the path inside the "states" scene and turn
 *   on (`.tl-dot.is-on`) once the path has passed them.
 * - Mobile (<768px): straight line down the left gutter.
 *   Desktop: a gentle weave inside the gutter.
 */

export type JoinPin = { label: string };

type Props = {
  hostRef: RefObject<HTMLDivElement | null>;
  progress: number;
  orbState: OrbState;
  pins: JoinPin[];
};

type Geometry = { w: number; h: number; d: string; x: number; pinTargets: number[] };
type PinPos = { x: number; y: number; f: number };

const r = (n: number) => Math.round(n);

function buildGeometry(host: HTMLDivElement, pinCount: number): Geometry {
  const w = host.clientWidth;
  const h = host.scrollHeight;
  const scenes = host.querySelectorAll<HTMLElement>(".scene");
  const s2 = scenes[1];
  // Pins live inside the second ("states") scene, spread evenly.
  const top = s2 ? s2.offsetTop : h * 0.2;
  const height = s2 ? s2.offsetHeight : h * 0.2;
  const pinTargets = Array.from({ length: pinCount }, (_, i) => top + (height * (i + 1)) / (pinCount + 1));

  if (w < 768) {
    const x = 20;
    return { w, h, d: `M ${x} 0 L ${x} ${h}`, x, pinTargets };
  }
  const a = 28;
  const b = 48;
  const d = [
    `M ${a} 0`,
    `C ${a} ${r(h * 0.12)} ${b} ${r(h * 0.18)} ${b} ${r(h * 0.3)}`,
    `S ${a} ${r(h * 0.45)} ${a} ${r(h * 0.55)}`,
    `S ${b} ${r(h * 0.75)} ${b} ${r(h * 0.85)}`,
    `S ${a} ${r(h * 0.95)} ${a} ${h}`,
  ].join(" ");
  return { w, h, d, x: a, pinTargets };
}

export default function JoinPath({ hostRef, progress, orbState, pins }: Props) {
  const lineRef = useRef<SVGPathElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [pinPos, setPinPos] = useState<PinPos[]>([]);
  const pinCount = pins.length;

  // Measure the host (and remeasure on resize / content growth).
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
  }, [hostRef, pinCount]);

  // Place pins on the path: nearest sampled point to each target y.
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line || !geo) return;
    const total = line.getTotalLength();
    if (!total) return;
    const samples = 240;
    const pts: { x: number; y: number; f: number }[] = [];
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
  }, [geo]);

  if (!geo) return null;

  const orbStyle = {
    offsetPath: `path("${geo.d}")`,
    "--join-x": `${geo.x}px`,
    "--join-h": `${geo.h}px`,
  } as CSSProperties;

  return (
    <div className="join-path" aria-hidden="true">
      <svg className="join-path__svg" viewBox={`0 0 ${geo.w} ${geo.h}`} preserveAspectRatio="none" focusable="false">
        <path d={geo.d} className="join-path__ghost" fill="none" />
        <path ref={lineRef} d={geo.d} className="join-path__line draw-path" fill="none" pathLength="1" strokeLinecap="round" />
      </svg>

      {pinPos.map((p, i) => {
        const on = progress >= p.f;
        return (
          <span
            key={pins[i]?.label ?? i}
            className={`join-pin ${on ? "is-on" : ""}`}
            style={{ left: p.x, top: p.y, "--i": i } as CSSProperties}
          >
            <span className={`tl-dot ${on ? "is-on" : ""}`} />
            <span className="join-pin__label">{pins[i]?.label}</span>
          </span>
        );
      })}

      <span className="join-path__orb" style={orbStyle}>
        <Orb size="ambient" state={orbState} />
      </span>
    </div>
  );
}
