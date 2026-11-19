/**
 * lib/contacts/mapping.ts — matching a CSV's columns to contact fields, and
 * turning rows into clean records (D2). Client-safe and pure.
 *
 * Two kinds of import: "contacts" (past clients, sphere, leads: exports
 * from Bonzo, Total Expert, Jungo, Salesforce, Google, Outlook, Excel) and
 * "agents" (RETR exports, or any agent list).
 */
import { cleanEmail, cleanState, isoDate, splitName, stateFromZip, toE164 } from "./normalize";
import type { Csv } from "./csv";

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
  tags: "Tags",
  notes: "Notes",
  closedOn: "Loan closed on",
  loanAmount: "Loan amount",
  noteRate: "Note rate",
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
} as const;

export type Field = keyof typeof CONTACT_FIELDS | keyof typeof AGENT_FIELDS;
export type Mapping = Partial<Record<Field, number>>;

/** Header words that point to each field, most specific first. */
const SYNONYMS: [Field, RegExp][] = [
  ["optInText", /(sms|text).*(opt|consent|permission)|(opt|consent).*(sms|text)/],
  ["optInCall", /(call|phone|voice).*(opt|consent|permission)|(opt|consent).*(call|phone)/],
  ["optInEmail", /e-?mail.*(opt|consent|permission)|(opt|consent).*e-?mail/],
  ["buyerUnits", /buy(er)?.*(side|units|sides|transactions)/],
  ["listingUnits", /(list|listing|sell(er)?).*(side|units|sides|transactions)/],
  ["units", /^(total )?(units|transactions|sides|closed units)|units.*(12|ttm|year)/],
  ["volume", /volume|sales total|\$ ?volume/],
  ["avgPrice", /av(era)?g.*price/],
  ["topLender", /(top |most used |preferred )?(lender|loan officer|mlo)/],
  ["brokerage", /brokerage|office|company|firm/],
  ["firstName", /^(first|given|fname|first name|contact first name)|first.?name/],
  ["lastName", /^(last|surname|family|lname)|last.?name/],
  ["fullName", /^(name|full name|contact name|agent name|agent|client|borrower)$|full.?name/],
  ["email", /e-?mail/],
  ["phone2", /(home|work|office|other|secondary|alt).*phone|phone ?2/],
  ["phone", /mobile|cell|phone|tel/],
  ["street", /street|address( ?1| line 1)?$|^address/],
  ["city", /^city|town/],
  ["state", /^state|province|^st$/],
  ["zip", /zip|postal/],
  ["relationship", /relationship|contact type|lead type|client type|category|lifecycle|stage|^type$|^status$/],
  ["tags", /tags?|labels?|groups?|lists?/],
  ["closedOn", /(close|closing|funded|fund).*date|date.*(closed|funded)|closed on/],
  ["loanAmount", /loan.*amount|amount/],
  ["noteRate", /(note |interest )?rate/],
  ["notes", /notes?|comments?|memo/],
];

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
    const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(h.trim().toLowerCase()));
    if (i >= 0) {
      m[field] = i;
      used.add(i);
    }
  }
  return m;
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
  loan: { closedOn: string | null; amount: number | null; noteRate: number | null } | null;
  agent: { brokerage: string | null; units: number | null; volume: number | null; buyerUnits: number | null; listingUnits: number | null; avgPrice: number | null; topLender: string | null } | null;
  /** Channels a column said "yes" to. Recorded as the loan officer's attestation, not proof. */
  attestedOptIns: ConsentChannel[];
};

export type RowProblem = { row: number; reason: string };

const num = (s: string | undefined): number | null => {
  const v = Number((s ?? "").replace(/[$,%\s]/g, ""));
  return (s ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
};
const yes = (s: string | undefined) => /^(y|yes|true|1|opted ?in|subscribed)$/i.test((s ?? "").trim());

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

/** Turns mapped rows into records. Rows with no name and no way to reach them are skipped with a reason. */
export function buildRecords(csv: Csv, mapping: Mapping, kind: ImportKind, opts: { defaultRelationship?: string | null; firstRow?: number } = {}): { records: ImportRecord[]; problems: RowProblem[] } {
  const rowNo = (i: number) => i + (opts.firstRow ?? 2);
  const records: ImportRecord[] = [];
  const problems: RowProblem[] = [];
  const get = (row: string[], f: Field) => (mapping[f] !== undefined ? (row[mapping[f]!] ?? "").trim() : "");
  csv.rows.forEach((row, i) => {
    let first = get(row, "firstName");
    let last = get(row, "lastName");
    if (!first && !last) [first, last] = splitName(get(row, "fullName"));
    else if (!last && first.includes(",")) [first, last] = splitName(first);
    const email = cleanEmail(get(row, "email"));
    const phone = toE164(get(row, "phone"));
    const phone2 = toE164(get(row, "phone2"));
    if (!first && !last && !email) return problems.push({ row: rowNo(i), reason: "no name or email" });
    if (!email && !phone && !phone2) return problems.push({ row: rowNo(i), reason: "no valid phone or email" });
    const zip = get(row, "zip") || null;
    const state = cleanState(get(row, "state")) ?? stateFromZip(zip ?? undefined);
    const tags = get(row, "tags").split(/[;,|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const closedOn = isoDate(get(row, "closedOn"));
    const amount = num(get(row, "loanAmount"));
    const noteRate = num(get(row, "noteRate"));
    records.push({
      firstName: first.slice(0, 60),
      lastName: last.slice(0, 80),
      email,
      phone: phone ?? phone2,
      phone2: phone ? phone2 : null,
      street: get(row, "street").slice(0, 120) || null,
      city: get(row, "city").slice(0, 60) || null,
      state,
      zip,
      // D42: a file named "Past clients…" makes "past client" the default when a row doesn't say.
      relationship: get(row, "relationship") || !opts.defaultRelationship || kind === "agents" ? relationshipOf(get(row, "relationship"), kind) : opts.defaultRelationship,
      tags,
      notes: get(row, "notes").slice(0, 2000) || null,
      loan: kind === "contacts" && (closedOn || amount || noteRate) ? { closedOn, amount, noteRate: noteRate !== null && noteRate > 0 && noteRate < 20 ? noteRate : null } : null,
      agent:
        kind === "agents"
          ? { brokerage: get(row, "brokerage").slice(0, 120) || null, units: num(get(row, "units")), volume: num(get(row, "volume")), buyerUnits: num(get(row, "buyerUnits")), listingUnits: num(get(row, "listingUnits")), avgPrice: num(get(row, "avgPrice")), topLender: get(row, "topLender").slice(0, 120) || null }
          : null,
      attestedOptIns: kind === "contacts" ? (["text", "call", "email"] as const).filter((c) => yes(get(row, c === "text" ? "optInText" : c === "call" ? "optInCall" : "optInEmail"))) : [],
    });
  });
  return { records, problems };
}
