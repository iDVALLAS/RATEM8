import { describe, expect, it } from "vitest";
import { blockerOf, fixHref, topBlocker } from "./blockers";
import { CALL_FIX } from "@/lib/content/cc-pages";

// The contact rules' own reasons (lib/send-gate/gate.ts), word for word.
const R = {
  dnc: "Do-not-call lists haven't been checked for this number in the last 31 days.",
  listed: "The number is on a do-not-call list and there's no written permission.",
  listedPast: "The number is on a do-not-call list. A past client on the list needs written permission, or a loan closed with your current company in the last 18 months.",
  state: "Their property state isn't known, so licensing can't be checked.",
  license: "You aren't licensed in OR.",
  noPerm: "A sales call to someone without permission needs a loan closed with your current company in the last 18 months, or for them to be your past client. Record their permission first.",
  ct: "Connecticut needs written permission for sales calls, except to an existing customer of your current company. Record their written permission first.",
  hold: "On hold: this person came from a previous employer's list that hasn't been released.",
  stop: "They said stop to calls or texts.",
  cap: "Already 3 calls in 24 hours (the limit is 3).",
  tx: "Texas: sales calls and texts need telephone-solicitor registration (Bus. & Com. ch. 302) or a confirmed exemption. The owner turns this on once counsel confirms.",
  wa: "They said no to a call on 2026-10-01. Washington doesn't allow another sales call for a year (RCW 80.36.390).",
  rnd: "This number was permanently disconnected after 2026-01-01 (Reassigned Numbers Database), so it may belong to someone else now. Get their current number.",
};

describe("call session blockers (D76)", () => {
  it("names the blocker from the contact rules' own reason", () => {
    expect(blockerOf(R.dnc)).toBe("dnc");
    expect(blockerOf(R.listed)).toBe("dncListed");
    expect(blockerOf(R.listedPast)).toBe("dncListed");
    expect(blockerOf(R.state)).toBe("state");
    expect(blockerOf(R.license)).toBe("license");
    expect(blockerOf(R.noPerm)).toBe("permission");
    expect(blockerOf(R.ct)).toBe("permission");
    expect(blockerOf(R.hold)).toBe("hold");
    expect(blockerOf(R.stop)).toBe("stopped");
    expect(blockerOf(R.cap)).toBe("cap");
    expect(blockerOf(R.tx)).toBe("state_rule");
    expect(blockerOf(R.wa)).toBe("state_rule");
    expect(blockerOf(R.rnd)).toBe("reassigned");
    expect(blockerOf(null)).toBe("other");
    expect(blockerOf("Something new")).toBe("other");
  });

  it("offers a fix only where the loan officer can make one", () => {
    expect(fixHref("dnc", "c1")).toBe("/mlo/contacts/permission#dnc");
    expect(fixHref("permission", "c1")).toBe("/mlo/contacts/c1#permission");
    expect(fixHref("state", "c1")).toBeNull(); // fixed in place with a state picker
    expect(fixHref("stopped", "c1")).toBeNull(); // a stop is never "fixed"
    expect(fixHref("cap", "c1")).toBeNull();
    expect(fixHref("license", "c1")).toBeNull();
    expect(CALL_FIX.stopped.label).toBe("");
    expect(CALL_FIX.dnc.label).toBe("Check do-not-call");
    expect(CALL_FIX.state.label).toBe("Add their state");
  });

  it("picks the most common blocker for Home's chip", () => {
    expect(topBlocker([])).toBeNull();
    expect(topBlocker([R.dnc, R.state, R.dnc, R.listed])).toEqual({ kind: "dnc", count: 2 });
  });
});
