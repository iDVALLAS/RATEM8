import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MLOS, SPONSOR, STATE_MLO, DEFAULT_MLO } from "@/config/licensing";
import { licensing } from "./content/licensing";
import { CONFIG, STATES, ALL_MLOS, mloById } from "./config";
import { findLicensingMarkers } from "../scripts/check-licensing.mjs";

/**
 * C2: the licensing text is the owner's, word for word, and every fact in
 * it comes from config/licensing.ts. These strings are the owner's text
 * from the launch brief (C2), so the facts appear here only as the
 * expected output.
 */
const OWNER_LICENSES =
  `AZ Mortgage Broker License #1003167 · CA: Licensed by the Department of Financial Protection and Innovation under the California Financing Law, License #60DBO-98222 · OR Mortgage Lending License #1761573 · TX Mortgage Company License, NMLS #${SPONSOR.nmls} · WA Consumer Loan Company License #CL-1761573.`;

describe("licensing text (C2)", () => {
  it("paragraph 1 is exactly the trade-name line", () => {
    expect(licensing.tradeName).toBe("LoanM8 Loan Intelligence is a trade name of LoanM8, LLC.");
  });

  it("paragraph 2 names the originating company and lists every state license in the owner's words", () => {
    expect(licensing.originatedBy).toBe(`Mortgage loans are originated by Adcom Group Inc dba Home Trust Financial, NMLS #${SPONSOR.nmls}`);
    expect(licensing.licenses).toBe(OWNER_LICENSES);
  });

  it("paragraph 3 names the default loan officer and the Oregon loan officer, each with their NMLS", () => {
    const lead = MLOS[DEFAULT_MLO];
    const or = MLOS[STATE_MLO.OR!];
    const ca = "stateLicenses" in lead ? lead.stateLicenses.CA : "";
    expect(licensing.loanOfficers).toBe(`Loan Officer: ${lead.name}, NMLS #${lead.nmls} (${ca}). Oregon borrowers: ${or.name}, NMLS #${or.nmls}.`);
  });

  it("paragraph 4 is the owner's Equal Housing Opportunity text", () => {
    expect(licensing.equalHousing.startsWith("Equal Housing Opportunity. Not a commitment to lend")).toBe(true);
  });
});

describe("config/licensing.ts drives the registry (C2)", () => {
  it("the platform is LoanM8, LLC; Shapiro Home Loans is gone", () => {
    expect(CONFIG.entityLegalName).toBe("LoanM8, LLC");
    expect(JSON.stringify(CONFIG)).not.toContain("Shapiro Home Loans");
  });

  it("every MLO license is under the one sponsor", () => {
    for (const m of ALL_MLOS) for (const l of m.licenses) expect(l.sponsor.idNumber).toBe(SPONSOR.nmls);
  });

  it("Oregon routes to the Oregon MLO; every other state to the default MLO", () => {
    for (const st of STATES) {
      const mlo = mloById(CONFIG.routing.stateAssignments[st.code]);
      const key = STATE_MLO[st.code] ?? DEFAULT_MLO;
      expect(mlo?.nmls).toBe(MLOS[key].nmls);
    }
  });

  it("state records carry the sponsor's license and regulator", () => {
    for (const st of STATES) {
      const l = SPONSOR.stateLicenses[st.code];
      expect(st.entityLicense).toBe(`${l.type} #${l.id}`);
      expect(st.regulatorName).toBe(l.regulator);
    }
  });

  it("the default MLO's headshot file exists", () => {
    expect(existsSync(join(process.cwd(), "public", MLOS[DEFAULT_MLO].photo))).toBe(true);
  });
});

describe("check:licensing (C2 / L1)", () => {
  it("passes on the current config/licensing.ts", () => {
    expect(findLicensingMarkers(readFileSync(join(process.cwd(), "config", "licensing.ts"), "utf8"))).toEqual([]);
  });

  it("catches TBD, VERIFY and XXXX", () => {
    expect(findLicensingMarkers('a: "TBD",\nb: "ok",\nc: "VERIFY",\nd: "(XXXX)"').map((h) => h.line)).toEqual([1, 3, 4]);
  });
});
