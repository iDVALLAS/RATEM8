import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoAsOf, demoChat } from "./demoChat";

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
