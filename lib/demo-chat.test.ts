import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoAsOf, demoChat, demoLender, demoLenderText } from "./demoChat";
import { CONFIG } from "./config";

const DISCLAIMER = "Sample conversation. Live pricing not yet active.";

describe("scripted demo pricing copy (v25)", () => {
  it("never calls demo pricing live (the 'not yet active' disclaimer is the one exception)", () => {
    expect(JSON.stringify(demoChat)).not.toMatch(/\blive\b|\bsync/i);
    const src = readFileSync("components/ChatExperience.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(DISCLAIMER, "");
    expect(src).not.toMatch(/\blive\b|\bsync/i);
    expect(readFileSync("components/ChatExperience.tsx", "utf8")).toContain(DISCLAIMER);
  });

  it("dates example pricing with the calendar date, in the operator's time zone", () => {
    expect(demoAsOf(new Date("2026-10-11T18:00:00Z"))).toBe("October 11, 2026");
    // 02:00 UTC on the 12th is still the 11th in Washington.
    expect(demoAsOf(new Date("2026-10-12T02:00:00Z"))).toBe("October 11, 2026");
  });
});


describe("named lenders, with a revert to numbering (v26, numbered since v32)", () => {
  it("numbers the demo's lenders while the switch is off (owner 2026-10-30)", () => {
    expect(CONFIG.demo.namedLenders).toBe(false);
    expect(demoLender(0)).toEqual({ label: "Lender 1", slug: null, index: 0 });
    expect(demoLender(0, true)).toEqual({ label: "UWM", slug: "uwm", index: 0 });
  });

  it("reverts every named spot to 'Lender N' when the switch is off", () => {
    expect(demoLender(1, false)).toEqual({ label: "Lender 2", slug: null, index: 1 });
    expect(demoLenderText("30yr · 0.5 pts · UWM", 0, false)).toBe("30yr · 0.5 pts · Lender 1");
    expect(demoLenderText("OPTION 02 · ROCKET PRO", 1, false)).toBe("OPTION 02 · LENDER 2");
    expect(demoLenderText("OPTION 02 · ROCKET PRO", 1, true)).toBe("OPTION 02 · ROCKET PRO");
  });
});
