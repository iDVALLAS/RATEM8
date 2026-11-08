/**
 * config/licensing.ts — the single source of truth for licensing (C2 / L1).
 *
 * Every footer, disclosure, MLO card, chat disclosure and state page reads
 * these facts (lib/config.ts derives its sponsor, MLO and state records from
 * here). No license number may be typed anywhere else; `npm run
 * check:identity` enforces it. To change sponsors, change SPONSOR only.
 *
 * Structure (owner, 2026-10-31): LoanM8, LLC is the platform and brand. All
 * loans are originated under the sponsor's NMLS.
 *
 * Facts are the owner's, from the launch brief (LoanM8_Production_Launch_Prompt.md,
 * L1). Anything unconfirmed goes in as the literal marker the build check
 * looks for, and `next build` fails until it is replaced
 * (scripts/check-licensing.mjs, run from next.config.ts).
 */

export const PLATFORM = {
  legalName: "LoanM8, LLC",
  tradeName: "LoanM8 Loan Intelligence",
  site: "LoanM8.com",
};

export const SPONSOR = {
  legalName: "Adcom Group Inc",
  dba: "Home Trust Financial",
  nmls: "1761573",
  address: "135 Lake St S, Ste 230, Kirkland, WA 98033",
  phone: "833-395-5626",
  nmlsUrl: "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1761573",
  stateLicenses: {
    AZ: { regulator: "Arizona Department of Insurance and Financial Institutions", type: "Mortgage Broker License", id: "1003167" },
    CA: { regulator: "Department of Financial Protection and Innovation", type: "Licensed under the California Financing Law", id: "60DBO-98222" },
    OR: { regulator: "Oregon Division of Financial Regulation", type: "Mortgage Lending License", id: "1761573" },
    TX: { regulator: "Texas Department of Savings and Mortgage Lending", type: "Mortgage Company License", id: "1761573" },
    WA: { regulator: "Washington Department of Financial Institutions", type: "Consumer Loan Company License", id: "CL-1761573" },
  },
};

export const MLOS = {
  jason: { name: "Jason Shapiro", nmls: "1844143", photo: "/team/jason-shapiro-2026.webp", stateLicenses: { CA: "CA-DFPI 1844143" } },
  ryder: { name: "Ryder Fasse", nmls: "119822", photo: "/team/ryder-fasse-2026.webp" /* owner-supplied photo, 2026-11-08 */ },
};

// Every state routes to Jason EXCEPT Oregon → Ryder.
export const STATE_MLO: Record<string, keyof typeof MLOS> = { OR: "ryder" /* default: jason */ };

/** The MLO every state routes to unless STATE_MLO says otherwise. */
export const DEFAULT_MLO: keyof typeof MLOS = "jason";

export type SponsorStateCode = keyof typeof SPONSOR.stateLicenses;

/** "Adcom Group Inc dba Home Trust Financial". */
export const SPONSOR_DISPLAY_NAME = `${SPONSOR.legalName} dba ${SPONSOR.dba}`;

/**
 * Texas Consumer Complaint Notice for mortgage companies, Figure: 7 TAC
 * §56.200(c). Verbatim from the current SML form the owner supplied
 * (mortgage_company_consumer_complaint_notice_website, 2026-11-01). It
 * replaces the old mortgage-banker §81.200 wording. Rendered on
 * /licensing/texas and in the Texas row of /licensing.
 */
export const TX_COMPLAINT_NOTICE = {
  citation: "Figure: 7 TAC §56.200(c)",
  text:
    "TEXAS RESIDENTS: CONSUMERS WISHING TO FILE A COMPLAINT AGAINST A MORTGAGE COMPANY OR RESIDENTIAL MORTGAGE LOAN ORIGINATOR LICENSED IN TEXAS SHOULD SEND A COMPLETED COMPLAINT FORM TO THE DEPARTMENT OF SAVINGS AND MORTGAGE LENDING (SML): 2601 N. LAMAR BLVD., SUITE 201, AUSTIN, TEXAS 78705; TEL: 1-877-276-5550. INFORMATION AND FORMS ARE AVAILABLE ON SML'S WEBSITE: SML.TEXAS.GOV.",
  smlUrl: "https://sml.texas.gov",
};
