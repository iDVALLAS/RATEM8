/**
 * lib/expenses/categories.ts — expense categories for a self-employed
 * (1099) loan officer, each on its Schedule C line (D37). Pure.
 *
 * The CPA makes the final call on every line; this is an organizer, not
 * tax advice. Line 10 is left out on purpose: a loan officer can't pay
 * anyone for referring loans (RESPA section 8).
 */
export const CATEGORIES = {
  advertising: { line: "8", label: "Advertising and marketing", hint: "Ads, postcards, flyers, sponsorships, your website, signs" },
  car: { line: "9", label: "Car (business miles)", hint: "Miles to appraisals, closings, open houses, agent meetings" },
  contract_labor: { line: "11", label: "Contract labor", hint: "A virtual assistant or freelancer you paid (they may need a 1099-NEC)" },
  insurance: { line: "15", label: "Business insurance", hint: "E&O, general liability (not health insurance)" },
  legal_professional: { line: "17", label: "Legal and professional", hint: "Your CPA, an attorney, a bookkeeper" },
  office: { line: "18", label: "Office expense", hint: "Postage, printer ink, small office items" },
  rent: { line: "20b", label: "Office or desk rent", hint: "A shared office or desk (not your home)" },
  supplies: { line: "22", label: "Supplies", hint: "Business cards, folders, closing supplies" },
  taxes_licenses: { line: "23", label: "Taxes and licenses", hint: "NMLS and state license renewals, background checks, credit report for licensing, business license (not income tax)" },
  travel: { line: "24a", label: "Travel", hint: "Overnight business trips: flights, hotels, rideshare" },
  meals: { line: "24b", label: "Business meals", hint: "Meals with agents, clients or referral partners (50% deductible)" },
  utilities: { line: "25", label: "Phone and internet", hint: "The business share of your phone and internet" },
  software: { line: "27a", label: "Software and subscriptions", hint: "CRM, e-signature, pricing tools, LoanM8 membership" },
  education: { line: "27a", label: "Continuing education", hint: "NMLS CE, courses, books, conferences" },
  dues: { line: "27a", label: "Dues and memberships", hint: "Association dues, networking groups" },
  gifts: { line: "27a", label: "Client gifts", hint: "Closing gifts (up to $25 per person per year counts)" },
  bank_fees: { line: "27a", label: "Bank and card fees", hint: "Business account and card fees" },
  other: { line: "27a", label: "Other business expense", hint: "Anything else; say what it was" },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

/** Schedule C Part II line names, for the report. */
export const LINE_NAMES: Record<string, string> = {
  "8": "Advertising",
  "9": "Car and truck expenses",
  "11": "Contract labor",
  "15": "Insurance (other than health)",
  "17": "Legal and professional services",
  "18": "Office expense",
  "20b": "Rent or lease: other business property",
  "22": "Supplies",
  "23": "Taxes and licenses",
  "24a": "Travel",
  "24b": "Deductible meals",
  "25": "Utilities",
  "27a": "Other expenses (Part V)",
  "30": "Business use of home (simplified method)",
};

/** Schedule C order (an object's number-like keys would sort ahead of "20b" and "24a"). */
export const LINE_ORDER = ["8", "9", "11", "15", "17", "18", "20b", "22", "23", "24a", "24b", "25", "27a", "30"];

/** Words that suggest a category, for the no-AI path. First match wins. */
export const KEYWORDS: [RegExp, Category][] = [
  [/\b(mile|miles|mi)\b|drove|drive to/i, "car"],
  [/\b(lunch|dinner|breakfast|coffee|meal|drinks|happy hour)\b/i, "meals"],
  [/\b(gift|basket|closing gift|wine for)\b/i, "gifts"],
  [/\b(nmls|license|licensing|renewal|background check|fingerprint)\b/i, "taxes_licenses"],
  [/\b(ce|continuing ed\w*|course|class|conference|seminar|book)\b/i, "education"],
  [/\b(e&o|e and o|errors and omissions|liability insurance|insurance)\b/i, "insurance"],
  [/\b(cpa|accountant|attorney|lawyer|bookkeep\w*)\b/i, "legal_professional"],
  // D83: the lead vendors too (their spend is tagged with the source).
  [/\b(ads?|advertis\w*|facebook|instagram|meta|google ads|adwords|zillow|lending ?tree|bankrate|lower ?my ?bills|leads?|postcards?|flyers?|mailer|sponsor\w*|signs?|website|domain)\b/i, "advertising"],
  [/\b(crm|software|subscription|app|docusign|canva|loanm8|bonzo|zoom|adobe)\b/i, "software"],
  [/\b(phone|cell|internet|wifi)\b/i, "utilities"],
  [/\b(hotel|flight|airfare|uber|lyft|rideshare|parking|toll)\b/i, "travel"],
  [/\b(dues|association|chamber|bni|networking group)\b/i, "dues"],
  [/\b(virtual assistant|va\b|freelanc\w*|contractor|upwork|fiverr)\b/i, "contract_labor"],
  [/\b(desk rent|office rent|cowork\w*|wework)\b/i, "rent"],
  [/\b(postage|stamps|ink|toner|printer)\b/i, "office"],
  [/\b(business cards?|folders?|supplies)\b/i, "supplies"],
  [/\b(bank fee|card fee|monthly fee)\b/i, "bank_fees"],
];

export function guessCategory(text: string): Category {
  for (const [re, c] of KEYWORDS) if (re.test(text)) return c;
  return "other";
}
