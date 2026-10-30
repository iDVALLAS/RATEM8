import { describe, expect, it } from "vitest";
import { officerFooterLines, originationLead, rateOfficerLine, sponsorLicenseLines, tradeNameLine } from "./licensing";
import { CONFIG, FOOTER_LEGAL, SPONSOR } from "./config";

describe("L2 footer lines, all from config", () => {
  it("first line is exactly the owner's sentence", () => {
    expect(tradeNameLine()).toBe("LoanM8 Loan Intelligence is a trade name of LoanM8, LLC.");
  });

  it("names the originating company and every state license in the owner's format", () => {
    const n = SPONSOR.nmls;
    expect(originationLead()).toBe(`Mortgage loans are originated by Adcom Group Inc dba Home Trust Financial, NMLS #${n}`);
    expect(sponsorLicenseLines()).toEqual([
      "AZ Mortgage Broker License #1003167",
      "CA: Licensed by the Department of Financial Protection and Innovation under the California Financing Law, License #60DBO-98222",
      "OR Mortgage Lending License #1761573",
      `TX Mortgage Company License, NMLS #${n}`,
      "WA Consumer Loan Company License #CL-1761573",
    ]);
  });

  it("shows the operator and the Oregon loan officer by default", () => {
    const lines = officerFooterLines(null);
    const m = CONFIG.principalMlo;
    expect(lines[0]).toBe(`Loan Officer: ${m.name}, NMLS #${m.nmls} (AZ-1037722 · CA-DFPI ${m.nmls}).`);
    const r = CONFIG.team[0];
    expect(lines[1]).toBe(`Oregon borrowers: ${r.name}, NMLS #${r.nmls}, originating under Home Trust Financial's Oregon Mortgage Lending License #1761573.`);
  });

  it("swaps to the Oregon loan officer alone for a visitor matched in Oregon", () => {
    const r = CONFIG.team[0];
    expect(officerFooterLines("mlo-002")).toEqual([
      `Loan Officer: ${r.name}, NMLS #${r.nmls}, originating under Home Trust Financial's Oregon Mortgage Lending License #1761573.`,
    ]);
    expect(officerFooterLines("mlo-001")).toHaveLength(2);
  });

  it("puts the loan officer and originating company on every rate result, by the scenario's state", () => {
    expect(rateOfficerLine("WA")).toContain(`${CONFIG.principalMlo.name}, NMLS #${CONFIG.principalMlo.nmls}`);
    expect(rateOfficerLine("WA")).toContain(`Adcom Group Inc dba Home Trust Financial, NMLS #${SPONSOR.nmls}`);
    expect(rateOfficerLine("OR")).toContain(CONFIG.team[0].name);
    expect(rateOfficerLine("ZZ")).toBeNull();
  });

  it("closes with the owner's legal paragraph", () => {
    expect(FOOTER_LEGAL.startsWith("Equal Housing Opportunity. This is not a commitment to lend or an offer to extend credit.")).toBe(true);
  });
});
