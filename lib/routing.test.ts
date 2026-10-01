import { describe, expect, it } from "vitest";
import {
  decodeRoute,
  defaultRoutingConfig,
  encodeRoute,
  resolveRoute,
  routingMode,
  validateRouting,
  type RoutingConfig,
} from "./routing";
import type { Mlo } from "./config";

const cfg = defaultRoutingConfig();
const OPERATOR = cfg.operatorMloId; // the WA/AZ/CA/TX MLO
const OREGON = cfg.stateAssignments.OR!; // the OR MLO
const other = { name: "Other Brokerage", idLabel: "NMLS", idNumber: "TEST-OTHER" };
const outsider: Mlo = {
  id: "outsider",
  name: "Test Outsider",
  firstName: "Test",
  nmls: "TEST-ID",
  title: "Mortgage Loan Originator",
  bioShort: "",
  nmlsConsumerAccessUrl: "",
  photo: "",
  calendly: "",
  licenses: [{ state: "OR", license: "TEST", sponsor: other, sponsorSince: "2026-10-01" }],
};

describe("registry", () => {
  it("the shipped config is valid", () => {
    expect(validateRouting(cfg)).toEqual([]);
  });

  it("every licensed state is assign today (one MLO each, operator's sponsors)", () => {
    for (const s of cfg.licensedStates) expect(routingMode(s, cfg)).toBe("assign");
    expect(routingMode("NV", cfg)).toBeNull();
  });

  it("an MLO from another brokerage flips the state to choose, and an assignment there fails the build", () => {
    const bad: RoutingConfig = { ...cfg, mlos: [...cfg.mlos, outsider] };
    expect(routingMode("OR", bad)).toBe("choose");
    const errors = validateRouting(bad);
    expect(errors.join("\n")).toMatch(/OR has an assignment, but an MLO from another sponsoring company serves it/);
  });

  it("assigning a state to an MLO whose entity differs fails the build", () => {
    const solo = { ...outsider, licenses: [{ ...outsider.licenses[0] }] };
    const bad: RoutingConfig = { ...cfg, mlos: [...cfg.mlos.filter((m) => m.id !== OREGON), solo], stateAssignments: { ...cfg.stateAssignments, OR: "outsider" } };
    expect(validateRouting(bad).join("\n")).toMatch(/OR is assigned to outsider, whose OR sponsor is not one of the operator's sponsoring companies/);
  });

  it("forcing assign on a choose state fails the build", () => {
    const bad: RoutingConfig = { ...cfg, mlos: [...cfg.mlos, outsider], stateAssignments: { ...cfg.stateAssignments, OR: undefined }, routingModeOverride: { OR: "assign" } };
    expect(validateRouting(bad).join("\n")).toMatch(/OR is forced to "assign"/);
  });
});

describe("resolveRoute", () => {
  it("IP region alone routes an assign state", () => {
    const ca = resolveRoute({ ipCountry: "US", ipRegion: "CA" });
    expect(ca).toMatchObject({ status: "matched", source: "ip", stateCode: "CA", borrowerChooses: false });
    expect(ca.mlo?.id).toBe(OPERATOR);
    expect(ca.license?.state).toBe("CA");

    const or = resolveRoute({ ipCountry: "US", ipRegion: "OR" });
    expect(or.mlo?.id).toBe(OREGON);
    expect(or.license?.sponsor.name).toBe("Home Trust Loans");
  });

  it("a CA IP with an OR property routes to the OR MLO and flags the move", () => {
    const r = resolveRoute({ ipCountry: "US", ipRegion: "CA", propertyState: "OR" });
    expect(r).toMatchObject({ status: "matched", source: "borrower_stated", stateCode: "OR", ipState: "CA", propertyState: "OR", moved: true });
    expect(r.mlo?.id).toBe(OREGON);
  });

  it("an unlicensed state gets no assignment", () => {
    const r = resolveRoute({ ipCountry: "US", ipRegion: "NV" });
    expect(r).toMatchObject({ status: "unlicensed", stateCode: "NV", stateName: "Nevada", mlo: null });
  });

  it("no state (or a non-US IP) means ask", () => {
    expect(resolveRoute({}).status).toBe("unknown");
    expect(resolveRoute({ ipCountry: "CA", ipRegion: "BC" }).status).toBe("unknown");
  });

  it("an explicit choice wins only where that MLO is licensed", () => {
    expect(resolveRoute({ chosenMloId: OPERATOR, propertyState: "OR" }).mlo?.id).toBe(OREGON);
    expect(resolveRoute({ chosenMloId: OREGON, ipCountry: "US", ipRegion: "OR" })).toMatchObject({ source: "chosen", status: "matched" });
  });

  it("a choose state lists every licensed MLO and pre-selects none", () => {
    const withOutsider: RoutingConfig = { ...cfg, mlos: [...cfg.mlos, outsider], stateAssignments: { ...cfg.stateAssignments, OR: undefined } };
    const r = resolveRoute({ propertyState: "OR" }, withOutsider, () => 0.5);
    expect(r.status).toBe("choose");
    expect(r.mlo).toBeNull();
    expect(r.candidates?.map((m) => m.id).sort()).toEqual(["outsider", OREGON].sort());
  });

  it("round-trips through the middleware header with facts re-read from the registry", () => {
    const r = resolveRoute({ ipCountry: "US", ipRegion: "CA", propertyState: "OR" });
    const back = decodeRoute(encodeRoute(r));
    expect(back).toMatchObject({ status: "matched", stateCode: "OR", moved: true, source: "borrower_stated" });
    expect(back.mlo?.id).toBe(OREGON);
    expect(decodeRoute(JSON.stringify({ s: "matched", src: "ip", st: "WA", m: OREGON, ip: "WA", p: null })).status).toBe("unknown");
    expect(decodeRoute("not json").status).toBe("unknown");
  });
});

describe("M8 routing facts", () => {
  it("names only the matched MLO, with NMLS, license and sponsor, and states the mover case plainly", async () => {
    const { m8RoutingFacts, buildM8SystemPrompt } = await import("./prompts/m8-system");
    const v = resolveRoute({ ipCountry: "US", ipRegion: "CA", propertyState: "OR" });
    const { overrides, section } = m8RoutingFacts(v);
    const prompt = buildM8SystemPrompt(overrides);
    const m = v.mlo!;
    expect(prompt).toContain(`${m.name}, ${m.title}, NMLS #${m.nmls}`);
    expect(prompt).toContain("Home Trust Loans");
    expect(section).toContain("The property is in Oregon, but their connection suggests California. Licensing follows the property");
    const operator = cfg.mlos.find((x) => x.id === OPERATOR)!;
    expect(prompt + section).not.toContain(operator.name);
  });

  it("tells M8 there is no licensed loan officer in an unlicensed state", async () => {
    const { m8RoutingFacts } = await import("./prompts/m8-system");
    expect(m8RoutingFacts(resolveRoute({ ipCountry: "US", ipRegion: "NV" })).section).toContain("There is no licensed loan officer in Nevada yet");
  });
});
