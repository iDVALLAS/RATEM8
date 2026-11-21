/**
 * lib/pipeline/intake.ts — turning a loan update from ARIVE (its webhooks
 * or a Zapier "Webhooks by Zapier" POST), Encompass later, or any loan
 * system into one shape (D6). SERVER-ONLY for `ingest`; `readPayload` is pure.
 *
 * Field names are matched loosely (case, spaces, underscores and common
 * synonyms), so a Zap can send ARIVE's own field names.
 */
import { randomBytes } from "node:crypto";
import { onLoanChange } from "@/lib/automations/engine";
import { report } from "@/lib/monitoring";
import { accountStore } from "@/lib/accounts/store";
import { contactStore } from "@/lib/contacts/store";
import { cleanEmail, isoDate, splitName, toE164 } from "@/lib/contacts/normalize";
import { pipelineStore, type KeyDates, type Loan } from "./store";

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const FIELDS: Record<string, string[]> = {
  externalId: ["loannumber", "loanid", "loanno", "id", "fileid", "filenumber", "loanguid", "loanloannumber", "loanfolderloannumber"],
  firstName: ["borrowerfirstname", "firstname", "primaryborrowerfirstname", "loanborrowerfirstname"],
  lastName: ["borrowerlastname", "lastname", "primaryborrowerlastname", "loanborrowerlastname"],
  fullName: ["borrowername", "borrower", "name", "primaryborrower"],
  email: ["borroweremail", "email", "emailaddress"],
  phone: ["borrowerphone", "borrowermobile", "mobilephone", "cellphone", "phone", "homephone"],
  milestone: ["loanstatus", "status", "milestone", "currentmilestone", "loanmilestone", "stage", "loancurrentmilestonename", "currentmilestonename", "loanstage"],
  purpose: ["loanpurpose", "purpose"],
  loanType: ["loantype", "program", "loanprogram", "mortgagetype"],
  amount: ["loanamount", "totalloanamount", "baseloanamount", "amount", "loanloanamount"],
  noteRate: ["interestrate", "noterate", "rate"],
  application: ["applicationdate", "appdate", "applicationreceiveddate", "dateapplicationreceived"],
  lockExpires: ["lockexpirationdate", "lockexpiration", "lockexpires", "rateLockExpirationDate".toLowerCase()],
  appraisal: ["appraisaldate", "appraisalreceiveddate", "appraisalreceived"],
  clearToClose: ["cleartoclosedate", "ctcdate", "cleartoclose"],
  closing: ["closingdate", "estimatedclosingdate", "estclosingdate", "fundingdate", "closedate"],
  agentName: ["buyeragentname", "buyersagent", "realtorname", "agentname", "buyeragent", "realestateagent"],
};

export type LoanUpdate = {
  externalId: string;
  borrowerName: string;
  email: string | null;
  phone: string | null;
  milestone: string;
  purpose: string | null;
  loanType: string | null;
  amount: number | null;
  noteRate: number | null;
  keyDates: KeyDates;
  agentName: string | null;
};

const CLOSED = /\b(closed|funded|purchased|complete(d)?|disbursed)\b/i;
const DEAD = /\b(withdrawn|denied|declined|cancel(l)?ed|adverse|dead|incomplete|suspended|rescinded)\b/i;

export function readPayload(raw: unknown): LoanUpdate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const flat: Record<string, string> = {};
  const walk = (o: Record<string, unknown>, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && !Array.isArray(v) && depth < 2) walk(v as Record<string, unknown>, depth + 1);
      else if (typeof v === "string" || typeof v === "number") flat[norm(k)] ??= String(v).trim();
    }
  };
  walk(raw as Record<string, unknown>, 0);
  const get = (f: string) => FIELDS[f].map((k) => flat[k]).find((v) => v !== undefined && v !== "") ?? "";
  const externalId = get("externalId").slice(0, 60);
  const milestone = get("milestone").slice(0, 60);
  if (!externalId || !milestone) return null;
  let first = get("firstName");
  let last = get("lastName");
  if (!first && !last) [first, last] = splitName(get("fullName"));
  const money = (s: string) => {
    const v = Number(s.replace(/[$,\s%]/g, ""));
    return s && Number.isFinite(v) ? v : null;
  };
  const rate = money(get("noteRate"));
  return {
    externalId,
    borrowerName: `${first} ${last}`.trim().slice(0, 120) || "Borrower",
    email: cleanEmail(get("email")),
    phone: toE164(get("phone")),
    milestone,
    purpose: get("purpose").slice(0, 40) || null,
    loanType: get("loanType").slice(0, 40) || null,
    amount: money(get("amount")),
    noteRate: rate !== null && rate > 0 && rate < 20 ? rate : null,
    keyDates: { application: isoDate(get("application")), lockExpires: isoDate(get("lockExpires")), appraisal: isoDate(get("appraisal")), clearToClose: isoDate(get("clearToClose")), closing: isoDate(get("closing")) },
    agentName: get("agentName").slice(0, 120) || null,
  };
}

/**
 * Applies one update to the loan officer's book: upserts the loan, keeps
 * its stage history, and links the borrower to a contact (adding one, as
 * the loan officer's own client, if needed). A closed loan makes the
 * borrower a past client with the loan's details. Never sends anything.
 */
export async function ingest(ownerUserId: string, u: LoanUpdate, source: string, now = new Date()): Promise<Loan> {
  const at = now.toISOString();
  const ps = pipelineStore();
  const cs = contactStore();
  const prev = await ps.byExternal(ownerUserId, u.externalId);
  let contactId = prev?.contactId ?? null;
  let contact = contactId ? await cs.get(contactId) : null;
  if (!contact && (u.phone || u.email)) contact = await cs.findDuplicate(ownerUserId, u.phone, u.email);
  const [firstName, lastName] = splitName(u.borrowerName);
  const closed = CLOSED.test(u.milestone);
  const dead = DEAD.test(u.milestone);
  if (!contact && (u.phone || u.email)) {
    contact = { id: `c_${randomBytes(9).toString("base64url")}`, ownerUserId, kind: "contact", provenance: "own_closings", locked: false, source: `loan system: ${source}`, createdAt: at, updatedAt: at, firstName, lastName, email: u.email, phone: u.phone, phone2: null, street: null, city: null, state: null, zip: null, relationship: "lead", tags: [], notes: null, loan: null, agent: null };
  }
  if (contact) {
    if (closed) {
      contact.relationship = "past_client";
      contact.loan = { closedOn: u.keyDates.closing ?? at.slice(0, 10), amount: u.amount, noteRate: u.noteRate };
    }
    contact.email ??= u.email;
    contact.phone ??= u.phone;
    contact.updatedAt = at;
    await cs.put(contact);
    contactId = contact.id;
  }
  const changed = !prev || prev.milestone !== u.milestone;
  const loan: Loan = {
    id: prev?.id ?? `l_${randomBytes(9).toString("base64url")}`,
    ownerUserId,
    externalId: u.externalId,
    source,
    contactId,
    borrowerName: u.borrowerName,
    purpose: u.purpose ?? prev?.purpose ?? null,
    loanType: u.loanType ?? prev?.loanType ?? null,
    amount: u.amount ?? prev?.amount ?? null,
    noteRate: u.noteRate ?? prev?.noteRate ?? null,
    milestone: u.milestone,
    milestoneAt: changed ? at : prev!.milestoneAt,
    history: changed ? [...(prev?.history ?? []), { milestone: u.milestone, at }].slice(-50) : prev!.history,
    keyDates: { ...(prev?.keyDates ?? { application: null, lockExpires: null, appraisal: null, clearToClose: null, closing: null }), ...Object.fromEntries(Object.entries(u.keyDates).filter(([, v]) => v)) } as KeyDates,
    agentName: u.agentName ?? prev?.agentName ?? null,
    closed,
    dead,
    updatedAt: at,
  };
  await ps.put(loan);
  // D71: the LOA's jobs on this loan (Full-auto stage updates claim their recipe first, so they go once).
  if (changed || JSON.stringify(prev?.keyDates ?? null) !== JSON.stringify(loan.keyDates)) {
    const { runLoaAutopilot } = await import("@/lib/loa/autopilot");
    await runLoaAutopilot(loan, "loan_change", now, { previousMilestone: prev?.milestone ?? null }).catch((e) => report("error", e, { route: "pipeline", stage: "loa" }));
  }
  if (changed) {
    await accountStore().audit({ at, actor: `pipeline:${source}`, action: "loan.milestone", detail: { loanId: loan.id, milestone: u.milestone.slice(0, 40) } });
    // D10: stage updates the loan officer turned on (drafts for approval, never sent from here).
    // A failure here must not lose the loan update, so it is reported, not thrown.
    await onLoanChange(loan, prev?.milestone ?? null, now).catch((e) => report("error", e, { route: "pipeline", stage: "automations" }));
  }
  return loan;
}
