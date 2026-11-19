import { describe, expect, it } from "vitest";
import { areaCodeState, ruleFor, ruleForStates } from "./rules";

describe("State rules (D13)", () => {
  it("reads the state from an area code we track", () => {
    expect(areaCodeState("+12065551234")).toBe("WA");
    expect(areaCodeState("+18605551234")).toBe("CT");
    expect(areaCodeState("+13055551234")).toBe("FL");
    expect(areaCodeState("+19995551234")).toBeNull();
    expect(areaCodeState(null)).toBeNull();
  });
  it("takes the strictest of several states", () => {
    const r = ruleForStates(["WA", "TX", "CT"]);
    expect(r.salesNeedWritten).toBe(true);
    expect(r.noCallYearAfterNo).toBe(true);
    expect(r.allPartyRecording).toBe(true);
    expect(r.sunday).toEqual({ start: 12, end: 20 });
    expect(ruleForStates(["TX", "LA"]).sunday).toBeNull();
    expect(ruleForStates(["WA"])).toEqual(ruleFor("WA"));
    expect(ruleForStates([null])).toEqual(ruleFor(null));
  });
});
