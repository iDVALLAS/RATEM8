/**
 * app/mlo/art.tsx — the small illustrations on the home screen's tiles
 * (D43). Drawn in SVG from the theme tokens, so they follow Night, Dim and
 * Paper, and never a photo of people (fair-housing rule, CLAUDE.md §4.8).
 * Each one shows what the screen does: chat bubbles, a pipeline board, a
 * receipt.
 */
const S = { panel: "var(--cc-art-card)", line: "var(--cc-art-line)", hi: "var(--cc-hi)", mint: "var(--cc-mint)", soft: "var(--cc-art-soft)", ink: "var(--cc-hi-text)" };

const bar = (x: number, y: number, w: number, h = 7, fill = S.line, r = 3.5) => <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} />;

const SCENES: Record<string, React.ReactNode> = {
  concierge: (
    <>
      <rect x="28" y="26" width="150" height="44" rx="14" fill={S.panel} />
      {bar(42, 40, 96)}
      {bar(42, 54, 70, 7, S.soft)}
      <rect x="120" y="78" width="168" height="44" rx="14" fill={S.hi} />
      {bar(134, 92, 110, 7, S.ink)}
      {bar(134, 106, 78, 7, S.ink)}
      <path d="M268 30l5 14 14 5-14 5-5 14-5-14-14-5 14-5z" fill={S.mint} />
    </>
  ),
  inbox: (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="34" y={22 + i * 34} width="252" height="26" rx="10" fill={S.panel} />
          <circle cx="52" cy={35 + i * 34} r="7" fill={i === 0 ? S.hi : S.soft} />
          {bar(68, 31 + i * 34, i === 0 ? 150 : 120)}
          {i === 0 ? <circle cx="270" cy={35} r="5" fill={S.mint} /> : null}
        </g>
      ))}
    </>
  ),
  calls: (
    <>
      <rect x="40" y="30" width="64" height="84" rx="16" fill={S.panel} />
      <circle cx="72" cy="72" r="18" fill={S.hi} />
      <path d="M66 64h4l2 5-3 2a10 10 0 0 0 5 5l2-3 5 2v4a3 3 0 0 1-3 3c-9-1-16-8-17-17a3 3 0 0 1 3-3z" fill={S.ink} />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
        const h = [18, 34, 26, 52, 40, 60, 30, 44, 22, 14][i];
        return <rect key={i} x={130 + i * 16} y={72 - h / 2} width="8" height={h} rx="4" fill={i % 3 === 0 ? S.mint : S.line} />;
      })}
    </>
  ),
  contacts: (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const x = 46 + (i % 5) * 56;
        const y = 44 + Math.floor(i / 5) * 52;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="18" fill={i === 2 ? S.hi : S.panel} />
            <circle cx={x} cy={y - 4} r="6" fill={i === 2 ? S.ink : S.soft} />
            <path d={`M${x - 10} ${y + 11}c2-6 6-8 10-8s8 2 10 8`} fill={i === 2 ? S.ink : S.soft} />
            <circle cx={x + 13} cy={y + 13} r="4.5" fill={i % 3 === 0 ? S.mint : S.line} />
          </g>
        );
      })}
    </>
  ),
  import: (
    <>
      {["XLSX", "CSV", "VCF"].map((t, i) => (
        <g key={t}>
          <rect x={30 + i * 14} y={30 + i * 14} width="70" height="80" rx="10" fill={i === 2 ? S.hi : S.panel} />
          <text x={42 + i * 14} y={58 + i * 14} fontSize="12" fontFamily="var(--font-jetbrains), monospace" fill={i === 2 ? S.ink : S.line}>{t}</text>
        </g>
      ))}
      <path d="M150 74h40m-10-10 10 10-10 10" stroke={S.mint} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[0, 1, 2, 3].map((i) => <g key={i}><rect x="208" y={34 + i * 22} width="84" height="14" rx="7" fill={S.panel} /><circle cx="218" cy={41 + i * 22} r="4" fill={S.mint} /></g>)}
    </>
  ),
  permission: (
    <>
      <rect x="96" y="24" width="128" height="96" rx="14" fill={S.panel} />
      {[0, 1, 2].map((i) => <g key={i}><rect x="112" y={40 + i * 24} width="14" height="14" rx="4" fill={S.hi} /><path d={`M115 ${47 + i * 24}l3 3 5-6`} stroke={S.ink} strokeWidth="2" fill="none" />{bar(134, 43 + i * 24, 70)}</g>)}
    </>
  ),
  leads: (
    <>
      <circle cx="110" cy="72" r="30" fill={S.panel} />
      <circle cx="110" cy="64" r="10" fill={S.soft} />
      <path d="M92 90c3-10 10-14 18-14s15 4 18 14" fill={S.soft} />
      <circle cx="140" cy="46" r="13" fill={S.hi} />
      <path d="M140 40v12M134 46h12" stroke={S.ink} strokeWidth="3" strokeLinecap="round" />
      {bar(170, 56, 110)}
      {bar(170, 72, 80, 7, S.soft)}
      {bar(170, 88, 96, 7, S.mint)}
    </>
  ),
  templates: (
    <>
      <rect x="70" y="40" width="110" height="80" rx="12" fill={S.panel} transform="rotate(-8 125 80)" />
      <rect x="110" y="30" width="110" height="84" rx="12" fill={S.panel} transform="rotate(4 165 72)" />
      <rect x="150" y="28" width="116" height="88" rx="12" fill={S.hi} />
      {bar(164, 44, 72, 7, S.ink)}
      {bar(164, 58, 88, 7, S.ink)}
      {bar(164, 72, 60, 7, S.ink)}
      <rect x="164" y="92" width="44" height="14" rx="7" fill={S.ink} />
    </>
  ),
  scripts: (
    <>
      <rect x="60" y="20" width="200" height="104" rx="14" fill={S.panel} />
      {bar(78, 36, 90, 8, S.mint)}
      {bar(78, 54, 160)}
      <rect x="74" y="66" width="168" height="16" rx="6" fill={S.hi} />
      {bar(82, 71, 130, 6, S.ink)}
      {bar(78, 92, 140)}
      {bar(78, 108, 100, 7, S.soft)}
    </>
  ),
  pipeline: (
    <>
      {[0, 1, 2, 3].map((c) => (
        <g key={c}>
          <rect x={30 + c * 68} y="22" width="58" height="104" rx="12" fill={S.panel} />
          {Array.from({ length: [3, 2, 2, 1][c] }, (_, i) => <rect key={i} x={36 + c * 68} y={30 + i * 30} width="46" height="22" rx="7" fill={c === 3 ? S.hi : i === 0 && c === 1 ? S.mint : S.soft} />)}
        </g>
      ))}
    </>
  ),
  automations: (
    <>
      <path d="M70 72h60M190 72h60" stroke={S.line} strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" />
      <circle cx="56" cy="72" r="20" fill={S.panel} />
      <circle cx="264" cy="72" r="20" fill={S.panel} />
      <circle cx="160" cy="72" r="30" fill={S.hi} />
      <path d="M163 54l-14 21h10l-2 15 14-21h-10z" fill={S.ink} />
      <circle cx="56" cy="72" r="6" fill={S.mint} />
      <circle cx="264" cy="72" r="6" fill={S.mint} />
    </>
  ),
  refi: (
    <>
      <path d="M36 112h248" stroke={S.line} strokeWidth="2" />
      <path d="M40 48c30 6 46 22 70 26s40-10 64-2 34 30 56 30 30-8 54-12" stroke={S.soft} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M40 96c40-2 70-18 100-30s60-6 90-18 34-12 54-14" stroke={S.hi} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="284" cy="34" r="8" fill={S.mint} />
    </>
  ),
  academy: (
    <>
      <circle cx="92" cy="72" r="40" stroke={S.panel} strokeWidth="12" fill="none" />
      <path d="M92 32a40 40 0 0 1 38 52" stroke={S.hi} strokeWidth="12" fill="none" strokeLinecap="round" />
      <text x="92" y="79" textAnchor="middle" fontSize="20" fontWeight="600" fill={S.line}>5/13</text>
      {[0, 1, 2].map((i) => <g key={i}><circle cx="166" cy={44 + i * 28} r="8" fill={i < 2 ? S.mint : S.panel} />{bar(184, 40 + i * 28, [96, 80, 104][i])}</g>)}
    </>
  ),
  network: (
    <>
      <path d="M160 34 98 76M160 34l62 42M98 76l-34 34M98 76l30 34M222 76l-30 34M222 76l34 34" stroke={S.line} strokeWidth="3" />
      <circle cx="160" cy="34" r="16" fill={S.hi} />
      <circle cx="98" cy="76" r="13" fill={S.mint} />
      <circle cx="222" cy="76" r="13" fill={S.mint} />
      {[64, 128, 192, 256].map((x) => <circle key={x} cx={x} cy="112" r="10" fill={S.panel} />)}
    </>
  ),
  expenses: (
    <>
      <path d="M80 18h92v112l-11-7-12 7-11-7-12 7-11-7-12 7-11-7-12 7z" fill={S.panel} />
      {bar(94, 36, 60)}
      {bar(94, 52, 48, 7, S.soft)}
      {bar(94, 68, 64, 7, S.soft)}
      <rect x="94" y="88" width="64" height="16" rx="6" fill={S.hi} />
      <path d="M232 40c-14 0-24 10-24 23 0 18 24 41 24 41s24-23 24-41c0-13-10-23-24-23z" fill={S.mint} />
      <circle cx="232" cy="63" r="8" fill={S.panel} />
    </>
  ),
  report: (
    <>
      <path d="M40 118h240" stroke={S.line} strokeWidth="2" />
      {[44, 70, 58, 92, 80, 104].map((h, i) => <rect key={i} x={56 + i * 38} y={118 - h} width="24" height={h} rx="7" fill={i === 5 ? S.hi : i === 3 ? S.mint : S.panel} />)}
    </>
  ),
};

/** The tile's picture: its scene, or its icon large on the gradient when there isn't one. */
export function TileArt({ name, fallback }: { name: string; fallback: React.ReactNode }) {
  const scene = SCENES[name];
  return (
    <div className="cc-tile__art" aria-hidden="true">
      {scene ? <svg viewBox="0 0 320 144" preserveAspectRatio="xMidYMid meet" focusable="false">{scene}</svg> : <span className="cc-tile__art-icon">{fallback}</span>}
    </div>
  );
}
