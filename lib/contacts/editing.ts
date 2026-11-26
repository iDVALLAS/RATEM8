/**
 * lib/contacts/editing.ts — checking a hand-made or edited contact (D77).
 * Client-safe and pure. Every value goes through the same cleaning as an
 * import (lib/contacts/normalize.ts); a value that doesn't read is an error
 * the loan officer sees, never a silent blank. No protected traits are
 * fields here (fair lending): names, phones, email, address, relationship,
 * lead source, referred by, notes and (D93) a co-borrower's name, phone and
 * email only.
 */
import { cleanEmail, cleanState, cleanZip, emailProblem, phoneProblem, toE164 } from "./normalize";
import { RELATIONSHIP_LABELS, type CoBorrower } from "./mapping";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import type { Contact } from "./store";
import { isDay } from "./filter";
import { isoDate } from "./normalize";
import { anyLoan, LOAN_PROGRAMS, LOAN_PURPOSES, OCCUPANCIES, PROPERTY_TYPES, RATE_TYPES, readMargin, readTerm, type LoanDetails } from "./loan";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { titleCase } from "./reslot";

/** The fields a person can edit by hand. */
export const EDIT_FIELDS = ["firstName", "lastName", "phone", "phone2", "email", "street", "city", "state", "zip", "relationship", "leadSource", "referredBy", "notes", "coFirstName", "coLastName", "coPhone", "coEmail"] as const;
export type EditField = (typeof EDIT_FIELDS)[number];
/** D93: the co-borrower's parts of the form (saved together as `coBorrower`). */
export const CO_EDIT_FIELDS = ["coFirstName", "coLastName", "coPhone", "coEmail"] as const;
type CoEditField = (typeof CO_EDIT_FIELDS)[number];
const CO_KEY: Record<CoEditField, keyof CoBorrower> = { coFirstName: "firstName", coLastName: "lastName", coPhone: "phone", coEmail: "email" };
export type EditInput = Partial<Record<EditField, string>>;
export type EditValues = { firstName: string; lastName: string; phone: string | null; phone2: string | null; email: string | null; street: string | null; city: string | null; state: string | null; zip: string | null; relationship: string; leadSource: string | null; referredBy: string | null; notes: string | null; coBorrower: CoBorrower | null };
export type EditCheck = { ok: true; values: EditValues } | { ok: false; errors: Partial<Record<EditField, string>> };

const MAX: Partial<Record<EditField, number>> = { firstName: 60, lastName: 80, street: 120, city: 60, leadSource: 120, referredBy: 120, notes: 4000, coFirstName: 60, coLastName: 80 };
const LABEL: Record<EditField, string> = { firstName: cp.edit.first, lastName: cp.edit.last, phone: cp.edit.phone, phone2: cp.edit.phone2, email: cp.edit.email, street: cp.edit.street, city: cp.edit.city, state: cp.edit.state, zip: cp.edit.zip, relationship: cp.edit.relationship, leadSource: cp.edit.leadSource, referredBy: cp.edit.referredBy, notes: cp.edit.notes, coFirstName: cp.edit.coFirst, coLastName: cp.edit.coLast, coPhone: cp.edit.coPhone, coEmail: cp.edit.coEmail };

/** Relationships a person of this kind can have (agents are always "agent"). */
export const relationshipsFor = (kind: "contact" | "agent") => (kind === "agent" ? ["agent"] : Object.keys(RELATIONSHIP_LABELS).filter((k) => k !== "agent"));

/** Checks and cleans the form. Blank optional fields become null. */
export function checkEdit(input: EditInput, kind: "contact" | "agent"): EditCheck {
  const errors: Partial<Record<EditField, string>> = {};
  const raw = (f: EditField) => String(input[f] ?? "").trim();
  const text = (f: EditField) => {
    const v = f === "notes" ? String(input[f] ?? "").replace(/\r\n/g, "\n").trim() : raw(f).replace(/\s+/g, " ");
    if (MAX[f] && v.length > MAX[f]!) errors[f] = cp.errors.long(LABEL[f]);
    return v;
  };
  const firstName = text("firstName");
  const lastName = text("lastName");
  if (!firstName && !lastName) errors.firstName = cp.errors.name;
  const phoneRaw = raw("phone");
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  if (phoneRaw && !phone) errors.phone = cp.errors.phone(phoneProblem(phoneRaw));
  const phone2Raw = raw("phone2");
  const phone2 = phone2Raw ? toE164(phone2Raw) : null;
  if (phone2Raw && !phone2) errors.phone2 = cp.errors.phone2(phoneProblem(phone2Raw));
  const emailRaw = raw("email");
  const email = emailRaw ? cleanEmail(emailRaw) : null;
  if (emailRaw && !email) errors.email = cp.errors.email(emailProblem(emailRaw));
  if (!phoneRaw && !emailRaw) errors.phone = cp.errors.reach;
  const stateRaw = raw("state");
  const state = stateRaw ? cleanState(stateRaw) : null;
  if (stateRaw && !state) errors.state = cp.errors.state;
  const zipRaw = raw("zip");
  const zip = zipRaw ? cleanZip(zipRaw) : null;
  if (zipRaw && !zip) errors.zip = cp.errors.zip;
  const relationship = raw("relationship") || (kind === "agent" ? "agent" : "");
  if (!relationshipsFor(kind).includes(relationship)) errors.relationship = cp.errors.relationship;
  // D93: the co-borrower, checked like everyone else (agents have none). Saved as information only; nothing is sent to them.
  const coFirst = kind === "agent" ? "" : text("coFirstName");
  const coLast = kind === "agent" ? "" : text("coLastName");
  const coPhoneRaw = kind === "agent" ? "" : raw("coPhone");
  const coPhone = coPhoneRaw ? toE164(coPhoneRaw) : null;
  if (coPhoneRaw && !coPhone) errors.coPhone = cp.errors.coPhone(phoneProblem(coPhoneRaw));
  const coEmailRaw = kind === "agent" ? "" : raw("coEmail");
  const coEmail = coEmailRaw ? cleanEmail(coEmailRaw) : null;
  if (coEmailRaw && !coEmail) errors.coEmail = cp.errors.coEmail(emailProblem(coEmailRaw));
  const values: EditValues = {
    firstName,
    lastName,
    phone,
    phone2: phone2 && phone2 !== phone ? phone2 : null,
    email,
    street: text("street") || null,
    city: text("city") || null,
    state,
    zip,
    relationship,
    leadSource: text("leadSource") || null,
    referredBy: text("referredBy") || null,
    notes: text("notes") || null,
    coBorrower: coFirst || coLast || coPhone || coEmail ? { firstName: coFirst, lastName: coLast, phone: coPhone, email: coEmail } : null,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

// ---- D93.1: moving a value between address boxes in the Edit form ----

/** The boxes a value can be dragged between (the state box is a list of states). */
export const DROP_BOXES = ["street", "city", "state", "zip"] as const;
export type DropBox = (typeof DROP_BOXES)[number];
type Boxes = Record<DropBox | "notes", string>;

/** A value as it lands in a box: the state box takes only a state (as its code); the rest take it as written. Null = it can't go there. */
function landed(to: DropBox, value: string, fromFile = false): string | null {
  const v = value.trim();
  // A city kept from the file in capitals ("SCOTTSDALE") lands as "Scottsdale", as the import does.
  if (to === "city" && fromFile) return titleCase(v);
  if (to !== "state") return v;
  if (!v) return "";
  return cleanState(v);
}

/** Whether two boxes can swap their values (each value must fit the other box). */
export function canSwap(v: Boxes, from: DropBox, to: DropBox): boolean {
  return from !== to && !!v[from].trim() && landed(to, v[from]) !== null && landed(from, v[to]) !== null;
}

/** The two boxes after a swap (nothing is saved until Save, which runs `checkEdit`). */
export function swapBoxes(v: Boxes, from: DropBox, to: DropBox): Partial<Boxes> | null {
  if (!canSwap(v, from, to)) return null;
  return { [to]: landed(to, v[from])!, [from]: landed(from, v[to])! } as Partial<Boxes>;
}

/** A value an import kept in notes "as written" ("Closed on (as written): 85262"), one per line. */
export type AsWritten = { line: number; label: string; value: string };
const AS_WRITTEN = /^(.{1,80}?) \(as written\): (.+)$/;

export function asWrittenLines(notes: string): AsWritten[] {
  return notes.split("\n").flatMap((l, line) => {
    const m = AS_WRITTEN.exec(l.trim());
    return m && m[2].trim() ? [{ line, label: m[1].trim(), value: m[2].trim() }] : [];
  });
}

/**
 * A "From the file" value dropped into a box: the box takes it, its line
 * leaves the notes, and whatever the box held goes into the notes as written
 * (so nothing is lost). Null when it can't go there.
 */
export function chipInto(v: Boxes, chip: number, to: DropBox): Partial<Boxes> | null {
  const c = asWrittenLines(v.notes)[chip];
  if (!c) return null;
  const value = landed(to, c.value, true);
  if (value === null || value === "") return null;
  const lines = v.notes.split("\n").filter((_, i) => i !== c.line);
  const old = v[to].trim();
  if (old && old !== value) lines.push(`${LABEL[to]} (as written): ${old}`);
  return { [to]: value, notes: lines.join("\n").trim() } as Partial<Boxes>;
}

/** The fields an edit changes (compared with the stored contact). */
export function changedFields(c: Contact, v: EditValues): EditField[] {
  const norm = (x: unknown) => (x === undefined || x === null || x === "" ? null : String(x));
  const isCo = (f: EditField): f is CoEditField => (CO_EDIT_FIELDS as readonly string[]).includes(f);
  const now = (f: EditField) => norm(isCo(f) ? c.coBorrower?.[CO_KEY[f]] : (c as unknown as Record<string, unknown>)[f]);
  const next = (f: EditField) => norm(isCo(f) ? v.coBorrower?.[CO_KEY[f]] : (v as unknown as Record<string, unknown>)[f]);
  return EDIT_FIELDS.filter((f) => now(f) !== next(f));
}

// ---- D80: loan details, edited by hand on the Loan & agent tab ----

export const LOAN_EDIT_FIELDS = ["closedOn", "amount", "noteRate", "program", "rateType", "termMonths", "armFirstChange", "armMargin", "purpose", "occupancy", "propertyType", "lender"] as const;
export type LoanEditField = (typeof LOAN_EDIT_FIELDS)[number];
export type LoanEditInput = Partial<Record<LoanEditField, string>>;
export type LoanCheck = { ok: true; loan: LoanDetails | null } | { ok: false; errors: Partial<Record<LoanEditField, string>> };

const oneOf = <T extends string>(list: readonly T[], v: string): T | null => ((list as readonly string[]).includes(v) ? (v as T) : null);

/**
 * Checks the loan form the same way an import reads a file: dates must be
 * real days, a note rate is a percent between 0 and 20, a margin between 0
 * and 10, the program, rate type, purpose, occupancy and property type come
 * from fixed lists. A blank field is "not set". All blank = no loan.
 */
export function checkLoanEdit(input: LoanEditInput): LoanCheck {
  const errors: Partial<Record<LoanEditField, string>> = {};
  const raw = (f: LoanEditField) => String(input[f] ?? "").trim();
  const F = lc.loan.fields;
  const E = lc.loan.errors;
  const day = (f: "closedOn" | "armFirstChange") => {
    const v = raw(f);
    if (!v) return null;
    const iso = isDay(v) ? v : isoDate(v);
    if (!iso) errors[f] = E.date(F[f]);
    return iso;
  };
  const closedOn = day("closedOn");
  const armFirstChange = day("armFirstChange");
  const amountRaw = raw("amount").replace(/[$,\s]/g, "");
  const amount = amountRaw ? Number(amountRaw) : null;
  if (amountRaw && !(amount !== null && Number.isFinite(amount) && amount > 0 && amount <= 100_000_000)) errors.amount = E.amount;
  const rateRaw = raw("noteRate").replace(/[%\s]/g, "");
  const noteRate = rateRaw ? Number(rateRaw) : null;
  if (rateRaw && !(noteRate !== null && Number.isFinite(noteRate) && noteRate > 0 && noteRate < 20)) errors.noteRate = E.rate;
  const marginRaw = raw("armMargin");
  const armMargin = marginRaw ? readMargin(marginRaw) : null;
  if (marginRaw && armMargin === null) errors.armMargin = E.margin;
  const termRaw = raw("termMonths");
  const termMonths = termRaw ? readTerm(termRaw) : null;
  if (termRaw && termMonths === null) errors.termMonths = E.term;
  const lender = raw("lender").replace(/\s+/g, " ");
  if (lender.length > 120) errors.lender = E.lender;
  if (Object.keys(errors).length) return { ok: false, errors };
  const loan: LoanDetails = {
    closedOn,
    amount: amount !== null ? Math.round(amount) : null,
    noteRate: noteRate !== null ? Math.round(noteRate * 1000) / 1000 : null,
    program: oneOf(LOAN_PROGRAMS, raw("program")),
    rateType: oneOf(RATE_TYPES, raw("rateType")),
    termMonths,
    armFirstChange,
    armMargin,
    purpose: oneOf(LOAN_PURPOSES, raw("purpose")),
    occupancy: oneOf(OCCUPANCIES, raw("occupancy")),
    propertyType: oneOf(PROPERTY_TYPES, raw("propertyType")),
    lender: lender || null,
  };
  return { ok: true, loan: anyLoan(loan) ? loan : null };
}
