/**
 * lib/contacts/mapping.ts — matching a CSV's columns to contact fields, and
 * turning rows into clean records (D2). Client-safe and pure.
 *
 * Two kinds of import: "contacts" (past clients, sphere, leads: exports
 * from Bonzo, Total Expert, Jungo, Salesforce, Google, Outlook, Excel) and
 * "agents" (RETR exports, or any agent list).
 */
import { cleanEmail, cleanState, isoDate, splitName, stateFromZip, toE164 } from "./normalize";
import { MAX_TAG, MAX_TAGS, mergeTags, splitTags, withExtraTags } from "./tags";
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
/** D69: a second borrower's details never fill the person's own name, phone or email. */
const CO_BORROWER = /co-?borrower|spouse/;
const PERSON_FIELDS = new Set<Field>(["firstName", "lastName", "fullName", "email", "phone", "phone2"]);

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
  ["tags", /^(tags?|labels?|groups?|lists?)$|\btags?\b/],
  ["closedOn", /(close|closing|funded|fund).*date|date.*(closed|funded)|closed on/],
  ["loanAmount", /loan.*amount|^amount$/],
  ["noteRate", /^(note |interest )?rate$|note rate|interest rate/],
  ["notes", /notes?|comments?|memo/],
];

/** Whether a column with this header may feed this field at all (D69 rules, before any pattern). */
export function headerAllowed(field: Field, header: string): boolean {
  const h = header.trim().toLowerCase();
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
  loan: { closedOn: string | null; amount: number | null; noteRate: number | null } | null;
  agent: { brokerage: string | null; units: number | null; volume: number | null; buyerUnits: number | null; listingUnits: number | null; avgPrice: number | null; topLender: string | null } | null;
  /** Channels a column said "yes" to. Recorded as the loan officer's attestation, not proof. */
  attestedOptIns: ConsentChannel[];
  /**
   * D69: channels the file says this person opted out of, each with where it
   * came from ("<file> column <header>"). Recorded as a revocation; it always
   * wins over an opt-in. "text" or "call" stops every phone channel.
   */
  optOuts?: Partial<Record<ConsentChannel, string>>;
};

export type RowProblem = { row: number; reason: string };

export { MAX_TAG, MAX_TAGS } from "./tags";

const num = (s: string | undefined): number | null => {
  const v = Number((s ?? "").replace(/[$,%\s]/g, ""));
  return (s ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
};
const yes = (s: string | undefined) => /^(y|yes|true|1|opted ?in|subscribed)$/i.test((s ?? "").trim());
/**
 * D69: an opt-out cell counts unless it plainly says no. A date, "x" or
 * "Opted out" in an opt-out column all mean they asked to stop.
 */
const optedOut = (s: string | undefined) => {
  const v = (s ?? "").trim();
  return v !== "" && !/^(n|no|false|0|none|-|n\/a|opted ?in|subscribed|active|ok)$/i.test(v);
};
const ZIP_RE = /^\d{5}(-\d{4})?$/;

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
 * Turns mapped rows into records. Rows with no name and no way to reach them
 * are skipped with a reason; values that couldn't be read (a ZIP, a date) are
 * left blank and listed in `warnings`.
 */
export function buildRecords(
  csv: Csv,
  mapping: Mapping,
  kind: ImportKind,
  opts: { defaultRelationship?: string | null; firstRow?: number; fileName?: string; extraTags?: readonly string[] } = {},
): { records: ImportRecord[]; problems: RowProblem[]; warnings: RowProblem[] } {
  const rowNo = (i: number) => i + (opts.firstRow ?? 2);
  const records: ImportRecord[] = [];
  const problems: RowProblem[] = [];
  const warnings: RowProblem[] = [];
  // D69: a column may only feed a field its header allows (an opt-out column never feeds an opt-in).
  const safe = guardOptOuts(csv.headers, mapping);
  const get = (row: string[], f: Field) => (safe[f] !== undefined ? (row[safe[f]!] ?? "").trim() : "");
  // D73: the tags the loan officer picked for the whole import and for this list, on every row.
  const extra = mergeTags(opts.extraTags ?? []);
  const whereFrom = (f: OptOutField) => `${(opts.fileName ?? "file").slice(0, 100)} column ${(csv.headers[safe[f]!] ?? "").trim().slice(0, 60)}`;
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
    const rawZip = get(row, "zip");
    const zip = ZIP_RE.test(rawZip) ? rawZip : null;
    if (rawZip && !zip) warnings.push({ row: rowNo(i), reason: "ZIP not readable, left blank" });
    const state = cleanState(get(row, "state")) ?? stateFromZip(zip ?? undefined);
    const rawTags = splitTags(get(row, "tags"));
    const fileTags = mergeTags(rawTags);
    const tags = withExtraTags(fileTags, extra, MAX_TAGS);
    if (rawTags.some((t) => t.length > MAX_TAG) || fileTags.some((t) => !tags.includes(t))) warnings.push({ row: rowNo(i), reason: `tags shortened (${MAX_TAG} characters each, ${MAX_TAGS} at most)` });
    const rawClosed = get(row, "closedOn");
    const closedOn = isoDate(rawClosed);
    if (rawClosed && !closedOn) warnings.push({ row: rowNo(i), reason: "date not readable, left blank" });
    const amount = num(get(row, "loanAmount"));
    const noteRate = num(get(row, "noteRate"));
    // D69: an opt-out is a revocation. It always wins over an opt-in in the same row.
    const optOuts: Partial<Record<ConsentChannel, string>> = {};
    if (optedOut(get(row, "doNotContact"))) for (const c of ["text", "call", "email"] as const) optOuts[c] = whereFrom("doNotContact");
    if (optedOut(get(row, "optOutText"))) optOuts.text ??= whereFrom("optOutText");
    if (optedOut(get(row, "optOutCall"))) optOuts.call ??= whereFrom("optOutCall");
    if (optedOut(get(row, "optOutEmail"))) optOuts.email ??= whereFrom("optOutEmail");
    const phoneStopped = !!(optOuts.text || optOuts.call);
    const optIns =
      kind === "contacts"
        ? (["text", "call", "email"] as const).filter((c) => yes(get(row, c === "text" ? "optInText" : c === "call" ? "optInCall" : "optInEmail"))).filter((c) => (c === "email" ? !optOuts.email : !phoneStopped))
        : [];
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
      attestedOptIns: optIns,
      ...(Object.keys(optOuts).length ? { optOuts } : {}),
    });
  });
  return { records, problems, warnings };
}

/** D69: whether a record asked to stop every channel (texts, calls and email). */
export function stopsEverything(r: Pick<ImportRecord, "optOuts">): boolean {
  return !!r.optOuts && !!(r.optOuts.text || r.optOuts.call) && !!r.optOuts.email;
}
