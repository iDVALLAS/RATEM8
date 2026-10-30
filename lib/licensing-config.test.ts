import { describe, expect, it } from "vitest";
import { CONFIG, PLATFORM, SPONSOR, SPONSORS, STATES, mloById, isPlaceholder } from "./config";
import { LAUNCH_STATES, LICENSED_STATES } from "./states";
import { buildDisclaimer } from "./licensing";
import { findGaps, isStrict } from "../scripts/check-licensing.mjs";

describe("L1 licensing config", () => {
  it("names LoanM8, LLC as the platform and gives it no NMLS number", () => {
    expect(PLATFORM.legalName).toBe("LoanM8, LLC");
    expect(CONFIG.entityLegalName).toBe(PLATFORM.legalName);
    expect("entityNmls" in CONFIG).toBe(false);
  });

  it("gives every licensed state a sponsor license line and a real regulator", () => {
    for (const st of STATES) {
      expect(st.sponsor.stateLicenses?.[st.code], st.code).toBeDefined();
      expect(st.entityLicense).toContain(st.sponsor.stateLicenses![st.code]!.id);
      expect(isPlaceholder(st.regulatorName), st.code).toBe(false);
      expect(st.regulatorUrl, st.code).toMatch(/^https:\/\//);
    }
  });

  it("originates every licensed state under the one sponsor", () => {
    for (const st of STATES) expect(st.sponsor.name, st.code).toBe(SPONSOR.name);
    expect(STATES.find((s) => s.code === "AZ")!.entityLicense).toBe("Mortgage Broker License #1003167");
  });

  it("routes Oregon to the Oregon MLO and every other state to the operator", () => {
    for (const st of STATES) {
      const id = CONFIG.routing.stateAssignments[st.code];
      expect(id, st.code).toBe(st.code === "OR" ? "mlo-002" : CONFIG.routing.operatorMloId);
      expect(mloById(id)!.licenses.some((l) => l.state === st.code), st.code).toBe(true);
    }
  });

  it("uses the operator's NMLS ID as the license in WA and TX, CA-DFPI in CA, and the AZ-issued number in AZ", () => {
    const m = CONFIG.principalMlo;
    for (const l of m.licenses) {
      if (l.state === "AZ") expect(l.license).toMatch(/^AZ-\d{7}$/);
      else expect(l.license).toBe(l.state === "CA" ? `CA-DFPI ${m.nmls}` : `NMLS ID ${m.nmls}`);
    }
  });

  it("keeps marketed and licensed states separate (Oregon licensed, not marketed)", () => {
    expect(LICENSED_STATES).toContain("OR");
    expect(LAUNCH_STATES).not.toContain("OR");
    expect(LAUNCH_STATES).toEqual(["WA", "AZ", "CA", "TX"]);
  });

  it("keeps the confirmed sponsor free of unconfirmed markers", () => {
    expect(findGaps(JSON.stringify(SPONSOR))).toEqual([]);
    expect(SPONSORS).toEqual([SPONSOR]);
  });

  it("says Equal Housing Opportunity, not Equal Housing Lender", () => {
    const text = buildDisclaimer();
    expect(text).toContain("Equal Housing Opportunity");
    expect(text).not.toContain("Equal Housing Lender");
  });
});

describe("check:licensing", () => {
  it("finds TBD, VERIFY and four-X markers", () => {
    expect(findGaps('a: "[TBD — x]"\nb: "ok"\n// carried over — VERIFY\nphone: "(XXX) XXX-XXXX"')).toHaveLength(3);
    expect(findGaps('name: "Adcom Group Inc"')).toEqual([]);
  });

  it("is strict for production builds only", () => {
    expect(isStrict({ VERCEL_ENV: "production" })).toBe(true);
    expect(isStrict({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(isStrict({ NODE_ENV: "production" })).toBe(true);
    expect(isStrict({})).toBe(false);
    expect(isStrict({ VERCEL_ENV: "preview", LICENSING_STRICT: "true" })).toBe(true);
  });
});
