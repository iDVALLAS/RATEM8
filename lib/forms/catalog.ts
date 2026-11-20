/**
 * lib/forms/catalog.ts — what the LOA's forms side knows (D66). Pure.
 *
 * The owner asked for "a forms side where forms can be pulled from ARIVE
 * and filled out, or dropped in and held within the account": standard
 * title and escrow forms and request forms. ARIVE has no way for other
 * software to pull files, so ARIVE forms are downloaded and dropped in;
 * disclosures stay in the loan system (owner, 2026-11-20).
 *
 * Two kinds of form:
 *  - Letters Command Center writes from the loan file (LETTERS): the loan
 *    officer reads and edits the words, then saves a PDF on letterhead.
 *  - Fillable PDFs someone drops in (official forms, the title or escrow
 *    company's own): their fields are matched to the file (suggest()), the
 *    loan officer checks each one, and a filled copy is saved.
 * Never filled by Command Center: Social Security numbers, dates of birth,
 * account and routing numbers, signatures. Those stay for the borrower.
 */
import type { PartyRole } from "@/lib/loa/store";

export const FORM_KINDS = ["title", "escrow", "payoff", "insurance", "hoa", "verification", "tax", "borrower_letter", "lender", "other"] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const FORM_KIND_LABELS: Record<FormKind, string> = {
  title: "Title",
  escrow: "Escrow",
  payoff: "Payoff",
  insurance: "Insurance",
  hoa: "HOA or condo",
  verification: "Verification (employment, deposit)",
  tax: "Tax transcript or SSA",
  borrower_letter: "Borrower letter",
  lender: "Lender form",
  other: "Other",
};

/** Official forms worth keeping in the library, and where the blank ones live. */
export const OFFICIAL_FORMS = [
  { name: "Request for Verification of Employment (Fannie Mae Form 1005)", where: "singlefamily.fanniemae.com, Forms", kind: "verification" as FormKind },
  { name: "Request for Verification of Deposit (Fannie Mae Form 1006)", where: "singlefamily.fanniemae.com, Forms", kind: "verification" as FormKind },
  { name: "IRS Form 4506-C (tax transcript request)", where: "irs.gov, Forms & Instructions", kind: "tax" as FormKind },
  { name: "SSA-89 (Social Security number verification)", where: "ssa.gov, Forms", kind: "tax" as FormKind },
  { name: "Your title and escrow companies' own order and instruction forms", where: "from your escrow and title officers", kind: "title" as FormKind },
  { name: "Lender forms from ARIVE (and other loan systems)", where: "download from the loan in ARIVE, then drop here", kind: "lender" as FormKind },
];

/** What the file says, for filling. Every value is a string; blank when unknown. */
export type Facts = {
  today: string;
  borrowerName: string;
  borrowerFirst: string;
  borrowerLast: string;
  borrowerEmail: string;
  borrowerPhone: string;
  propertyStreet: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  propertyAddress: string;
  purpose: string;
  loanNumber: string;
  loanAmount: string;
  salesPrice: string;
  closingDate: string;
  loName: string;
  loNmls: string;
  loPhone: string;
  loEmail: string;
  companyName: string;
  companyNmls: string;
  companyAddress: string;
  escrowCompany: string;
  escrowOfficer: string;
  escrowEmail: string;
  titleCompany: string;
  titleOfficer: string;
  titleEmail: string;
  lenderName: string;
  insuranceAgent: string;
  buyerAgent: string;
  listingAgent: string;
  payoffs: string[];
};
export type FactKey = Exclude<keyof Facts, "payoffs">;

export const FACT_LABELS: Record<FactKey, string> = {
  today: "today's date",
  borrowerName: "borrower's name",
  borrowerFirst: "borrower's first name",
  borrowerLast: "borrower's last name",
  borrowerEmail: "borrower's email",
  borrowerPhone: "borrower's phone",
  propertyStreet: "property street",
  propertyCity: "property city",
  propertyState: "property state",
  propertyZip: "property ZIP",
  propertyAddress: "property address",
  purpose: "loan purpose",
  loanNumber: "loan number",
  loanAmount: "loan amount",
  salesPrice: "sales price",
  closingDate: "closing date",
  loName: "your name",
  loNmls: "your NMLS",
  loPhone: "your phone",
  loEmail: "your email",
  companyName: "your company",
  companyNmls: "company NMLS",
  companyAddress: "company address",
  escrowCompany: "escrow company",
  escrowOfficer: "escrow officer",
  escrowEmail: "escrow officer's email",
  titleCompany: "title company",
  titleOfficer: "title officer",
  titleEmail: "title officer's email",
  lenderName: "lender",
  insuranceAgent: "insurance agent",
  buyerAgent: "buyer's agent",
  listingAgent: "listing agent",
};

/** Field names that only the borrower fills. Never suggested, and a value typed there isn't kept. */
export const SENSITIVE_FIELD = /ssn|socialsec|social|taxpayerid(entification)?(number|no)?|\btin\b|^tin|itin|ein|dob|dateofbirth|birth|accountn(o|um)|acctn|account#|accountnumber|routing|aba|pin\b|password|signature|sign(ed)?by|initials/;
/** A value that looks like a Social Security number. */
export const SSN_VALUE = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/;

const norm = (s: string) => s.toLowerCase().replace(/\[\d+\]/g, "").replace(/[^a-z0-9#]/g, "");

/** [pattern on the normalized field name, fact] in order: the first match wins. */
const RULES: [RegExp, FactKey][] = [
  [/(borrower|applicant|taxpayer|employee|depositor|client|customer|buyer|purchaser|homeowner|insured)s?first/, "borrowerFirst"],
  [/(borrower|applicant|taxpayer|employee|depositor|client|customer|buyer|purchaser|homeowner|insured)s?last/, "borrowerLast"],
  [/(borrower|applicant|taxpayer|employee|depositor|client|customer|buyer|purchaser|homeowner|insured|mortgagor)s?(full)?(legal)?name/, "borrowerName"],
  [/(borrower|applicant|client|buyer|customer)s?(e)?mail/, "borrowerEmail"],
  [/(borrower|applicant|client|buyer|customer)s?(tele)?phone/, "borrowerPhone"],
  [/(property|subject|premises|collateral)(street)?addr(ess)?(line)?1?$/, "propertyAddress"],
  [/(property|subject|premises)street/, "propertyStreet"],
  [/(property|subject|premises)city/, "propertyCity"],
  [/(property|subject|premises)state/, "propertyState"],
  [/(property|subject|premises)zip/, "propertyZip"],
  [/loan(number|no|num|#)|lenderloan(number|no)|refnumber|reference(number|no)/, "loanNumber"],
  [/loanamount|amountofloan|mortgageamount/, "loanAmount"],
  [/(sales|purchase|contract)price/, "salesPrice"],
  [/(closing|settlement|close|funding)date|dateofclosing|estclosing/, "closingDate"],
  [/(loanofficer|originator|mlo|requester|requestor)s?nmls|individualnmls|lonmls|mlonmls/, "loNmls"],
  [/(company|lender|broker|creditor|firm)s?nmls|nmlsid$/, "companyNmls"],
  [/(loanofficer|originator|mlo|requester|requestor|preparer|preparedby)s?(full)?name|^lo(name)?$/, "loName"],
  [/(loanofficer|originator|mlo|requester|requestor|preparer)s?(tele)?phone/, "loPhone"],
  [/(loanofficer|originator|mlo|requester|requestor|preparer)s?(e)?mail/, "loEmail"],
  [/(lender|broker|creditor|company|requester|requestor)s?(name)?andaddress|(lender|broker|creditor|company)s?address/, "companyAddress"],
  [/(lender|broker|creditor|mortgagee|company)s?name|^lender$|^mortgagee$/, "companyName"],
  [/escrow(company|agent|firm)(name)?|escrowname/, "escrowCompany"],
  [/escrowofficer/, "escrowOfficer"],
  [/titlecompany|titleinsurer|titleagent|titlename/, "titleCompany"],
  [/titleofficer/, "titleOfficer"],
  [/insuranceagent|agentname.*insur|insur.*agent/, "insuranceAgent"],
  [/buyer'?s?agent|sellingagent/, "buyerAgent"],
  [/listingagent|seller'?s?agent/, "listingAgent"],
  [/^(today'?s?)?date(ofrequest|requested)?$|requestdate|daterequested|todaysdate|currentdate/, "today"],
];
/** The borrower's own address, which is the property's only on a refinance. */
const OWN_ADDRESS: [RegExp, FactKey][] = [
  [/^(current)?(street)?addr(ess)?(line)?1?$|^street$|presentaddress|currentaddress|mailingaddress/, "propertyAddress"],
  [/^city$|citystatezip/, "propertyCity"],
  [/^state$/, "propertyState"],
  [/^zip(code)?$|^postal/, "propertyZip"],
];

export type Suggestion = { value: string; from: FactKey | null; sensitive: boolean };

/** What to put in one field, from the file. */
export function suggest(fieldName: string, facts: Facts): Suggestion {
  const n = norm(fieldName);
  if (SENSITIVE_FIELD.test(n)) return { value: "", from: null, sensitive: true };
  const refi = /refi/i.test(facts.purpose);
  for (const [re, key] of [...RULES, ...(refi ? OWN_ADDRESS : [])]) {
    if (!re.test(n)) continue;
    if (key === "propertyCity" && /citystatezip/.test(n)) {
      const v = [facts.propertyCity, [facts.propertyState, facts.propertyZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return { value: v, from: v ? key : null, sensitive: false };
    }
    return { value: facts[key], from: facts[key] ? key : null, sensitive: false };
  }
  return { value: "", from: null, sensitive: false };
}

// ---- Letters written from the file ----

export const LETTER_KINDS = ["title_order", "escrow_open", "payoff_auth", "insurance_request", "hoa_request", "appraisal_transfer", "gift_letter", "loe"] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

export type Letter = { kind: LetterKind; label: string; about: string; to: PartyRole | "borrower"; formKind: FormKind; title: (f: Facts) => string; body: (f: Facts) => string };

const blank = (s: string, what: string) => s || `[${what}]`;
const where = (f: Facts) => blank(f.propertyAddress, "property address");
const sign = (f: Facts) => `${f.loName}${f.loNmls ? `, NMLS ${f.loNmls}` : ""}\n${f.companyName}${f.companyNmls ? `, NMLS ${f.companyNmls}` : ""}\n${[f.loPhone, f.loEmail].filter(Boolean).join(" | ")}`;
const borrowerSigns = (f: Facts) => `\n\n______________________________   Date: ____________\n${blank(f.borrowerName, "borrower's name")}\n\n______________________________   Date: ____________\nCo-borrower (if any)`;

export const LETTERS: Letter[] = [
  {
    kind: "title_order", label: "Title order", about: "Asks the title company to open title and send the commitment and closing protection letter.", to: "title", formKind: "title",
    title: (f) => `Title order: ${where(f)}`,
    body: (f) => `Date: ${f.today}\nTo: ${blank(f.titleCompany, "title company")}${f.titleOfficer ? `, attention ${f.titleOfficer}` : ""}\n\nPlease open title on the property below and send the preliminary title commitment, the closing protection letter, and the vesting and legal description to me.\n\nProperty: ${where(f)}\nBorrower: ${blank(f.borrowerName, "borrower")}\nLoan number: ${blank(f.loanNumber, "loan number")}\nTransaction: ${blank(f.purpose, "purchase or refinance")}\n${f.salesPrice ? `Sales price: ${f.salesPrice}\n` : ""}Loan amount: ${blank(f.loanAmount, "loan amount")}\nLender: ${blank(f.lenderName, "lender, with its mortgagee clause")}\nEscrow: ${blank(f.escrowCompany, "escrow company")}${f.escrowOfficer ? ` (${f.escrowOfficer})` : ""}\nEstimated closing: ${blank(f.closingDate, "closing date")}\n\nPlease show any liens, judgments, unpaid taxes or HOA dues that need to be paid at closing.\n\nThank you,\n${sign(f)}`,
  },
  {
    kind: "escrow_open", label: "Open escrow", about: "Asks escrow to open the file, send the fee estimate, and confirm how wire instructions are verified.", to: "escrow", formKind: "escrow",
    title: (f) => `Request to open escrow: ${where(f)}`,
    body: (f) => `Date: ${f.today}\nTo: ${blank(f.escrowCompany, "escrow company")}${f.escrowOfficer ? `, attention ${f.escrowOfficer}` : ""}\n\nPlease open escrow for the transaction below and send:\n- your estimated escrow and settlement fees for the buyer and the seller;\n- the escrow number and your contact for this file;\n- your closing protection letter request, once the lender is confirmed.\n\nProperty: ${where(f)}\nBorrower: ${blank(f.borrowerName, "borrower")}\nLoan number: ${blank(f.loanNumber, "loan number")}\n${f.salesPrice ? `Sales price: ${f.salesPrice}\n` : ""}Loan amount: ${blank(f.loanAmount, "loan amount")}\nTitle: ${blank(f.titleCompany, "title company")}\nEstimated closing: ${blank(f.closingDate, "closing date")}\n\nWire instructions: our office confirms every set of wire instructions by phone, at a number we already have on file, before anyone sends money. Please tell your borrower the same.\n\nThank you,\n${sign(f)}`,
  },
  {
    kind: "payoff_auth", label: "Payoff authorization", about: "The borrower's signed permission for each lien holder to give escrow a payoff statement.", to: "escrow", formKind: "payoff",
    title: () => "Authorization to release payoff information",
    body: (f) => `Date: ${f.today}\n\nI authorize each lien holder listed below to release a payoff statement and any other information needed to pay off my account to ${blank(f.escrowCompany, "escrow company")}${f.escrowOfficer ? ` (${f.escrowOfficer})` : ""} and to ${f.loName}${f.companyName ? ` of ${f.companyName}` : ""}, for the closing on:\n\nProperty: ${where(f)}\n\nLien holders (I will write each account number myself):\n${(f.payoffs.length ? f.payoffs : ["[lien holder]"]).map((p) => `- ${p}\n  Account number: ______________________`).join("\n")}\n\nA copy of this authorization is as good as the original.${borrowerSigns(f)}`,
  },
  {
    kind: "insurance_request", label: "Homeowner's insurance request", about: "Asks the insurance agent for the binder or evidence of insurance with the lender's mortgagee clause.", to: "insurance", formKind: "insurance",
    title: (f) => `Evidence of insurance: ${where(f)}`,
    body: (f) => `Date: ${f.today}\nTo: ${blank(f.insuranceAgent, "insurance agent")}\n\nOur mutual client ${blank(f.borrowerName, "borrower")} is ${/refi/i.test(f.purpose) ? "refinancing" : "buying"} the property below. Please send the homeowner's insurance binder or evidence of insurance, with:\n- the mortgagee clause: [the lender's mortgagee clause, with "its successors and/or assigns"]\n- the loan number: ${blank(f.loanNumber, "loan number")}\n- coverage at least the loan amount or the replacement cost, as the policy allows;\n- the premium, whether it is paid, and the effective date (on or before ${blank(f.closingDate, "closing date")});\n- the agent's phone number for the lender's verification.\n\nProperty: ${where(f)}\nEscrow: ${blank(f.escrowCompany, "escrow company")}${f.escrowEmail ? ` (${f.escrowEmail})` : ""}\n\nThank you,\n${sign(f)}`,
  },
  {
    kind: "hoa_request", label: "HOA or condo questionnaire request", about: "Asks for the HOA's questionnaire, budget and insurance, through escrow or the management company.", to: "escrow", formKind: "hoa",
    title: (f) => `HOA documents request: ${where(f)}`,
    body: (f) => `Date: ${f.today}\n\nFor the loan on ${where(f)} (borrower ${blank(f.borrowerName, "borrower")}, loan number ${blank(f.loanNumber, "loan number")}), please request from the homeowners' association or its management company:\n- the lender's condo or HOA questionnaire (the lender's form, attached if provided);\n- the current budget and the most recent balance sheet;\n- the master insurance certificate, naming the lender with its mortgagee clause;\n- a statement of any special assessments or pending litigation;\n- the monthly dues and any transfer fees.\n\nPlease send them to me and to escrow${f.escrowEmail ? ` (${f.escrowEmail})` : ""} before ${blank(f.closingDate, "closing date")}.\n\nThank you,\n${sign(f)}`,
  },
  {
    kind: "appraisal_transfer", label: "Appraisal transfer request", about: "Asks a prior lender to release the appraisal to the new lender.", to: "lender", formKind: "lender",
    title: (f) => `Appraisal transfer request: ${where(f)}`,
    body: (f) => `Date: ${f.today}\nTo: [the lender that ordered the appraisal]\n\nOur mutual client ${blank(f.borrowerName, "borrower")} has asked that the appraisal on the property below be transferred to ${blank(f.lenderName, "the new lender")}. Please send the appraisal report, the invoice showing it was paid, and a signed transfer letter that releases it to the new lender.\n\nProperty: ${where(f)}\nAppraisal effective date: [date]\nAppraiser: [name and license]\nYour loan number: [their loan number]\n\nThe borrower's signed request is below.\n\nThank you,\n${sign(f)}\n\nI ask that my appraisal be transferred as described above.${borrowerSigns(f)}`,
  },
  {
    kind: "gift_letter", label: "Gift letter", about: "For a donor and the borrower to sign: the amount, the relationship, and that it isn't a loan. Check the lender's own gift letter first.", to: "borrower", formKind: "borrower_letter",
    title: () => "Gift letter",
    body: (f) => `Date: ${f.today}\n\nI (we), [donor's full name], am (are) giving a gift of $[amount] to ${blank(f.borrowerName, "borrower")}, my (our) [relationship], for the ${/refi/i.test(f.purpose) ? "refinance" : "purchase"} of the property at ${where(f)}.\n\nThis is a gift. It does not have to be paid back, now or later, in money or in services. No one with an interest in the sale of the property gave me (us) the money.\n\nThe gift [has been / will be] given on [date], from [bank name] (account number written by the donor: ______________), [to the borrower / directly to escrow at closing].\n\nDonor's address: [address]\nDonor's phone: [phone]\n\n______________________________   Date: ____________\nDonor\n\n______________________________   Date: ____________\nDonor (if two)\n\nI received this gift and confirm the above.${borrowerSigns(f)}`,
  },
  {
    kind: "loe", label: "Letter of explanation", about: "A plain template for the borrower to explain something the lender asked about, in their own words.", to: "borrower", formKind: "borrower_letter",
    title: () => "Letter of explanation",
    body: (f) => `Date: ${f.today}\nRe: Loan number ${blank(f.loanNumber, "loan number")}, ${where(f)}\n\nTo the lender:\n\nYou asked me to explain [what the lender asked about, for example a credit inquiry, a large deposit, or a gap in employment].\n\n[In your own words: what happened, when, and why. Keep it short and factual.]${borrowerSigns(f)}`,
  },
];

export const letterByKind = (k: string) => LETTERS.find((l) => l.kind === k) ?? null;
