/**
 * StateOutline — a simplified outline of a licensed state (v15, Patch B
 * location beacon). Outline shapes only: coarse polygons from a handful of
 * longitude/latitude corners, never official seals or logos. Any other
 * state (or none) gets a plain map-pin outline.
 *
 * Decorative: aria-hidden. currentColor stroke.
 */
const SHAPES: Record<string, ReadonlyArray<readonly [number, number]>> = {
  WA: [[-124.7, 48.4], [-123.2, 48.2], [-122.8, 49.0], [-117.0, 49.0], [-117.0, 46.0], [-119.0, 46.0], [-121.2, 45.6], [-122.8, 45.6], [-124.0, 46.3]],
  OR: [[-124.0, 46.3], [-122.8, 45.6], [-121.2, 45.6], [-119.0, 46.0], [-116.9, 46.0], [-116.5, 45.5], [-116.9, 44.9], [-117.2, 44.3], [-117.0, 43.7], [-117.0, 42.0], [-124.2, 42.0], [-124.6, 42.8], [-124.0, 44.5]],
  CA: [[-124.2, 42.0], [-120.0, 42.0], [-120.0, 39.0], [-114.6, 35.0], [-114.7, 32.7], [-117.1, 32.5], [-118.5, 34.0], [-120.6, 34.5], [-121.9, 36.6], [-122.5, 37.8], [-123.8, 39.8], [-124.4, 40.4]],
  AZ: [[-114.8, 37.0], [-109.05, 37.0], [-109.05, 31.33], [-111.07, 31.33], [-114.8, 32.5], [-114.6, 35.0], [-114.05, 36.2]],
  TX: [[-106.6, 32.0], [-103.0, 32.0], [-103.0, 36.5], [-100.0, 36.5], [-100.0, 34.56], [-97.0, 33.8], [-94.0, 33.6], [-94.0, 29.7], [-97.2, 27.8], [-97.4, 25.9], [-99.2, 26.4], [-101.4, 29.8], [-103.2, 29.0], [-104.7, 29.9], [-106.6, 31.8]],
};

const BOX = 24;
const PAD = 2;

/** Equirectangular projection scaled to fit a 24×24 box, centred. */
function pathFor(points: ReadonlyArray<readonly [number, number]>): string {
  const lat0 = points.reduce((a, p) => a + p[1], 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map(([lon, lat]) => [lon * k, -lat] as const);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = (BOX - PAD * 2) / Math.max(maxX - minX, maxY - minY);
  const offX = (BOX - (maxX - minX) * scale) / 2;
  const offY = (BOX - (maxY - minY) * scale) / 2;
  return (
    xy.map(([x, y], i) => `${i ? "L" : "M"}${(offX + (x - minX) * scale).toFixed(2)} ${(offY + (y - minY) * scale).toFixed(2)}`).join(" ") + " Z"
  );
}

const PATHS: Record<string, string> = Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, pathFor(v)]));

export default function StateOutline({ code, className = "" }: { code?: string | null; className?: string }) {
  const d = code ? PATHS[code] : undefined;
  return (
    <svg aria-hidden="true" focusable="false" className={className} viewBox={`0 0 ${BOX} ${BOX}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      {d ? (
        <path d={d} />
      ) : (
        <>
          <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.2" />
        </>
      )}
    </svg>
  );
}
