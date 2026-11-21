/**
 * lib/contacts/editing.ts — checking a hand-made or edited contact (D77).
 * Client-safe and pure. Every value goes through the same cleaning as an
 * import (lib/contacts/normalize.ts); a value that doesn't read is an error
 * the loan officer sees, never a silent blank. No protected traits are
 * fields here (fair lending): names, phones, email, address, relationship,
 * lead source, referred by and notes only.
 */
import { cleanEmail, cleanState, cleanZip, emailProblem, phoneProblem, toE164 } from "./normalize";
import { RELATIONSHIP_LABELS } from "./mapping";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import type { Contact } from "./store";

/** The fields a person can edit by hand. */
export const EDIT_FIELDS = ["firstName", "lastName", "phone", "phone2", "email", "street", "city", "state", "zip", "relationship", "leadSource", "referredBy", "notes"] as const;
export type EditField = (typeof EDIT_FIELDS)[number];
export type EditInput = Partial<Record<EditField, string>>;
export type EditValues = { firstName: string; lastName: string; phone: string | null; phone2: string | null; email: string | null; street: string | null; city: string | null; state: string | null; zip: string | null; relationship: string; leadSource: string | null; referredBy: string | null; notes: string | null };
export type EditCheck = { ok: true; values: EditValues } | { ok: false; errors: Partial<Record<EditField, string>> };

const MAX: Partial<Record<EditField, number>> = { firstName: 60, lastName: 80, street: 120, city: 60, leadSource: 120, referredBy: 120, notes: 4000 };
const LABEL: Record<EditField, string> = { firstName: cp.edit.first, lastName: cp.edit.last, phone: cp.edit.phone, phone2: cp.edit.phone2, email: cp.edit.email, street: cp.edit.street, city: cp.edit.city, state: cp.edit.state, zip: cp.edit.zip, relationship: cp.edit.relationship, leadSource: cp.edit.leadSource, referredBy: cp.edit.referredBy, notes: cp.edit.notes };

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
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** The fields an edit changes (compared with the stored contact). */
export function changedFields(c: Contact, v: EditValues): EditField[] {
  const now = (f: EditField): string | null => {
    const x = (c as unknown as Record<string, unknown>)[f];
    return x === undefined || x === null || x === "" ? null : String(x);
  };
  return EDIT_FIELDS.filter((f) => now(f) !== (v[f] === "" ? null : v[f]));
}
