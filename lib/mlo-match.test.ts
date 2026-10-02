import { describe, expect, it } from "vitest";
import { NO_MLO, fillMlo, nameableMlo, type MloContextValue } from "./mlo-match";

const mlo = {
  name: "Pat Example",
  firstName: "Pat",
  nmls: "TEST-ID",
  title: "Mortgage Loan Originator",
  bioShort: "",
  nmlsConsumerAccessUrl: "",
  id: "test",
  photo: "",
  calendly: "",
  applicationUrl: "",
  licenses: [],
};

const v = (over: Partial<MloContextValue>): MloContextValue => ({ mlo, source: "none", ...over });

describe("nameableMlo", () => {
  it("never names anyone by default", () => {
    expect(nameableMlo(NO_MLO)).toBeNull();
    expect(nameableMlo(v({ source: "none" }))).toBeNull();
  });

  it("names the MLO the borrower chose or matched by region", () => {
    expect(nameableMlo(v({ source: "chosen" }))).toBe(mlo);
    expect(nameableMlo(v({ source: "borrower_stated" }))).toBe(mlo);
    expect(nameableMlo(v({ source: "borrower_stated", borrowerChooses: true }))).toBe(mlo);
  });

  it("IP alone names only in a known assign state", () => {
    expect(nameableMlo(v({ source: "ip", borrowerChooses: false }))).toBe(mlo);
    expect(nameableMlo(v({ source: "ip", borrowerChooses: true }))).toBeNull();
    expect(nameableMlo(v({ source: "ip" }))).toBeNull();
  });

  it("returns null without an MLO whatever the source", () => {
    expect(nameableMlo({ mlo: null, source: "chosen" })).toBeNull();
  });
});

describe("fillMlo", () => {
  it("fills first and full name tokens", () => {
    expect(fillMlo("{first}. Not a processor.", mlo)).toBe("Pat. Not a processor.");
    expect(fillMlo("{name}.", mlo)).toBe("Pat Example.");
  });
});
