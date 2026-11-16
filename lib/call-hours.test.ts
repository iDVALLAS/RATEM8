import { describe, expect, it } from "vitest";
import { inCallHours, pacificNow, telHref } from "./call-hours";

describe("call hours (C19)", () => {
  it("is open 9 AM to 6 PM Pacific and closed outside it", () => {
    expect(inCallHours(new Date("2026-11-16T17:00:00Z"))).toBe(true); // 9:00 AM PST
    expect(inCallHours(new Date("2026-11-16T16:59:00Z"))).toBe(false); // 8:59 AM
    expect(inCallHours(new Date("2026-11-17T01:59:00Z"))).toBe(true); // 5:59 PM
    expect(inCallHours(new Date("2026-11-17T02:00:00Z"))).toBe(false); // 6:00 PM
    expect(inCallHours(new Date("2026-07-15T16:00:00Z"))).toBe(true); // 9:00 AM PDT
  });
  it("says the Pacific time, and turns a number into a phone link", () => {
    expect(pacificNow(new Date("2026-11-16T04:14:00Z"))).toBe("Sunday 8:14 PM");
    expect(telHref("206-234-2734")).toBe("tel:+12062342734");
    expect(telHref("1 (206) 351-0923")).toBe("tel:+12063510923");
    expect(telHref("[PHONE]")).toBeNull();
  });
});
