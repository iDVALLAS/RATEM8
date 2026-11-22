/**
 * lib/leads/intake.ts — leads from lead vendors and web forms (D14).
 * SERVER-ONLY.
 *
 * From Viato's "paste one link into the vendor's portal" lead intake
 * (LendingTree, Zillow, Bankrate, LowerMyBills and others), done our way:
 *  - one POST per lead to /api/leads/inbound with the loan officer's
 *    connection key, from the vendor or a Zapier step
 *  - fields are matched loosely, so most vendors' payloads work as they are
 *  - a duplicate (same phone or email in this loan officer's book) is
 *    merged, never doubled
 *  - the vendor's consent wording is saved as the proof, but it counts as
 *    permission only when it names this loan officer or their company.
 *    Consent given to "partners" or another lender isn't permission to
 *    contact them from here (ledger §A/§B; carrier and state rules).
 *  - the lead's own message is kept as data, never as instructions
 *  - nothing is sent to the lead; the lead shows on Today right away (speed to lead)
 *  - D79: a new person (not a duplicate) alerts the loan officer by text or
 *    email, their choice, within their notification hours (lib/leads/alert.ts)
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { cleanEmail, cleanState, splitName, stateFromZip, toE164 } from "@/lib/contacts/normalize";
import { redactChatInput } from "@/lib/m8/redact";
import { mloById } from "@/lib/config";
import { companyDetails } from "@/lib/accounts/company";

export type Lead = {
  externalId: string | null;
  vendor: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  zip: string | null;
  purpose: string | null;
  message: string | null;
  consent: { text: string; at: string | null; url: string | null } | null;
};

const KEYS = {
  id: ["leadid", "id", "externalid", "lead_id", "referenceid", "leadnumber"],
  vendor: ["vendor", "source", "leadsource", "provider", "channel"],
  first: ["firstname", "first", "fname", "borrowerfirstname", "givenname"],
  last: ["lastname", "last", "lname", "borrowerlastname", "surname", "familyname"],
  name: ["name", "fullname", "borrowername", "contactname"],
  email: ["email", "emailaddress", "borroweremail", "contactemail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "homephone", "primaryphone", "borrowerphone"],
  state: ["state", "propertystate", "subjectstate", "st"],
  zip: ["zip", "zipcode", "postalcode", "propertyzip", "subjectzip"],
  purpose: ["loanpurpose", "purpose", "loantype", "producttype", "product"],
  message: ["message", "comments", "comment", "notes", "note", "question"],
  consent: ["consenttext", "tcpaconsent", "tcpaconsenttext", "consent", "optintext", "tcpa", "disclosuretext", "leadidtoken_text"],
  consentAt: ["consenttimestamp", "consentat", "tcpatimestamp", "optintime", "submittedat", "createdat", "timestamp"],
  consentUrl: ["consenturl", "pageurl", "landingpage", "url", "formurl"],
} as const;

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Flattens one level of nesting (vendors often send { lead: {...}, contact: {...} }). */
function flat(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[norm(k)] ??= String(v).slice(0, 2000);
  };
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) put(k2, v2);
    else put(k, v);
  }
  return out;
}

export function readLead(raw: unknown, sourceHint = ""): Lead | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const f = flat(raw as Record<string, unknown>);
  const get = (keys: readonly string[]) => keys.map((k) => f[norm(k)]).find((v) => v !== undefined && v.trim() !== "")?.trim() ?? "";
  let first = get(KEYS.first);
  let last = get(KEYS.last);
  if (!first && !last) [first, last] = splitName(get(KEYS.name));
  const phone = toE164(get(KEYS.phone));
  const email = cleanEmail(get(KEYS.email));
  if (!phone && !email) return null;
  const zip = get(KEYS.zip).slice(0, 10) || null;
  const consentText = get(KEYS.consent);
  const consentLooksLikeText = consentText.length >= 40; // a bare "true" or "yes" says nothing about who was named
  return {
    externalId: get(KEYS.id).slice(0, 80) || null,
    vendor: (get(KEYS.vendor) || sourceHint || "lead vendor").slice(0, 40),
    firstName: first.slice(0, 60),
    lastName: last.slice(0, 60),
    email,
    phone,
    state: cleanState(get(KEYS.state)) ?? (zip ? stateFromZip(zip) : null),
    zip,
    purpose: get(KEYS.purpose).slice(0, 60) || null,
    message: get(KEYS.message) ? redactChatInput(get(KEYS.message)).text.slice(0, 1000) : null,
    consent: consentLooksLikeText ? { text: consentText.slice(0, 1500), at: get(KEYS.consentAt).slice(0, 40) || null, url: get(KEYS.consentUrl).slice(0, 300) || null } : null,
  };
}

/** Does the consent wording name this loan officer or their company? */
export function consentNamesUs(text: string, user: User): boolean {
  const t = text.toLowerCase();
  const mlo = mloById(user.mloId);
  const names = [...companyDetails(mlo).names, "LoanM8", mlo?.name].filter((n): n is string => !!n && n.length >= 4).map((n) => n.toLowerCase());
  return names.some((n) => t.includes(n));
}

export type LeadResult = { contactId: string; created: boolean; permission: "recorded" | "not_naming_us" | "none" };

export async function ingestLead(user: User, lead: Lead, now = new Date(), alertDeps: import("./alert").AlertDeps = {}): Promise<LeadResult> {
  const store = contactStore();
  const at = now.toISOString();
  const tag = `lead:${lead.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
  let c: Contact | null = await store.findDuplicate(user.id, lead.phone, lead.email);
  const created = !c;
  const note = lead.message ? `Lead form message (${lead.vendor}, ${at.slice(0, 10)}): ${lead.message}` : null;
  if (!c) {
    c = {
      id: `c_${randomBytes(9).toString("base64url")}`,
      ownerUserId: user.id,
      kind: "contact",
      provenance: "lead_vendor",
      locked: false,
      source: `lead: ${lead.vendor}`,
      createdAt: at,
      updatedAt: at,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      phone2: null,
      street: null,
      city: null,
      state: lead.state,
      zip: lead.zip,
      relationship: "lead",
      tags: [tag, ...(lead.purpose ? [`wants:${lead.purpose.toLowerCase().slice(0, 30)}`] : [])],
      notes: note,
      loan: null,
      agent: null,
    };
  } else {
    c = { ...c, email: c.email ?? lead.email, phone: c.phone ?? lead.phone, state: c.state ?? lead.state, tags: [...new Set([...c.tags, tag])], notes: note ? [c.notes, note].filter(Boolean).join("\n").slice(-4000) : c.notes, updatedAt: at };
  }
  await store.put(c);
  let permission: LeadResult["permission"] = "none";
  if (lead.consent) {
    if (consentNamesUs(lead.consent.text, user)) {
      const proof = `Lead form via ${lead.vendor}${lead.consent.at ? ` at ${lead.consent.at}` : ""}${lead.consent.url ? ` (${lead.consent.url})` : ""}: "${lead.consent.text.slice(0, 380)}"`;
      for (const channel of ["text", "call"] as const) for (const purpose of ["service", "marketing"] as const) await store.addConsent({ contactId: c.id, channel, purpose, granted: true, evidence: "web_form", proof, at, actor: `lead:${lead.vendor}` });
      permission = "recorded";
    } else permission = "not_naming_us";
  }
  await accountStore().audit({ at, actor: `lead:${lead.vendor}`, action: "lead.inbound", detail: { owner: user.id, contactId: c.id, created, permission } });
  // D51: into the loan officer's active "new lead" campaigns; steps due now go out at once (through the contact rules).
  try {
    const { onNewLead } = await import("@/lib/campaigns/service");
    await onNewLead(user, c.id, now);
  } catch {
    // A campaign problem never loses the lead.
  }
  // D79: tell the loan officer (first name, state and source only). Never throws.
  if (created) {
    const { alertNewLead } = await import("./alert");
    await alertNewLead(user, c, now, alertDeps);
  }
  return { contactId: c.id, created, permission };
}
