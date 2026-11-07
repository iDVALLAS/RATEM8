/**
 * lib/content/licensing.ts — the licensing text, built from config/licensing.ts (C2).
 *
 * The wording is the owner's (launch brief C2/L2). Every name, number,
 * license type and regulator is read from config/licensing.ts; only the
 * sentence frames live here. Rendered by the footer (every page),
 * /licensing and /licensing/texas.
 */
import { PLATFORM, SPONSOR, SPONSOR_DISPLAY_NAME, MLOS, STATE_MLO, DEFAULT_MLO, TX_COMPLAINT_NOTICE, type SponsorStateCode } from "@/config/licensing";
import { stateByCode } from "@/lib/config";

/** Footer order (alphabetical, as in the owner's text). */
export const LICENSE_ORDER: SponsorStateCode[] = ["AZ", "CA", "OR", "TX", "WA"];

/** One sponsor license as the footer states it (owner's wording per state). */
export function sponsorLicenseLine(code: SponsorStateCode): string {
  const l = SPONSOR.stateLicenses[code];
  switch (code) {
    case "CA":
      return `CA: Licensed by the ${l.regulator} under the California Financing Law, License #${l.id}`;
    case "TX":
      return `TX ${l.type}, NMLS #${l.id}`;
    default:
      return `${code} ${l.type} #${l.id}`;
  }
}

/** "Name, NMLS #… (state-issued licenses)", all from config/licensing.ts. */
function mloLine(key: keyof typeof MLOS): string {
  const m = MLOS[key];
  const own = "stateLicenses" in m ? Object.values(m.stateLicenses as Record<string, string>) : [];
  return `${m.name}, NMLS #${m.nmls}${own.length ? ` (${own.join(", ")})` : ""}`;
}

export const licensing = {
  /** Footer paragraph 1, exactly. */
  tradeName: `${PLATFORM.tradeName} is a trade name of ${PLATFORM.legalName}.`,
  /** Footer paragraph 2: before and after the NMLS Consumer Access link. */
  originatedBy: `Mortgage loans are originated by ${SPONSOR_DISPLAY_NAME}, NMLS #${SPONSOR.nmls}`,
  consumerAccess: "NMLS Consumer Access",
  licenses: `${LICENSE_ORDER.map(sponsorLicenseLine).join(" · ")}.`,
  /** Footer paragraph 3: the default MLO, then each state routed elsewhere. */
  loanOfficers: [
    `Loan Officer: ${mloLine(DEFAULT_MLO)}.`,
    ...Object.entries(STATE_MLO).map(([code, key]) => `${stateByCode(code)?.name ?? code} borrowers: ${mloLine(key)}.`),
  ].join(" "),
  /** Footer paragraph 4, exactly (owner's C2 wording). */
  equalHousing:
    "Equal Housing Opportunity. Not a commitment to lend or an offer to extend credit. All loans subject to credit approval, underwriting, and property eligibility. Rates, terms, and programs subject to change without notice. Not all programs available in all states.",
  equalHousingLogo: "Equal Housing Opportunity logo",
  links: {
    licensing: "Licensing",
    texas: "Texas Consumer Complaint Notice",
    disclosures: "Full disclosures",
  },

  /** /licensing */
  page: {
    title: "Licensing",
    description: `Every license behind ${PLATFORM.tradeName}: the originating company's NMLS and state licenses, our loan officers, and state notices.`,
    eyebrow: "// licensing",
    heading: "Who is licensed, and where.",
    status: "Licensing facts as of November 1, 2026",
    sections: [
      { id: "company", title: "Originating company" },
      { id: "states", title: "State licenses" },
      { id: "loan-officers", title: "Loan officers" },
      { id: "notices", title: "State notices" },
    ],
    lead: `${PLATFORM.tradeName} is a trade name of ${PLATFORM.legalName}. ${PLATFORM.legalName} runs the platform. Every mortgage loan is originated by ${SPONSOR_DISPLAY_NAME}, NMLS #${SPONSOR.nmls}, under the licenses below.`,
    sponsorHeading: "Originating company",
    sponsorRows: {
      name: "Company",
      nmls: "NMLS",
      address: "Address",
      phone: "Phone",
    },
    lookup: "Look it up on NMLS Consumer Access",
    statesHeading: "State licenses",
    columns: { state: "State", license: "License", number: "Number", regulator: "Regulator" },
    mlosHeading: "Loan officers",
    mloColumns: { name: "Loan officer", nmls: "NMLS", states: "Licensed for", lookup: "Lookup" },
    noticesHeading: "State notices",
    texasLink: "Read the Texas Consumer Complaint Notice",
    disclosuresLink: "Full disclosures, including Equal Housing Opportunity and our AI disclosure",
  },

  /** /licensing/texas */
  texas: {
    title: "Texas Consumer Complaint Notice",
    description: "The Texas Department of Savings and Mortgage Lending consumer complaint notice for mortgage companies.",
    eyebrow: "// texas",
    citation: TX_COMPLAINT_NOTICE.citation,
    notice: TX_COMPLAINT_NOTICE.text,
    smlLink: "Texas Department of Savings and Mortgage Lending",
    smlUrl: TX_COMPLAINT_NOTICE.smlUrl,
    back: "All licensing",
    status: "Current SML form for mortgage companies",
    sections: [{ id: "notice", title: "Consumer complaint notice" }],
    intro: "Required notice for Texas residents, from the Texas Department of Savings and Mortgage Lending.",
  },
} as const;
