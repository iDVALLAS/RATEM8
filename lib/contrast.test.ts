import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DARK_SURFACES, DATA_PALETTE, LIGHT_SURFACES, contrastRatio } from "./contrast";

const css = readFileSync("app/globals.css", "utf8");
const AA = 4.5;

describe("AA contrast (v24)", () => {
  it("matches the reference ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#5DCAA5", "#04342C")).toBeGreaterThan(6.5);
  });

  it("every data hue is AA as text on every dark surface; every ink on every light surface", () => {
    for (const d of DATA_PALETTE) {
      for (const s of DARK_SURFACES) expect(contrastRatio(d.hue, s), `${d.name} on ${s}`).toBeGreaterThanOrEqual(AA);
      for (const s of LIGHT_SURFACES) expect(contrastRatio(d.ink, s), `${d.name} ink on ${s}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the palette in lib/contrast.ts is the palette in globals.css", () => {
    for (const d of DATA_PALETTE) {
      const key = d.name.toLowerCase();
      expect(css).toContain(`--color-data-${key}: ${d.hue};`);
      expect(css).toContain(`--color-data-${key}-ink: ${d.ink};`);
    }
  });

  it("the paper text accent and brand pairs stay AA", () => {
    expect(contrastRatio("#0F6E56", "#FAFAF9")).toBeGreaterThanOrEqual(AA); // --color-m8-pine on Paper
    expect(contrastRatio("#5DCAA5", "#050B08")).toBeGreaterThanOrEqual(AA); // M8 Green on Night
    expect(contrastRatio("#1A1A19", "#F1F8F5")).toBeGreaterThanOrEqual(AA); // example label in the brief doc
  });
});
