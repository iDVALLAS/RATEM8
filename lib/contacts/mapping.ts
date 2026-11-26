/**
 * lib/contacts/mapping.ts — matching a CSV's columns to contact fields, and
 * turning rows into clean records (D2). Client-safe and pure.
 *
 * Two kinds of import: "contacts" (past clients, sphere, leads: exports
 * from Bonzo, Total Expert, Jungo, Salesforce, Google, Outlook, Excel) and
 * "agents" (RETR exports, or any agent list).
 */
import { cleanEmail, cleanState, dateProblem, emailProblem, isoDate, isPlaceholder, isPlaceholderEmail, isPlaceholderPhone, phoneProblem, splitName, stateFromZip, toE164, type DateOrder, type NameOrder } from "./normalize";
import { AGENT_TAG, MAX_TAG, MAX_TAGS, mergeTags, splitTags, withExtraTags } from "./tags";
import type { Csv } from "./csv";
import { anyLoan, readLender, readMargin, readOccupancy, readProgram, readPropertyType, readPurpose, readRateType, readTerm, type LoanDetails } from "./loan";

export type ImportKind = "contacts" | "agents";

export const CONTACT_FIELDS = {
  fullName: "Full name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Mobile or main phone",
  phone2: "Other phone",
  street: "Street address",
  city: "City",
  state: "State",
  zip: "ZIP",
  relationship: "Relationship (past client, lead…)",
  // D74: where a lead came from, and who sent them.
  leadSource: "Lead source",
  referredBy: "Referred by",
  // D93: a co-borrower or spouse, saved on the borrower's contact. Information only: never texted, called or emailed.
  coFirstName: "Co-borrower first name",
  coLastName: "Co-borrower last name",
  coFullName: "Co-borrower name",
  coPhone: "Co-borrower phone",
  coEmail: "Co-borrower email",
  tags: "Tags",
  notes: "Notes",
  closedOn: "Loan closed on",
  // D83: when they applied (or came in as a lead); dates an imported lead (owner decision 5).
  appliedOn: "Application date",
  loanAmount: "Loan amount",
  noteRate: "Note rate",
  // D80: more about their loan, so lists can find it ("ARM loans", "FHA and VA").
  loanProgram: "Loan type or program",
  rateType: "Fixed or ARM",
  termMonths: "Loan term",
  armFirstChange: "ARM first change date",
  armMargin: "ARM margin",
  loanPurpose: "Loan purpose",
  occupancy: "Occupancy",
  propertyType: "Property type",
  lender: "Lender or investor",
  // D69: opt-outs come before opt-ins. A "yes" here is a revocation and always wins.
  optOutText: "Opted out of texts (yes/no)",
  optOutCall: "Opted out of calls (yes/no)",
  optOutEmail: "Opted out of email (yes/no)",
  doNotContact: "Do not contact (yes/no)",
  optInText: "Opted in to texts (yes/no)",
  optInCall: "Opted in to calls (yes/no)",
  optInEmail: "Opted in to email (yes/no)",
} as const;

export const AGENT_FIELDS = {
  fullName: "Agent name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  brokerage: "Brokerage",
  city: "City",
  state: "State",
  zip: "ZIP",
  units: "Total units (12 months)",
  volume: "Total volume (12 months)",
  buyerUnits: "Buyer-side units",
  listingUnits: "Listing-side units",
  avgPrice: "Average price",
  topLender: "Lender or loan officer used most",
  notes: "Notes",
  // D69: agent lists can carry opt-outs too, and they're honored the same way.
  optOutText: "Opted out of texts (yes/no)",
  optOutCall: "Opted out of calls (yes/no)",
  optOutEmail: "Opted out of email (yes/no)",
  doNotContact: "Do not contact (yes/no)",
} as const;

export type Field = keyof typeof CONTACT_FIELDS | keyof typeof AGENT_FIELDS;
export type Mapping = Partial<Record<Field, number>>;

/**
 * D69: a header with any of these words is an opt-out column. It may only
 * feed an opt-out field, never an opt-in (or anything else): "SMS Opt Out"
 * once read as permission to text.
 */
export const OPT_OUT_HEADER = /opt(ed)?.?out|unsub|do.?not|dnd|dnc|stop|revok/i;
export const OPT_OUT_FIELDS = ["optOutText", "optOutCall", "optOutEmail", "doNotContact"] as const;
export type OptOutField = (typeof OPT_OUT_FIELDS)[number];
/**
 * D80 (fair lending): a column about a protected trait, or a close proxy, is
 * never imported, offered as a field, a note or a tag, or used in a list:
 * age, birth date, race, ethnicity, sex or gender, marital or familial
 * status, national origin or citizenship, religion, disability, language.
 */
export const PROTECTED_HEADER = /\b(ages?|aged|birth\w*|born|dob|race|racial|ethnic\w*|hispanic|latin[oax]|gender|sex|male|female|marital|married|spouse.?status|famil(y|ial).?(status|size)|children|kids|dependents?|religio\w*|national.?origin|nationality|citizenship|immigration|disabilit\w*|handicap\w*|language|hmda)\b/i;
/** Social Security numbers, birth dates, account numbers, credit scores, passwords: never imported, never sent (D74). */
export const SENSITIVE_HEADER = /\b(ssn|ss#|social security|soc\.? ?sec|tax ?id|tin|dob|date of birth|birth ?date|birthday|account ?(number|no|num|#)|acct|routing|credit ?score|fico|password|pin)\b/i;
/** D93: the words that name a second borrower ("Co-Borrower", "CoBorrower", "Spouse", "Borrower 2", "Co-Applicant"). */
const CO_WORD = "co[\\s_.-]?borrower|\\bspouse|\\bborrower ?(?:2|two|#2)\\b|\\b(?:2nd|second) borrower|co[\\s_.-]?applicant|co[\\s_.-]?buyer|co[\\s_.-]?signer";
/** D69: a second borrower's details never fill the person's own name, phone or email (D93: they go to the co-borrower). */
export const CO_BORROWER = new RegExp(CO_WORD, "i");
const PERSON_FIELDS = new Set<Field>(["firstName", "lastName", "fullName", "email", "phone", "phone2"]);
export const CO_FIELDS = ["coFirstName", "coLastName", "coFullName", "coPhone", "coEmail"] as const;
/** D93: a co-borrower on the borrower's contact. Information only: the send gate never reads it. */
export type CoBorrower = { firstName: string; lastName: string; phone: string | null; email: string | null };

const TEXT_WORDS = /sms|text/;
const CALL_WORDS = /call|phone|voice/;
const EMAIL_WORDS = /e-?mail/;

/** Header words that point to each field, most specific first. */
const SYNONYMS: [Field, RegExp][] = [
  ["optOutText", /(sms|text).*(opt(ed)?.?out|unsub|stop|revok)|(opt(ed)?.?out|unsub|stop|revok|do.?not).*(sms|text)/],
  ["optOutCall", /(call|phone|voice).*(opt(ed)?.?out|stop|revok)|(opt(ed)?.?out|stop|revok|do.?not).*(call|phone|voice)/],
  ["optOutEmail", /e-?mail.*(opt(ed)?.?out|unsub|stop|revok)|(opt(ed)?.?out|unsub|stop|revok|do.?not).*e-?mail/],
  ["doNotContact", /opt(ed)?.?out|unsub|do.?not|dnd|dnc|stop|revok/],
  ["optInText", /(sms|text).*(opt(?!(ed)?.?out)|consent|permission)|(opt(?!(ed)?.?out)|consent).*(sms|text)/],
  ["optInCall", /(call|phone|voice).*(opt(?!(ed)?.?out)|consent|permission)|(opt(?!(ed)?.?out)|consent).*(call|phone)/],
  ["optInEmail", /e-?mail.*(opt(?!(ed)?.?out)|consent|permission)|(opt(?!(ed)?.?out)|consent).*e-?mail/],
  // D93: a co-borrower's or spouse's columns, before the person's own name, phone and email.
  ["coFirstName", new RegExp(`(${CO_WORD}).*\\b(first|given|fname)\\b|\\b(first|given)\\b.*(${CO_WORD})`)],
  ["coLastName", new RegExp(`(${CO_WORD}).*\\b(last|surname|lname)\\b|\\b(last|surname)\\b.*(${CO_WORD})`)],
  ["coEmail", new RegExp(`(${CO_WORD}).*e-?mail|e-?mail.*(${CO_WORD})`)],
  ["coPhone", new RegExp(`(${CO_WORD}).*(phone|mobile|cell|tel)|(phone|mobile|cell)\\b.*(${CO_WORD})`)],
  ["coFullName", new RegExp(`^(${CO_WORD})('?s)?( (full )?name)?$|^(full )?name.*(${CO_WORD})\\)?$`)],
  // D93: one column with "Last, First" names (the order is read from the header).
  ["fullName", /^last( name)?\s*[,/&]?\s*first( name)?$|^name\s*\(last,? first\)$|^(borrower|client|customer|contact|primary)'?s? (full )?name$/],
  ["buyerUnits", /buy(er)?.*(side|units|sides|transactions)/],
  ["listingUnits", /(list|listing|sell(er)?).*(side|units|sides|transactions)/],
  ["units", /^(total )?(units|transactions|sides|closed units)|units.*(12|ttm|year)/],
  ["volume", /volume|sales total|\$ ?volume/],
  ["avgPrice", /av(era)?g.*price/],
  ["topLender", /(top |most used |preferred )?(lender|loan officer|mlo)/],
  ["brokerage", /brokerage|office|company|firm/],
  ["leadSource", /^(lead )?source$|lead.?source|referral.?source|^(lead )?origin$/],
  ["referredBy", /referred.?by|^referr(al|er)( name)?$|^referred$/],
  // D80: an ARM's change date ("First Change Date") before first names and the closing date.
  ["armFirstChange", /(first|initial|next).*(change|adjust|reset)|(change|adjust|reset).*date|arm.*(change|reset|adjust)/],
  ["firstName", /^(first|given|fname|first name|contact first name)|first.?name|^(borrower|client|customer|contact|primary|buyer)'?s? (first|given)$/],
  ["lastName", /^(last|surname|family|lname)|last.?name|^(borrower|client|customer|contact|primary|buyer)'?s? (last|surname)$/],
  ["fullName", /^(name|full name|contact name|agent name|agent|client|borrower)$|full.?name/],
  ["email", /e-?mail/],
  ["phone2", /(home|work|office|other|secondary|alt).*phone|phone ?2/],
  ["phone", /mobile|cell|phone|tel/],
  ["street", /street|address( ?1| line 1)?$|^address/],
  ["city", /^city|town/],
  ["state", /^state|province|^st$/],
  ["zip", /zip|postal/],
  // D74: a bare "Stage" / "Pipeline stage" column goes to notes for now (the stage board comes later).
  ["relationship", /relationship|contact type|lead type|client type|category|lifecycle|^type$|^status$|^(contact )?role$/],
  ["tags", /^(tags?|labels?|groups?|lists?)$|\btags?\b/],
  ["appliedOn", /^app(l|lication)?\.? ?date$|appl(ication|ied).*(date|on)|date.*appl(ication|ied)|^applied$|^lead ?date$|^date (received|of inquiry)$|^inquiry date$/],
  ["closedOn", /(close|closing|funded|fund).*date|date.*(closed|funded)|closed on/],
  ["loanAmount", /loan.*amount|^amount$/],
  ["armMargin", /margin/],
  ["termMonths", /\bterm\b|^(months|years)$/],
  ["rateType", /amorti[sz]ation|rate.?type|fixed.?(or|\/|&).?(arm|adj)|arm.?(or|\/|&).?fixed|^arm$|fixed.?vs/],
  ["noteRate", /^(note |interest )?rate$|note rate|interest rate/],
  ["loanProgram", /^(loan )?(program|product)( name| type)?$|loan.?(program|product|type)|mortgage.?(type|program|product)|^product/],
  ["loanPurpose", /purpose|transaction.?type|loan.?reason|refi.?(or|\/).?purch|purch.?(or|\/).?refi/],
  ["occupancy", /occupan|occupied|property.?use/],
  ["propertyType", /property.?type|dwelling|home.?type|prop.?type/],
  ["lender", /^(lender|investor)( name)?$|wholesale.?lender|investor.?name|^lender\b|funding.?lender/],
  ["notes", /notes?|comments?|memo/],
];

/** Whether a column with this header may feed this field at all (D69 rules, before any pattern). */
export function headerAllowed(field: Field, header: string): boolean {
  const h = header.trim().toLowerCase();
  // D80: a protected trait never feeds any field. D93: nor does private data ("Co-Borrower SSN").
  if (PROTECTED_HEADER.test(h) || SENSITIVE_HEADER.test(h)) return false;
  const optOut = OPT_OUT_HEADER.test(h);
  if ((OPT_OUT_FIELDS as readonly string[]).includes(field)) return optOut;
  if (optOut) return false;
  if (PERSON_FIELDS.has(field) && CO_BORROWER.test(h)) return false;
  return true;
}

/** Which opt-out field an opt-out header belongs to: a channel when it names one, else every channel. */
export function optOutFieldOf(header: string): OptOutField | null {
  const h = header.trim().toLowerCase();
  if (!OPT_OUT_HEADER.test(h)) return null;
  const text = TEXT_WORDS.test(h);
  const call = CALL_WORDS.test(h);
  const email = EMAIL_WORDS.test(h);
  if (text && !call && !email) return "optOutText";
  if (call && !text && !email) return "optOutCall";
  if (email && !text && !call) return "optOutEmail";
  return "doNotContact";
}

/**
 * D69: applied after any matching (by names, by contents, by M8 or by hand).
 * Drops a match that feeds an opt-out column into anything but an opt-out
 * field, and gives every unmatched opt-out column its opt-out field when
 * that field is free.
 */
export function guardOptOuts(headers: string[], mapping: Mapping): Mapping {
  const m: Mapping = {};
  for (const [f, col] of Object.entries(mapping) as [Field, number | undefined][]) {
    if (col === undefined || col < 0 || col >= headers.length) continue;
    if (headerAllowed(f, headers[col])) m[f] = col;
  }
  const used = new Set(Object.values(m));
  headers.forEach((h, i) => {
    const f = optOutFieldOf(h);
    if (!f || used.has(i)) return;
    const field: OptOutField = m[f] === undefined ? f : "doNotContact";
    if (m[field] !== undefined) return;
    m[field] = i;
    used.add(i);
  });
  return m;
}

export function fieldsFor(kind: ImportKind): Record<string, string> {
  return kind === "agents" ? AGENT_FIELDS : CONTACT_FIELDS;
}

/** Best guess at which column feeds each field. Each column is used once. */
export function autoMap(headers: string[], kind: ImportKind): Mapping {
  const allowed = new Set(Object.keys(fieldsFor(kind)));
  const used = new Set<number>();
  const m: Mapping = {};
  for (const [field, re] of SYNONYMS) {
    if (!allowed.has(field) || m[field] !== undefined) continue;
    const i = headers.findIndex((h, idx) => !used.has(idx) && headerAllowed(field, h) && re.test(h.trim().toLowerCase()));
    if (i >= 0) {
      m[field] = i;
      used.add(i);
    }
  }
  return guardOptOuts(headers, m);
}

export type ConsentChannel = "text" | "call" | "email";

export type ImportRecord = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  relationship: string;
  tags: string[];
  notes: string | null;
  /** D74: "Zillow", "Open house"…, and who referred them. */
  leadSource?: string | null;
  referredBy?: string | null;
  /**
   * D93: a co-borrower or spouse from the same row (their own columns, or "John & Jane Smith").
   * Saved on this contact as information only; nothing is ever sent to them from here, and no
   * consent carries to them from the borrower.
   */
  coBorrower?: CoBorrower | null;
  /** D80: plus program, fixed or ARM, term, purpose, occupancy, property type, lender and the ARM's change date and margin. */
  loan: LoanDetails | null;
  agent: { brokerage: string | null; units: number | null; volume: number | null; buyerUnits: number | null; listingUnits: number | null; avgPrice: number | null; topLender: string | null } | null;
  /** Channels a column said "yes" to. Recorded as the loan officer's attestation, not proof. */
  attestedOptIns: ConsentChannel[];
  /**
   * D69: channels the file says this person opted out of, each with where it
   * came from ("<file> column <header>"). Recorded as a revocation; it always
   * wins over an opt-in. "text" or "call" stops every phone channel.
   */
  optOuts?: Partial<Record<ConsentChannel, string>>;
  /** D75: the file (or files, when merged) this person came from, for `contact.source` and the opt-in proof. */
  sourceFile?: string;
  /** D75: the row in that file (the browser's merge review; never sent). */
  sourceRow?: number;
  /** D75: the loan officer's pick for someone like a person already in the book: that contact's id, or "new". */
  matchTo?: string;
};

/**
 * A row that couldn't be imported (no phone or email we could read). D74:
 * `name` and `cells` are for the Skipped list and its download, in the
 * browser only; they're never sent anywhere.
 */
export type RowProblem = { row: number; reason: string; name?: string; cells?: string[] };

/** D74: a field a value can be fixed in from the "Needs a look" list. `name` is the person's whole name. */
export const FIX_FIELDS = ["name", "phone", "phone2", "email", "state", "zip", "closedOn", "tags"] as const;
export type FixField = (typeof FIX_FIELDS)[number];
/**
 * D74: per row (0-based index into the file's rows), the value the loan officer typed instead of the file's. "" = leave it blank.
 * D93.1: a shifted row's values can also be moved into City or Street, and `note` adds lines to the person's notes
 * (a value kept "as written" rather than in a box).
 */
export type RowFixKey = FixField | "city" | "street" | "note";
export type RowFixes = Record<number, Partial<Record<RowFixKey, string>>>;
export type WarningCode = "name_missing" | "phone" | "email" | "state" | "zip" | "date" | "tags";

/**
 * D74: a value that was read as blank, or changed, and is shown in "Needs a
 * look": which row (`row` as numbered in the file, `at` 0-based), which
 * field, the value as written, and why, in plain words.
 */
export type RowWarning = { row: number; at: number; field: FixField; code: WarningCode; raw: string; reason: string; name: string; keep?: string };

/** D74: the build's answers from the review: how to read dates and names, extra columns, consent values, fixes. */
export type BuildOptions = {
  defaultRelationship?: string | null;
  firstRow?: number;
  fileName?: string;
  extraTags?: readonly string[];
  /** Day-first or month-first for numeric dates (default month first). */
  dateOrder?: DateOrder;
  /** How a one-column name without a comma is written (default First Last). */
  nameOrder?: NameOrder;
  /** Columns matched to no field: added to notes as "Header: value", or made into tags. */
  columns?: { notes?: readonly number[]; tags?: readonly number[] };
  /** The loan officer's reading of an opt-in column's values (lowercased value → yes or no; "*" = any other value). */
  consent?: Partial<Record<"optInText" | "optInCall" | "optInEmail", Record<string, boolean>>>;
  fixes?: RowFixes;
  /**
   * D93: a mixed import (clients and agents ticked): which rows (0-based) are
   * agents. An agent row is filed under Agents with the Agent tag, no loan,
   * no co-borrower and no opt-ins (opt-outs still count).
   */
  agentRows?: ReadonlySet<number>;
  /** D93: the column an agent row's brokerage comes from. */
  brokerageCol?: number;
};

/**
 * D93: two people in one name cell ("John & Jane Smith", "Smith, John and
 * Jane", "John Smith & Jane Doe"): the first is the borrower, the second the
 * co-borrower. Null when the cell holds one person.
 */
export function splitCouple(raw: string): { main: string; co: string } | null {
  const s = raw.trim().replace(/\s+/g, " ");
  const comma = /^([^,&]+),\s*([^\s,&]+)\s+(?:&|and|\+)\s+([^\s,&]+)$/i.exec(s);
  if (comma) return { main: `${comma[1]}, ${comma[2]}`, co: `${comma[1]}, ${comma[3]}` };
  const shared = /^([^\s,&]+)\s+(?:&|and|\+)\s+([^\s,&]+)\s+([^,&]+)$/i.exec(s);
  if (shared) return { main: `${shared[1]} ${shared[3]}`, co: `${shared[2]} ${shared[3]}` };
  const two = /^([^,&]+\s[^,&]+?)\s+(?:&|and|\+)\s+([^,&]+\s[^,&]+)$/i.exec(s);
  if (two) return { main: two[1], co: two[2] };
  return null;
}

export { MAX_TAG, MAX_TAGS } from "./tags";

const num = (s: string | undefined): number | null => {
  const v = Number((s ?? "").replace(/[$,%\s]/g, ""));
  return (s ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
};
/** An opt-in cell that plainly says yes. */
export const YES_VALUE = /^(y|yes|true|1|opted ?in|subscribed)$/i;
/** An opt-in cell that plainly says no (blank counts as no). */
export const NO_VALUE = /^(n|no|false|0|none|-|n\/a|opted ?out|unsubscribed|off)$/i;
/**
 * D69: an opt-out cell counts unless it plainly says no. A date, "x" or
 * "Opted out" in an opt-out column all mean they asked to stop.
 */
export const readsOptOut = (s: string | undefined) => {
  const v = (s ?? "").trim();
  return v !== "" && !/^(n|no|false|0|none|-|n\/a|opted ?in|subscribed|active|ok)$/i.test(v);
};
/** D74: how an opt-in cell reads before the loan officer answers: yes, no, or "?" (they decide). */
export function readOptIn(raw: string | undefined, answers?: Record<string, boolean>): "yes" | "no" | "unknown" {
  const v = (raw ?? "").trim();
  const own = answers?.[v.toLowerCase()];
  if (own !== undefined) return own ? "yes" : "no";
  if (!v || NO_VALUE.test(v)) return "no";
  if (YES_VALUE.test(v)) return "yes";
  const other = answers?.["*"];
  return other === undefined ? "unknown" : other ? "yes" : "no";
}
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const splitCell = (v: string) => v.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);

const RELATIONSHIPS: [RegExp, string][] = [
  [/past|closed|funded|client|customer|borrower/i, "past_client"],
  [/lead|prospect|inquiry|new/i, "lead"],
  [/sphere|friend|family|soi|personal/i, "sphere"],
  [/agent|realtor|partner/i, "agent"],
];

export function relationshipOf(raw: string | undefined, kind: ImportKind): string {
  if (kind === "agents") return "agent";
  const s = (raw ?? "").trim();
  return RELATIONSHIPS.find(([re]) => re.test(s))?.[1] ?? "other";
}

export const RELATIONSHIP_LABELS: Record<string, string> = { past_client: "Past client", lead: "Lead", sphere: "Sphere", agent: "Agent", other: "Other" };

/**
 * Turns mapped rows into records. Rows with no phone or email we could read
 * are skipped with a reason; values that couldn't be read (a phone, an
 * email, a state, a ZIP, a date) are left blank and listed in `warnings`
 * (D74: with the field and the value as written, for "Needs a look"), and
 * the value as written is kept in their notes so nothing is lost. A row with
 * a phone or email but no name is kept as "(no name)" with a warning.
 */
export function buildRecords(csv: Csv, mapping: Mapping, kind: ImportKind, opts: BuildOptions = {}): { records: ImportRecord[]; problems: RowProblem[]; warnings: RowWarning[]; placeholders: number } {
  const rowNo = (i: number) => i + (opts.firstRow ?? 2);
  const records: ImportRecord[] = [];
  const problems: RowProblem[] = [];
  const warnings: RowWarning[] = [];
  // D93: placeholder phones and emails read as blank (they'd have needed a look before).
  let placeholders = 0;
  // D69: a column may only feed a field its header allows (an opt-out column never feeds an opt-in).
  const safe = guardOptOuts(csv.headers, mapping);
  const used = new Set(Object.values(safe));
  // D74: extra columns never repeat a matched one, and an opt-out column is never a note or a tag.
  const extraCols = (cols: readonly number[] | undefined) => (cols ?? []).filter((c) => c >= 0 && c < csv.headers.length && !used.has(c) && !OPT_OUT_HEADER.test(csv.headers[c] ?? "") && !PROTECTED_HEADER.test(csv.headers[c] ?? ""));
  const noteCols = extraCols(opts.columns?.notes);
  const tagCols = extraCols(opts.columns?.tags).filter((c) => !noteCols.includes(c));
  const header = (f: Field) => (safe[f] !== undefined ? (csv.headers[safe[f]!] ?? "").trim() : "");
  // D73: the tags the loan officer picked for the whole import and for this list, on every row.
  const extra = mergeTags(opts.extraTags ?? []);
  const whereFrom = (f: OptOutField) => `${(opts.fileName ?? "file").slice(0, 100)} column ${header(f).slice(0, 60)}`;
  const label = (f: Field) => header(f) || (CONTACT_FIELDS as Record<string, string>)[f] || f;
  csv.rows.forEach((row, i) => {
    const fix = opts.fixes?.[i];
    const cell = (f: Field) => (safe[f] !== undefined ? (row[safe[f]!] ?? "").trim() : "");
    // D74: a value the loan officer typed in "Needs a look" replaces the file's.
    const get = (f: Field, as?: FixField) => {
      const k = as ?? (f as RowFixKey);
      return fix && k in fix ? (fix[k] ?? "").trim() : cell(f);
    };
    const isAgentRow = kind === "contacts" && !!opts.agentRows?.has(i);
    const hasCoColumns = CO_FIELDS.some((f) => safe[f] !== undefined);
    let first = "";
    let last = "";
    // D93: "John & Jane Smith" in one name cell is two people when the file has no co-borrower columns.
    let coFromName: [string, string] | null = null;
    if (fix && "name" in fix) [first, last] = splitName(fix.name);
    else {
      first = cell("firstName");
      last = cell("lastName");
      if (!first && !last) {
        const full = cell("fullName");
        const couple = !hasCoColumns && !isAgentRow ? splitCouple(full) : null;
        [first, last] = splitName(couple ? couple.main : full, opts.nameOrder);
        if (couple) coFromName = splitName(couple.co, opts.nameOrder);
      } else if (!last && first.includes(",")) [first, last] = splitName(first);
      else if (!hasCoColumns && !isAgentRow && last) {
        const pair = /^(\S+)\s+(?:&|and|\+)\s+(\S+)$/i.exec(first);
        if (pair) {
          first = pair[1];
          coFromName = [pair[2], last];
        }
      }
    }
    const display = `${first} ${last}`.trim() || "(no name)";
    const asWritten: string[] = [];
    const warn = (field: FixField, code: WarningCode, raw: string, reason: string, keep?: Field) => {
      warnings.push({ row: rowNo(i), at: i, field, code, raw, reason, name: display });
      if (keep && raw) asWritten.push(`${label(keep)} (as written): ${raw.slice(0, 120)}`);
    };
    // D74: "Keep them shortened" writes the tags that fit, so the warning goes.
    const keepTags = (kept: string[]) => {
      const w = warnings[warnings.length - 1];
      if (w && w.at === i && w.field === "tags") w.keep = kept.join("; ");
    };
    const rawEmail = get("email");
    const rawPhone = get("phone");
    const rawPhone2 = get("phone2");
    // D93: a placeholder ("111-111-1111", "123-456-7890", "none@none.com") is read as blank and kept in notes as written; it doesn't need a look.
    const placeholder = (f: "phone" | "phone2" | "email", raw: string) => {
      const ph = !!raw && (f === "email" ? isPlaceholderEmail(raw) : isPlaceholderPhone(raw));
      if (ph && !isPlaceholder(raw)) {
        asWritten.push(`${label(f)} (as written): ${raw.slice(0, 120)}`);
        placeholders++;
      }
      return ph;
    };
    const email = placeholder("email", rawEmail) ? null : cleanEmail(rawEmail);
    const phone = placeholder("phone", rawPhone) ? null : toE164(rawPhone);
    const phone2 = placeholder("phone2", rawPhone2) ? null : toE164(rawPhone2);
    if (!email && !phone && !phone2) {
      return problems.push({ row: rowNo(i), reason: "no valid phone or email", name: display, cells: row });
    }
    if (rawPhone && !phone && !isPlaceholderPhone(rawPhone)) warn("phone", "phone", rawPhone, phoneProblem(rawPhone), "phone");
    if (rawPhone2 && !phone2 && !isPlaceholderPhone(rawPhone2)) warn("phone2", "phone", rawPhone2, phoneProblem(rawPhone2), "phone2");
    if (rawEmail && !email && !isPlaceholderEmail(rawEmail)) warn("email", "email", rawEmail, emailProblem(rawEmail), "email");
    if (!first && !last && !(fix && "name" in fix)) warn("name", "name_missing", "", "Needs a name");
    const rawZip = get("zip");
    const zip = ZIP_RE.test(rawZip) ? rawZip : null;
    if (rawZip && !zip && !isPlaceholder(rawZip)) warn("zip", "zip", rawZip, "isn't a 5-digit ZIP", "zip");
    const rawState = get("state");
    const cleanSt = cleanState(rawState);
    if (rawState && !cleanSt && !isPlaceholder(rawState)) warn("state", "state", rawState, "isn't a US state we know", "state");
    const state = cleanSt ?? stateFromZip(zip ?? undefined);
    const rawTags = splitTags(get("tags"));
    // D74: a column the loan officer made into tags adds each value (split on ; , |).
    for (const c of tagCols) rawTags.push(...splitCell((row[c] ?? "").trim()));
    const fileTags = mergeTags(rawTags);
    const tags = withExtraTags(fileTags, isAgentRow ? mergeTags(extra, [AGENT_TAG]) : extra, MAX_TAGS);
    if (rawTags.some((t) => t.length > MAX_TAG) || fileTags.some((t) => !tags.includes(t))) {
      warn("tags", "tags", get("tags"), `tags shortened (${MAX_TAG} characters each, ${MAX_TAGS} at most)`);
      keepTags(fileTags.filter((t) => tags.includes(t)));
    }
    const rawClosed = get("closedOn");
    const closedOn = isoDate(rawClosed, { order: opts.dateOrder });
    if (rawClosed && !closedOn && !isPlaceholder(rawClosed)) warn("closedOn", "date", rawClosed, dateProblem(rawClosed, opts.dateOrder), "closedOn");
    const rawApplied = get("appliedOn");
    const appliedOn = isoDate(rawApplied, { order: opts.dateOrder });
    if (rawApplied && !appliedOn && !isPlaceholder(rawApplied)) asWritten.push(`${label("appliedOn")} (as written): ${rawApplied.slice(0, 120)}`);
    const amount = num(get("loanAmount"));
    const noteRate = num(get("noteRate"));
    // D80: one "Program" column ("5/1 ARM", "FHA 30") also gives fixed or ARM and the term when no column of their own does.
    const prog = readProgram(get("loanProgram"));
    const rawChange = get("armFirstChange");
    const armFirstChange = isoDate(rawChange, { order: opts.dateOrder });
    if (rawChange && !armFirstChange && !isPlaceholder(rawChange)) asWritten.push(`${label("armFirstChange")} (as written): ${rawChange.slice(0, 120)}`);
    const more: Partial<LoanDetails> = {
      appliedOn,
      program: prog.program,
      rateType: readRateType(get("rateType")) ?? prog.rateType,
      termMonths: readTerm(get("termMonths")) ?? prog.termMonths,
      armFirstChange,
      armMargin: readMargin(get("armMargin")),
      purpose: readPurpose(get("loanPurpose")),
      occupancy: readOccupancy(get("occupancy")),
      propertyType: readPropertyType(get("propertyType")),
      lender: readLender(get("lender")),
    };
    const loanMore = Object.fromEntries(Object.entries(more).filter(([, v]) => v !== null && v !== undefined)) as Partial<LoanDetails>;
    // D69: an opt-out is a revocation. It always wins over an opt-in in the same row.
    const optOuts: Partial<Record<ConsentChannel, string>> = {};
    if (readsOptOut(cell("doNotContact"))) for (const c of ["text", "call", "email"] as const) optOuts[c] = whereFrom("doNotContact");
    if (readsOptOut(cell("optOutText"))) optOuts.text ??= whereFrom("optOutText");
    if (readsOptOut(cell("optOutCall"))) optOuts.call ??= whereFrom("optOutCall");
    if (readsOptOut(cell("optOutEmail"))) optOuts.email ??= whereFrom("optOutEmail");
    const phoneStopped = !!(optOuts.text || optOuts.call);
    const inField = (c: ConsentChannel) => (c === "text" ? "optInText" : c === "call" ? "optInCall" : "optInEmail") as "optInText" | "optInCall" | "optInEmail";
    // D74: a value the loan officer hasn't read as yes ("maybe", "X") is never permission.
    // D93: an agent sorted out of a mixed import gets no opt-ins (as in an agent list); their opt-outs still count.
    const optIns = kind === "contacts" && !isAgentRow ? (["text", "call", "email"] as const).filter((c) => readOptIn(cell(inField(c)), opts.consent?.[inField(c)]) === "yes").filter((c) => (c === "email" ? !optOuts.email : !phoneStopped)) : [];
    // D93: the co-borrower, from their own columns or the name cell. Info only: a phone or email that doesn't read is kept in notes, never "needs a look".
    let coBorrower: CoBorrower | null = null;
    if (kind === "contacts" && !isAgentRow) {
      let [cf, cl] = [cell("coFirstName"), cell("coLastName")];
      if (!cf && !cl) [cf, cl] = cell("coFullName") ? splitName(cell("coFullName"), opts.nameOrder) : coFromName ?? ["", ""];
      else if (!cl && cf.includes(",")) [cf, cl] = splitName(cf);
      const rawCoPhone = cell("coPhone");
      const rawCoEmail = cell("coEmail");
      const coPhone = rawCoPhone && !isPlaceholderPhone(rawCoPhone) ? toE164(rawCoPhone) : null;
      const coEmail = rawCoEmail && !isPlaceholderEmail(rawCoEmail) ? cleanEmail(rawCoEmail) : null;
      if (rawCoPhone && !coPhone && !isPlaceholder(rawCoPhone)) asWritten.push(`${label("coPhone")} (as written): ${rawCoPhone.slice(0, 120)}`);
      if (rawCoEmail && !coEmail && !isPlaceholder(rawCoEmail)) asWritten.push(`${label("coEmail")} (as written): ${rawCoEmail.slice(0, 120)}`);
      if (cf || cl || coPhone || coEmail) coBorrower = { firstName: cf.slice(0, 60), lastName: cl.slice(0, 80), phone: coPhone, email: coEmail };
    }
    // D93.1: a value the loan officer moved to notes (or a shifted row's value with nowhere else to go), as written.
    const movedToNotes = (fix?.note ?? "").split("\n").map((l) => l.trim().slice(0, 160));
    const noteLines = [cell("notes"), ...noteCols.map((c) => ((row[c] ?? "").trim() ? `${(csv.headers[c] ?? "").trim() || `Column ${c + 1}`}: ${(row[c] ?? "").trim()}` : "")), ...asWritten, ...movedToNotes].filter(Boolean);
    const leadSource = get("leadSource").slice(0, 120) || null;
    const referredBy = get("referredBy").slice(0, 120) || null;
    const brokerage = isAgentRow && opts.brokerageCol !== undefined ? (row[opts.brokerageCol] ?? "").trim().slice(0, 120) || null : null;
    records.push({
      firstName: first.slice(0, 60),
      lastName: last.slice(0, 80),
      email,
      phone: phone ?? phone2,
      phone2: phone ? phone2 : null,
      street: get("street").slice(0, 120) || null,
      city: get("city").slice(0, 60) || null,
      state,
      zip,
      // D42: a file named "Past clients…" makes "past client" the default when a row doesn't say. D93: an agent row is an agent.
      relationship: isAgentRow ? "agent" : get("relationship") || !opts.defaultRelationship || kind === "agents" ? relationshipOf(get("relationship"), kind) : opts.defaultRelationship,
      tags,
      notes: noteLines.join("\n").slice(0, 2000) || null,
      ...(kind === "contacts" && !isAgentRow && (leadSource || referredBy) ? { leadSource, referredBy } : {}),
      ...(coBorrower ? { coBorrower } : {}),
      loan: kind === "contacts" && !isAgentRow && (closedOn || amount || noteRate || anyLoan(loanMore)) ? { closedOn, amount, noteRate: noteRate !== null && noteRate > 0 && noteRate < 20 ? noteRate : null, ...loanMore } : null,
      agent:
        kind === "agents"
          ? { brokerage: get("brokerage").slice(0, 120) || null, units: num(get("units")), volume: num(get("volume")), buyerUnits: num(get("buyerUnits")), listingUnits: num(get("listingUnits")), avgPrice: num(get("avgPrice")), topLender: get("topLender").slice(0, 120) || null }
          : isAgentRow && brokerage
            ? { brokerage, units: null, volume: null, buyerUnits: null, listingUnits: null, avgPrice: null, topLender: null }
            : null,
      attestedOptIns: optIns,
      ...(Object.keys(optOuts).length ? { optOuts } : {}),
      ...(opts.fileName ? { sourceFile: opts.fileName.slice(0, 160) } : {}),
      sourceRow: rowNo(i),
    });
  });
  return { records, problems, warnings, placeholders };
}

/** D69: whether a record asked to stop every channel (texts, calls and email). */
export function stopsEverything(r: Pick<ImportRecord, "optOuts">): boolean {
  return !!r.optOuts && !!(r.optOuts.text || r.optOuts.call) && !!r.optOuts.email;
}
