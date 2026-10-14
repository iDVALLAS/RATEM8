/**
 * lib/contrast.ts — WCAG 2.x contrast ratio for two hex colours (v24).
 * Used by the AA test (lib/contrast.test.ts) and shown on /design.
 */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Surfaces the data palette must pass on (text ≥ 4.5:1). */
export const DARK_SURFACES = ["#050B08", "#0B1F18", "#133126", "#04342C", "#0D1A15"] as const;
export const LIGHT_SURFACES = ["#FAFAF9", "#F2EFE8", "#FFFFFF"] as const;

export const DATA_PALETTE = [
  { n: 1, name: "Sky", hue: "#5BB8E0", ink: "#1C6A8C" },
  { n: 2, name: "Iris", hue: "#9AA2F5", ink: "#4651C2" },
  { n: 3, name: "Orchid", hue: "#CF94E8", ink: "#8136A8" },
  { n: 4, name: "Coral", hue: "#F2967A", ink: "#A8452A" },
  { n: 5, name: "Amber", hue: "#E9BC5C", ink: "#7F5A00" },
  { n: 6, name: "Rose", hue: "#EE8FB0", ink: "#A82D5C" },
] as const;
