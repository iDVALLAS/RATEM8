import { describe, expect, it } from "vitest";
import { STATES } from "./config";
import { STATE_HUE } from "./state-colors";

describe("state chip hues (v24)", () => {
  it("every licensed state has its own hue", () => {
    const hues = STATES.map((s) => STATE_HUE[s.code]);
    expect(hues.every((h) => h >= 1 && h <= 6)).toBe(true);
    expect(new Set(hues).size).toBe(STATES.length);
  });
});
