/**
 * lib/loa/service.ts — the Loan Officer Assistant at work on each file
 * (D62). SERVER-ONLY.
 *
 * The owner asked for a dedicated LOA that reads the purchase agreement,
 * runs the initial disclosures, collects documents, pulls escrow fees,
 * opens and reviews title and coordinates payoffs with escrow, takes the
 * conditional approval and gathers what's needed for final approval, with
 * clear communication to the loan officer.
 *
 * What it does here, on top of the Loan Journey (D17) and the AUS
 * checklist (D18):
 *  - reads the four documents (readers.ts) into the file;
 *  - keeps every deadline: the contract's, the federal clocks (Loan
 *    Estimate, Closing Disclosure), the re-verification window, the lock;
 *  - keeps an 18-point checklist, ticked automatically where the file shows
 *    it and by hand otherwise;
 *  - drafts the emails to escrow and title (fees, opening title, payoffs),
 *    which go only when the loan officer presses Send, from their own
 *    mailbox when it's connected;
 *  - puts the borrower's conditions on the document checklist, so the
 *    existing upload requests go out through the contact rules;
 *  - lists what needs the loan officer each morning.
 * It drafts and tracks; it doesn't issue disclosures (that's the loan
 * system) or place vendor orders.
 */
import { randomBytes } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { mloById } from "@/lib/config";
import { bookOf } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { automationStore } from "@/lib/automations/store";
import { RECIPES } from "@/lib/automations/recipes";
import { conciergeStore } from "@/lib/concierge/store";
import { FACT_WORDS, type FactKey } from "@/lib/content/loa";
import { loanFor } from "@/lib/journey/engine";
import { addDocs } from "@/lib/journey/docs";
import { journeyStore, emptyJourney, type Journey } from "@/lib/journey/store";
import { pipelineStore, type Loan } from "@/lib/pipeline/store";
import { sendFromMailbox } from "@/lib/mail/service";
import type { Attachment } from "@/lib/mail/mime";
import { resendMail } from "@/lib/pilot/service";
import { signatureFor } from "@/lib/profile/signature";
import { cdReceivedBy, cdSendBy, daysUntil, isDate, leDueBy, voeWindowOpens } from "./dates";
import { readDoc, type DocCall, type DocKind, type Read } from "./readers";
import { capByKey, canChangeSwitches, changedKeys, cleanModes, effectiveMode, isCapKey, isMode, lowest, officerMode, presetModes, purposeKind, PURPOSES, type CapKey, type Mode, type Modes, type Preset, type Purpose, type SwitchSettings } from "./autonomy";
import { CHECKS, CONTRACT_FIELDS, emptyFile, loaStore, PARTY_ROLES, type CheckKey, type Condition, type Contract, type ContractField, type Deadline, type Draft, type LoaAutonomy, type LoaFile, type Party, type PartyRole, type ReviewChange, type TitleItem } from "./store";

const iso = (d: Date) => d.toISOString();
const today = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
const rid = (p: string) => `${p}_${randomBytes(6).toString("base64url")}`;
const money = (n: number | null | undefined) => (n == null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);
const log = (f: LoaFile, text: string, now: Date) => ({ ...f, log: [...f.log, { at: iso(now), text }].slice(-60) });

export const PARTY_LABELS: Record<PartyRole, string> = { buyer_agent: "Buyer's agent", listing_agent: "Listing agent", escrow: "Escrow officer", title: "Title officer", lender: "Lender", insurance: "Insurance agent" };

/** The file for a loan the user can see, created on first use. */
export async function fileFor(user: User, loanId: string): Promise<{ loan: Loan; file: LoaFile; journey: Journey } | null> {
  const loan = await loanFor(user, loanId);
  if (!loan) return null;
  const [file, journey] = await Promise.all([loaStore().file(loan.id), journeyStore().get(loan.id)]);
  return { loan, file: file ?? emptyFile(loan.id, loan.ownerUserId), journey: journey ?? emptyJourney(loan.id, loan.ownerUserId) };
}

// ---- Reading documents ----

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PARTY_FIELDS = ["company", "name", "email", "phone"] as const;
const FIELD_LABEL: Record<(typeof PARTY_FIELDS)[number], string> = { company: "company", name: "name", email: "email", phone: "phone" };
/** D70: a party the loan officer entered or confirmed; a document never overwrites its values. */
export const isConfirmed = (p: Party | undefined) => !!p && (p.source === "lo" || !!p.confirmedAt);
/** D70: a safe recipient: an email the loan officer typed or confirmed (never one only read from a document). */
export const emailConfirmed = (p: Party | undefined) => !!p?.email && !!p.confirmedAt;

/**
 * D70: what a document says about the parties, merged into the file.
 * Parties read only from documents take the new values. A party the loan
 * officer entered or confirmed only gets its empty fields filled; anything
 * different waits in Review changes. A changed confirmed escrow or title
 * email also holds the loan (the wire-fraud guard).
 */
export function mergeParties(old: Party[], found: Party[], now: Date): { parties: Party[]; review: ReviewChange[]; held: PartyRole | null } {
  const out = [...old];
  const review: ReviewChange[] = [];
  let held: PartyRole | null = null;
  for (const p of found) {
    if (!p.company && !p.name && !p.email) continue;
    const i = out.findIndex((x) => x.role === p.role);
    const clean: Party = { role: p.role, company: p.company.trim(), name: p.name.trim(), email: EMAIL.test(p.email.trim()) ? p.email.trim().toLowerCase() : "", phone: p.phone.replace(/[^\d+()\-. ]/g, "").trim(), source: "document", confirmedAt: null, confirmedBy: null };
    if (i < 0) {
      out.push(clean);
      continue;
    }
    const e = out[i];
    if (!isConfirmed(e)) {
      out[i] = { ...e, ...Object.fromEntries(Object.entries(clean).filter(([k, v]) => v && PARTY_FIELDS.includes(k as never))), source: "document", confirmedAt: null } as Party;
      continue;
    }
    const next = { ...e };
    for (const k of PARTY_FIELDS) {
      const v = clean[k];
      if (!v) continue;
      if (!e[k]) {
        next[k] = v;
        // An email filled in from a document isn't confirmed, whoever entered the rest.
        if (k === "email") next.confirmedAt = null;
      }
      else if (v.toLowerCase() !== e[k].toLowerCase()) {
        review.push({ id: rid("rv"), kind: "party", role: p.role, field: k, label: `${PARTY_LABELS[p.role]}: ${FIELD_LABEL[k]}`, was: e[k], now: v, next: v, at: iso(now) });
        if (k === "email" && (p.role === "escrow" || p.role === "title")) held = p.role;
      }
    }
    out[i] = next;
  }
  return { parties: out, review, held };
}

const showValue = (v: unknown): string => (v == null ? "—" : typeof v === "number" ? (Math.abs(v) >= 1000 ? money(v) : String(v)) : typeof v === "object" ? Object.values(v as Record<string, string>).filter(Boolean).join(", ") : String(v));
const CONTRACT_LABEL: Record<ContractField, string> = { price: "Price", sellerCredits: "Seller credits", earnestMoney: "Earnest money", property: "Property", mutualAcceptance: "Mutual acceptance", earnestMoneyDue: "Earnest money due", inspectionEnds: "Inspection contingency ends", financingContingencyEnds: "Financing contingency ends", appraisalContingencyEnds: "Appraisal contingency ends", closingDate: "Closing", possession: "Possession" };

/** D70: a new copy of the contract fills empty fields only; every difference waits in Review changes. */
export function mergeContract(old: Contract | null, read: Contract, now: Date): { contract: Contract; review: ReviewChange[] } {
  if (!old) return { contract: read, review: [] };
  const c: Contract = { ...old, notes: [...new Set([...old.notes, ...read.notes])].slice(0, 20), named: [...new Set([...(old.named ?? []), ...(read.named ?? [])])] };
  const review: ReviewChange[] = [];
  for (const k of CONTRACT_FIELDS) {
    const was = old[k];
    const v = read[k];
    if (v == null) continue;
    if (was == null) (c as Record<ContractField, unknown>)[k] = v;
    else if (JSON.stringify(was) !== JSON.stringify(v)) review.push({ id: rid("rv"), kind: "contract", role: null, field: k, label: CONTRACT_LABEL[k], was: showValue(was), now: showValue(v), next: v, at: iso(now) });
  }
  return { contract: c, review };
}

/** Keeps one pending review per field and value. */
const addReview = (have: ReviewChange[] | undefined, more: ReviewChange[]) => {
  const out = [...(have ?? [])];
  for (const r of more) if (!out.some((x) => x.kind === r.kind && x.role === r.role && x.field === r.field && x.now === r.now)) out.push(r);
  return out.slice(-30);
};

function holdFor(f: LoaFile, role: PartyRole | null, now: Date): LoaFile {
  if (!role) return f;
  const who = PARTY_LABELS[role].replace(/ officer$/, "");
  return log({ ...f, hold: { role, reason: `${who}'s email changed in the new document.`, at: iso(now) } }, `Held everything automatic: ${who.toLowerCase()}'s email changed in a new document.`, now);
}

const dateOrNull = (s: string | null | undefined) => (isDate(s) ? s : null);
const READ_CAP: Record<DocKind, CapKey> = { purchase_agreement: "read_psa", title_commitment: "read_title", conditional_approval: "read_approval", escrow_fees: "read_fees" };

/** Reads one document and puts what it says on the file. */
export async function readIntoFile(user: User, loanId: string, kind: DocKind, input: { pdf?: Uint8Array | null; text?: string }, now = new Date(), call?: DocCall | null): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  // D70: a reading switch set to Off means the LOA doesn't read that kind of document.
  const sw = { settings: await switchesFor(ctx.loan.ownerUserId), purpose: purposeKind(ctx.loan, ctx.file) ?? (kind === "purchase_agreement" ? ("purchase" as const) : null) };
  const readCap = capByKey(READ_CAP[kind]);
  if (sw.purpose && readCap.applies[sw.purpose] && effectiveMode(readCap, sw.purpose, sw.settings, ctx.file, now, { ignorePause: true }) === "off") return { ok: false, error: `"${readCap.label}" is Off in your LOA's switches. Turn it on under How much your LOA does on its own.` };
  const r = await readDoc(user, kind, input, call);
  if (!r.ok) return r;
  let f = ctx.file;
  let summary = "";
  if (kind === "purchase_agreement") {
    const d = r.data as Read<"purchase_agreement">;
    const read: Contract = {
      price: d.price, sellerCredits: d.sellerCredits, earnestMoney: d.earnestMoney, property: d.property,
      mutualAcceptance: dateOrNull(d.mutualAcceptance), earnestMoneyDue: dateOrNull(d.earnestMoneyDue), inspectionEnds: dateOrNull(d.inspectionEnds),
      financingContingencyEnds: dateOrNull(d.financingContingencyEnds), appraisalContingencyEnds: dateOrNull(d.appraisalContingencyEnds), closingDate: dateOrNull(d.closingDate), possession: dateOrNull(d.possession),
      notes: d.notes,
      named: [...new Set(d.parties.filter((p) => p.company || p.name || p.email).map((p) => p.role as PartyRole))],
    };
    const c = mergeContract(f.contract, read, now);
    const m = mergeParties(f.parties, d.parties as Party[], now);
    f = holdFor({ ...f, contract: c.contract, parties: m.parties, review: addReview(f.review, [...c.review, ...m.review]), checks: { ...f.checks, contract: { done: true, at: iso(now), by: "LOA" } } }, m.held, now);
    const dates = [d.closingDate && `closing ${d.closingDate}`, d.financingContingencyEnds && `financing contingency ${d.financingContingencyEnds}`].filter(Boolean);
    summary = `Purchase agreement read: ${money(d.price) || "price not found"}${dates.length ? `, ${dates.join(", ")}` : ""}. ${d.parties.length} parties on the file.`;
  } else if (kind === "title_commitment") {
    const d = r.data as Read<"title_commitment">;
    const items: TitleItem[] = d.items.map((x) => ({ id: rid("ti"), kind: x.kind, text: x.text, payoff: x.payoff, status: "open" }));
    f = { ...f, title: { commitmentDate: dateOrNull(d.commitmentDate), vesting: d.vesting, items, receivedAt: iso(now) }, checks: { ...f.checks, title_reviewed: { done: true, at: iso(now), by: "LOA" }, title_opened: f.checks.title_opened ?? { done: true, at: iso(now), by: "LOA", note: "commitment received" } } };
    const pay = items.filter((x) => x.payoff).length;
    summary = `Title commitment read: ${items.length} items, ${pay ? `${pay} to pay off or release at closing` : "nothing to pay off"}.`;
    // D70: drafted (never sent) unless the payoffs switch is Off. D71's planner takes this over.
    if (pay && effectiveMode(capByKey("payoffs"), sw.purpose, sw.settings, f, now) !== "off") f = draftFor(f, "payoffs", user, now, { purpose: sw.purpose, leSent: !!ctx.journey.dates.leSentOn });
  } else if (kind === "conditional_approval") {
    const d = r.data as Read<"conditional_approval">;
    const have = new Set(f.conditions.map((c) => c.text.toLowerCase()));
    const fresh: Condition[] = d.conditions.filter((c) => !have.has(c.text.toLowerCase())).map((c) => ({ id: rid("cd"), text: c.text, owner: c.owner, priorTo: c.priorTo, status: "open" }));
    const m = d.lender ? mergeParties(f.parties, [{ role: "lender", company: d.lender, name: "", email: "", phone: "" }], now) : null;
    f = { ...f, conditions: [...f.conditions, ...fresh], approvalReceivedAt: iso(now), parties: m ? m.parties : f.parties, review: m ? addReview(f.review, m.review) : f.review };
    // The borrower's items join the document checklist, so the existing upload request covers them.
    const borrower = fresh.filter((c) => c.owner === "borrower");
    if (borrower.length && effectiveMode(capByKey("read_approval"), sw.purpose, sw.settings, f, now, { ignorePause: true }) !== "off") await addDocs(user, loanId, borrower.map((c) => ({ name: c.text.slice(0, 160), why: "Conditional approval", phase: "final" as const })), now).catch(() => 0);
    const by = (o: Condition["owner"]) => fresh.filter((c) => c.owner === o).length;
    summary = `Conditional approval read: ${fresh.length} conditions (${by("borrower")} from the borrower, ${by("third_party")} from third parties, ${by("loan_officer")} for you, ${by("lender")} the lender's own).${d.expires ? ` The approval expires ${d.expires}.` : ""}`;
    if (d.expires && isDate(d.expires)) f = { ...f, deadlines: [...f.deadlines.filter((x) => x.key !== "approval_expires"), { key: "approval_expires", label: "Conditional approval expires", date: d.expires, source: "lender", done: false }] };
  } else {
    const d = r.data as Read<"escrow_fees">;
    const m = d.from ? mergeParties(f.parties, [{ role: "escrow", company: d.from, name: "", email: "", phone: "" }], now) : null;
    f = { ...f, escrowFees: { from: d.from, total: d.total, lines: d.lines, receivedAt: iso(now) }, parties: m ? m.parties : f.parties, review: m ? addReview(f.review, m.review) : f.review, checks: { ...f.checks, escrow_fees: { done: true, at: iso(now), by: "LOA" } } };
    summary = `Escrow fees read: ${money(d.total) || "total not shown"} across ${d.lines.length} lines from ${d.from || "escrow"}.`;
  }
  f = recompute(log(f, summary, now), ctx.loan, ctx.journey, now);
  await loaStore().putFile({ ...f, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.read", detail: { loanId, kind } });
  return { ok: true, summary };
}

// ---- Deadlines and checks ----

/** The signing date the file goes by: the journey's, the contract's, then the loan system's. */
export const signingDate = (f: LoaFile, j: Journey, loan: Loan) => j.dates.signingOn ?? f.contract?.closingDate ?? loan.keyDates.closing ?? null;

export function recompute(f: LoaFile, loan: Loan, j: Journey, now: Date): LoaFile {
  const keep = f.deadlines.filter((x) => x.source === "manual" || x.source === "lender");
  const out: Deadline[] = [...keep];
  const add = (key: string, label: string, date: string | null | undefined, source: Deadline["source"], done = false) => {
    if (isDate(date)) out.push({ key, label, date, source, done: done || (f.deadlines.find((x) => x.key === key)?.done ?? false) });
  };
  const c = f.contract;
  if (c) {
    add("emd", "Earnest money due", c.earnestMoneyDue, "contract");
    add("inspection", "Inspection contingency ends", c.inspectionEnds, "contract");
    add("appraisal_contingency", "Appraisal contingency ends", c.appraisalContingencyEnds, "contract", !!loan.keyDates.appraisal);
    add("financing", "Financing contingency ends", c.financingContingencyEnds, "contract", !!loan.keyDates.clearToClose);
    add("closing", "Closing", c.closingDate, "contract", loan.closed);
  }
  if (isDate(loan.keyDates.application)) add("le", "Loan Estimate out (3 business days after application)", leDueBy(loan.keyDates.application), "trid", !!j.dates.leSentOn);
  const sign = signingDate(f, j, loan);
  if (isDate(sign)) {
    add("cd_send", "Closing Disclosure sent (if receipt isn't confirmed)", cdSendBy(sign), "trid", !!j.dates.cdSentOn);
    add("cd_receive", "Closing Disclosure received by the borrower", cdReceivedBy(sign), "trid", !!j.dates.cdSentOn);
    add("voe", "Verbal re-verification of employment opens", voeWindowOpens(sign), "guide", !!j.dates.voeOn && j.dates.voeOn >= voeWindowOpens(sign));
  }
  add("lock", "Rate lock expires", loan.keyDates.lockExpires, "lender", loan.closed);
  out.sort((a, b) => a.date.localeCompare(b.date));

  const auto: Partial<Record<CheckKey, boolean>> = {
    contract: !!f.contract,
    le: !!j.dates.leSentOn && (!isDate(loan.keyDates.application) || j.dates.leSentOn <= leDueBy(loan.keyDates.application)),
    itp: !!j.dates.intentToProceedOn,
    appraisal_ordered: j.steps["14A"]?.status === "done",
    appraisal_received: !!loan.keyDates.appraisal,
    escrow_fees: !!f.escrowFees,
    title_opened: f.drafts.some((d) => d.kind === "open_title" && d.status === "sent") || !!f.title,
    title_reviewed: !!f.title,
    payoffs: !!f.title && f.title.items.filter((x) => x.payoff).every((x) => x.status !== "open"),
    conditions: f.conditions.length > 0 && f.conditions.every((x) => x.status === "cleared"),
    voe: !!j.dates.voeOn && isDate(sign) && j.dates.voeOn >= voeWindowOpens(sign),
    cd: !!j.dates.cdSentOn && isDate(sign) && j.dates.cdSentOn <= cdSendBy(sign),
    lock: isDate(loan.keyDates.lockExpires) && isDate(sign) && loan.keyDates.lockExpires >= sign,
    signing: !!j.dates.signingOn,
    funded: loan.closed,
  };
  const checks = { ...f.checks };
  for (const [k, v] of Object.entries(auto) as [CheckKey, boolean][]) {
    if (v && !checks[k]?.done) checks[k] = { done: true, at: iso(now), by: "LOA" };
  }
  return { ...f, deadlines: out, checks };
}

export async function setCheck(user: User, loanId: string, key: CheckKey, done: boolean, now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  if (!ctx || !CHECKS.some((c) => c.key === key)) return false;
  const f = { ...ctx.file, checks: { ...ctx.file.checks, [key]: { done, at: iso(now), by: user.email } } };
  await loaStore().putFile({ ...log(f, `${done ? "Ticked" : "Unticked"}: ${CHECKS.find((c) => c.key === key)!.label}.`, now), updatedAt: iso(now) });
  return true;
}

export async function setParty(user: User, loanId: string, p: Party, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  if (!(PARTY_ROLES as readonly string[]).includes(p.role)) return { ok: false, error: "Pick who they are." };
  if (p.email && !EMAIL.test(p.email.trim())) return { ok: false, error: "That email doesn't look right." };
  // D70: what the loan officer types is confirmed; it settles any pending change for this party and releases its hold.
  const parties = [...ctx.file.parties.filter((x) => x.role !== p.role), { role: p.role, company: p.company.trim().slice(0, 120), name: p.name.trim().slice(0, 80), email: p.email.trim().toLowerCase(), phone: p.phone.trim().slice(0, 30), source: "lo" as const, confirmedAt: iso(now), confirmedBy: user.email }];
  const f = releaseHold({ ...ctx.file, parties, review: (ctx.file.review ?? []).filter((r) => r.role !== p.role) }, now);
  await loaStore().putFile({ ...f, updatedAt: iso(now) });
  return { ok: true };
}

/** D70: the loan officer checked a party's email (by phone, at a number they already had). */
export async function confirmParty(user: User, loanId: string, role: PartyRole, now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  const p = ctx?.file.parties.find((x) => x.role === role);
  if (!ctx || !p?.email) return false;
  const f = { ...ctx.file, parties: ctx.file.parties.map((x) => (x.role === role ? { ...x, confirmedAt: iso(now), confirmedBy: user.email } : x)) };
  await loaStore().putFile({ ...log(f, `Confirmed the ${PARTY_LABELS[role].toLowerCase()}'s email.`, now), updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.confirm", detail: { loanId, role } });
  return true;
}

/** The hold lifts once no changed escrow or title email is waiting. */
function releaseHold(f: LoaFile, now: Date): LoaFile {
  if (!f.hold) return f;
  if ((f.review ?? []).some((r) => r.kind === "party" && r.field === "email" && r.role === f.hold!.role)) return f;
  return log({ ...f, hold: null }, "Hold lifted: the email was settled by the loan officer.", now);
}

/** D70: the loan officer settles one difference a new document found. */
export async function resolveReview(user: User, loanId: string, reviewId: string, useNew: boolean, now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  const r = ctx?.file.review?.find((x) => x.id === reviewId);
  if (!ctx || !r) return false;
  let f: LoaFile = { ...ctx.file, review: (ctx.file.review ?? []).filter((x) => x.id !== reviewId) };
  if (r.kind === "party" && r.role) {
    const field = r.field as (typeof PARTY_FIELDS)[number];
    if (!PARTY_FIELDS.includes(field)) return false;
    f = { ...f, parties: f.parties.map((x) => (x.role === r.role ? { ...x, ...(useNew ? { [field]: String(r.next) } : {}), source: "lo" as const, confirmedAt: iso(now), confirmedBy: user.email } : x)) };
  } else if (r.kind === "contract" && f.contract && (CONTRACT_FIELDS as readonly string[]).includes(r.field)) {
    const k = r.field as ContractField;
    f = { ...f, contract: { ...f.contract, ...(useNew ? { [k]: r.next } : {}), fields: { ...f.contract.fields, [k]: { source: "lo", confirmedAt: iso(now) } } } as Contract };
  }
  f = releaseHold(log(f, `${r.label}: ${useNew ? `now ${r.now}` : `kept ${r.was}`}.`, now), now);
  await loaStore().putFile({ ...recompute(f, ctx.loan, ctx.journey, now), updatedAt: iso(now) });
  return true;
}

export async function setTitleItem(user: User, loanId: string, itemId: string, status: TitleItem["status"], now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  if (!ctx?.file.title) return false;
  const f = { ...ctx.file, title: { ...ctx.file.title, items: ctx.file.title.items.map((x) => (x.id === itemId ? { ...x, status } : x)) } };
  await loaStore().putFile({ ...recompute(f, ctx.loan, ctx.journey, now), updatedAt: iso(now) });
  return true;
}

export async function setCondition(user: User, loanId: string, condId: string, status: Condition["status"], now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  if (!ctx || !ctx.file.conditions.some((c) => c.id === condId)) return false;
  const f = { ...ctx.file, conditions: ctx.file.conditions.map((c) => (c.id === condId ? { ...c, status } : c)) };
  await loaStore().putFile({ ...recompute(f, ctx.loan, ctx.journey, now), updatedAt: iso(now) });
  return true;
}

// ---- Drafts to escrow and title ----

function addressOf(f: LoaFile): string {
  const p = f.contract?.property;
  return p ? `${p.street}, ${p.city}, ${p.state} ${p.zip}`.replace(/^,\s*/, "") : "the subject property";
}

/** Which switch each kind of draft belongs to. */
export const DRAFT_CAP: Partial<Record<Draft["kind"], CapKey>> = { escrow_fees: "escrow_fees", open_title: "order_title", open_escrow: "open_escrow", payoffs: "payoffs" };

type DraftOpts = { purpose: Purpose | null; leSent: boolean; borrower?: string; letter?: { subject: string; body: string } };

export function draftFor(f: LoaFile, kind: Draft["kind"], user: Pick<User, "name" | "mloId">, now: Date, o: DraftOpts): LoaFile {
  if (f.drafts.some((d) => d.kind === kind && d.status === "draft")) return f;
  const borrower = o.borrower || "our mutual client";
  const refi = o.purpose === "refi";
  const m = mloById(user.mloId);
  const me = m?.firstName ?? user.name.split(" ")[0] ?? "";
  const role: PartyRole = kind === "open_title" ? "title" : "escrow";
  const to = f.parties.find((p) => p.role === role);
  const hi = to?.name ? `Hi ${to.name.split(" ")[0]},` : "Hello,";
  const where = addressOf(f);
  const closing = f.contract?.closingDate ? ` We're scheduled to close ${f.contract.closingDate}.` : "";
  let subject = "";
  let body = "";
  if (kind === "escrow_fees") {
    // D70: "the buyer" only on a purchase; the Loan Estimate only before it has gone out.
    subject = `Escrow fee estimate: ${where}`;
    const why = o.leSent ? "so I have them for the closing figures" : "so I can get them into the Loan Estimate";
    body = `${hi}\n\nI'm the loan officer for ${borrower} on ${where}.${closing} Could you send your estimated escrow and settlement fees for the ${refi ? "borrower" : "buyer"}, ${why}?\n\nThank you,\n${me}`;
  } else if (kind === "open_title") {
    subject = `Please open title: ${where}`;
    body = `${hi}\n\nPlease open title on ${where} for ${borrower}'s ${refi ? "refinance" : "purchase"}.${closing} When it's ready, please send the preliminary title commitment and the closing protection letter.\n\nThank you,\n${me}`;
  } else if (kind === "open_escrow" && o.letter) {
    subject = o.letter.subject;
    body = o.letter.body;
  } else if (kind === "payoffs") {
    const items = (f.title?.items ?? []).filter((x) => x.payoff && x.status === "open");
    subject = `Payoffs needed for closing: ${where}`;
    body = `${hi}\n\nThe title commitment${f.title?.commitmentDate ? ` dated ${f.title.commitmentDate}` : ""} for ${where} shows these to be paid off or released at closing:\n\n${items.map((x) => `- ${x.text}`).join("\n")}\n\nCould you order the payoff statements and let me know if title or escrow needs anything from our side?${closing}\n\nThank you,\n${me}`;
  } else {
    return f;
  }
  const cap = DRAFT_CAP[kind];
  const d: Draft = { id: rid("dr"), to: role, toName: to?.name ?? "", toEmail: to?.email ?? "", subject, body, kind, status: "draft", createdAt: iso(now), sentAt: null, cap, mode: "approve", sendAfter: null, approvedBy: null };
  return { ...f, drafts: [d, ...f.drafts].slice(0, 30) };
}

export const DRAFT_KINDS = ["escrow_fees", "open_title", "open_escrow", "payoffs"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export async function makeDraft(user: User, loanId: string, kind: DraftKind, now = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  if (kind === "payoffs" && !(ctx.file.title?.items ?? []).some((x) => x.payoff && x.status === "open")) return { ok: false, error: "The title commitment shows nothing open to pay off." };
  const c = ctx.loan.contactId ? await contactStore().get(ctx.loan.contactId) : null;
  // D70: opening escrow uses the Open escrow letter from the forms library (loaded here: forms imports this file).
  let letter: DraftOpts["letter"];
  if (kind === "open_escrow") {
    const { letterDraft } = await import("@/lib/forms/service");
    const l = await letterDraft(user, loanId, "escrow_open", now).catch(() => null);
    if (!l) return { ok: false, error: "Couldn't write the Open escrow letter." };
    letter = { subject: l.title, body: l.body };
  }
  const f = draftFor(ctx.file, kind, user, now, { purpose: purposeKind(ctx.loan, ctx.file), leSent: !!ctx.journey.dates.leSentOn, borrower: c ? `${c.firstName} ${c.lastName}`.trim() || ctx.loan.borrowerName : ctx.loan.borrowerName, letter });
  await loaStore().putFile({ ...f, updatedAt: iso(now) });
  return { ok: true, id: f.drafts.find((d) => d.kind === kind && d.status === "draft")!.id };
}

export type PartySender = (user: User, to: string, subject: string, text: string, attachments?: Attachment[]) => Promise<{ ok: boolean; via: string; error?: string }>;

/** From the loan officer's own mailbox when it's connected; otherwise from Command Center with replies to them. */
export const realPartySender: PartySender = async (user, to, subject, text, attachments) => {
  const m = mloById(user.mloId);
  const r = await sendFromMailbox(user, { fromName: m?.name ?? user.name, to, subject, text, attachments }).catch(() => null);
  if (r?.ok) return { ok: true, via: r.from };
  if (r && !r.ok && r.reconnect) return { ok: false, via: "", error: r.error };
  const ok = await resendMail({ to, subject, text, replyTo: user.email, attachments });
  return ok ? { ok: true, via: "Command Center (replies to you)" } : { ok: false, via: "", error: "Email isn't set up yet. Connect your mailbox on the Email page." };
};

/** Sends a draft the loan officer reviewed (they can edit the address, subject and words first). */
export async function sendDraft(user: User, loanId: string, draftId: string, edits: { to: string; subject: string; body: string }, now = new Date(), send: PartySender = realPartySender): Promise<{ ok: true; via: string } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  const d = ctx?.file.drafts.find((x) => x.id === draftId);
  if (!ctx || !d || d.status !== "draft") return { ok: false, error: "That draft isn't waiting to go." };
  const to = edits.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) return { ok: false, error: "Add their email address." };
  const subject = edits.subject.replace(/\s+/g, " ").trim().slice(0, 120);
  const body = edits.body.replace(/\r\n/g, "\n").trim().slice(0, 6000);
  if (!subject || body.length < 10) return { ok: false, error: "Write a subject and a message." };
  const sig = await signatureFor(user).catch(() => "");
  const r = await send(user, to, subject, sig ? `${body}\n\n${sig}` : body);
  if (!r.ok) return { ok: false, error: r.error ?? "It didn't go out." };
  let f: LoaFile = { ...ctx.file, drafts: ctx.file.drafts.map((x) => (x.id === draftId ? { ...x, toEmail: to, subject, body, status: "sent", sentAt: iso(now), approvedBy: user.email } : x)) };
  if (d.kind === "payoffs") f = { ...f, title: f.title ? { ...f.title, items: f.title.items.map((x) => (x.payoff && x.status === "open" ? { ...x, status: "payoff_requested" } : x)) } : null };
  if (d.kind === "open_title") f = { ...f, checks: { ...f.checks, title_opened: { done: true, at: iso(now), by: user.email } } };
  f = recompute(log(f, `Sent "${subject}" to ${to}.`, now), ctx.loan, ctx.journey, now);
  await loaStore().putFile({ ...f, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.send", detail: { loanId, kind: d.kind, cap: d.cap ?? null } });
  return { ok: true, via: r.via };
}

export async function discardDraft(user: User, loanId: string, draftId: string, now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return false;
  await loaStore().putFile({ ...ctx.file, drafts: ctx.file.drafts.map((x) => (x.id === draftId && x.status === "draft" ? { ...x, status: "discarded" } : x)), updatedAt: iso(now) });
  return true;
}

// ---- What needs the loan officer ----

/** D70: `kind: "draft"` is a prepared message waiting for Approve (the team shows it as "Needs your OK"). */
export type LoaTask = { loanId: string; borrower: string; title: string; why: string; due: string | null; urgent: boolean; kind: "task" | "draft"; href: string; top?: boolean };

/** The book an LOA list covers: the loan officer's own, or for an assistant the one they work. */
const loaBook = (user: User) => (user.role === "assistant" ? bookOf(user) : user.id);

/** Everything across their open loans that needs a person, soonest first. */
export async function loaTasks(user: User, now = new Date()): Promise<LoaTask[]> {
  const t = today(now);
  const loans = (await pipelineStore().list(loaBook(user)).catch(() => [])).filter((l) => !l.closed && !l.dead);
  const out: LoaTask[] = [];
  for (const loan of loans) {
    const [file0, j0] = await Promise.all([loaStore().file(loan.id), journeyStore().get(loan.id)]);
    const j = j0 ?? emptyJourney(loan.id, loan.ownerUserId);
    const f = recompute(file0 ?? emptyFile(loan.id, loan.ownerUserId), loan, j, now);
    const at = `/mlo/pipeline/${encodeURIComponent(loan.id)}#loa`;
    const push = (title: string, why: string, due: string | null = null, extra: Partial<LoaTask> = {}) => out.push({ loanId: loan.id, borrower: loan.borrowerName, title, why, due, urgent: !!due && daysUntil(due, t) <= 2, kind: "task", href: at, ...extra });
    // D70: the wire-fraud hold comes first.
    if (f.hold) push(`${PARTY_LABELS[f.hold.role].replace(/ officer$/, "")}'s email changed`, `${f.hold.reason} Call them at a number you already have before anything goes out.`, null, { urgent: true, top: true });
    for (const d of f.deadlines) {
      if (d.done || d.key === "closing") continue;
      const n = daysUntil(d.date, t);
      if (n < 0) push(`Past due: ${d.label}`, `It was ${d.date}.`, d.date);
      else if (n <= 5) push(d.label, n === 0 ? "Today." : `In ${n} day${n === 1 ? "" : "s"} (${d.date}).`, d.date);
    }
    const sign = signingDate(f, j, loan);
    if (isDate(loan.keyDates.lockExpires) && isDate(sign) && loan.keyDates.lockExpires < sign) push("The lock runs out before closing", `Lock ${loan.keyDates.lockExpires}, closing ${sign}: extend it or move the date.`, loan.keyDates.lockExpires);
    for (const d of f.drafts.filter((x) => x.status === "draft")) push(`Review and send: ${d.subject}`, `Drafted for the ${PARTY_LABELS[d.to].toLowerCase()}.`, null, { kind: "draft", href: "/mlo/loa#needs" });
    const mine = f.conditions.filter((c) => c.owner === "loan_officer" && c.status === "open");
    if (mine.length) push(`${mine.length} condition${mine.length === 1 ? "" : "s"} for you`, mine.slice(0, 2).map((c) => c.text).join("; "));
    if (f.contract && !f.checks.escrow_fees?.done && !f.drafts.some((d) => d.kind === "escrow_fees")) push("Ask escrow for their fees", "The contract is in; the Loan Estimate needs escrow's fees.");
    if (f.contract && !f.checks.title_opened?.done && !f.drafts.some((d) => d.kind === "open_title")) push("Open title", "The contract is in and title isn't opened yet.");
    if (f.review?.length) push(`Review ${f.review.length} change${f.review.length === 1 ? "" : "s"} from a new document`, f.review.slice(0, 2).map((r) => r.label).join("; "));
  }
  return out.sort((a, b) => Number(!!b.top) - Number(!!a.top) || Number(b.urgent) - Number(a.urgent) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

// ---- D70: the switches ----

/** Automations recipes that are the same switch as an LOA row (one setting, not two). */
const SHARED: { cap: CapKey; prefix: string }[] = [
  { cap: "client_updates", prefix: "borrower_" },
  { cap: "agent_updates", prefix: "agent_" },
];

/** A loan officer's switches, with the client and agent update rows read from Automations. */
export async function autonomyOf(ownerUserId: string): Promise<LoaAutonomy> {
  const a = await loaStore().autonomy(ownerUserId);
  const auto = await automationStore().settings(ownerUserId).catch(() => null);
  if (!auto) return a;
  const modes: Modes = { purchase: { ...a.modes.purchase }, refi: { ...a.modes.refi } };
  for (const { cap, prefix } of SHARED) {
    const on = auto.enabled.some((id) => id.startsWith(prefix));
    const allOff = PURPOSES.every((t) => a.modes[t][cap] === "off");
    for (const t of PURPOSES) {
      if (!on) modes[t][cap] = "off";
      else if (allOff) modes[t][cap] = "approve";
    }
  }
  return { ...a, modes };
}

export async function switchesFor(ownerUserId: string): Promise<SwitchSettings> {
  const a = await autonomyOf(ownerUserId).catch(() => null);
  return a ? { modes: a.modes, pausedUntil: a.pausedUntil } : { modes: { purchase: {}, refi: {} }, pausedUntil: null };
}

async function syncAutomations(owner: string, modes: Modes, changed: string[], now: Date) {
  const store = automationStore();
  const s = await store.settings(owner);
  let enabled = [...s.enabled];
  for (const { cap, prefix } of SHARED) {
    if (!changed.some((k) => k.endsWith(`.${cap}`))) continue;
    const want = PURPOSES.some((t) => capByKey(cap).applies[t] && officerMode(capByKey(cap), t, modes) !== "off");
    const on = enabled.some((id) => id.startsWith(prefix));
    if (!want && on) enabled = enabled.filter((id) => !id.startsWith(prefix));
    if (want && !on) enabled = [...enabled, ...RECIPES.filter((r) => r.id.startsWith(prefix)).map((r) => r.id)];
  }
  if (enabled.join() !== s.enabled.join()) await store.putSettings({ ...s, enabled, updatedAt: iso(now) });
}

export type SaveResult = { ok: true; changed: number } | { ok: false; error: string };

/** Saves the officer's switches. Only that loan officer (never an assistant); the audit keeps the changed keys only. */
export async function saveAutonomy(user: User, input: Partial<Record<Purpose, Record<string, unknown>>>, now = new Date()): Promise<SaveResult> {
  if (!canChangeSwitches(user, user.id)) return { ok: false, error: "Only the loan officer can change the switches." };
  const before = await autonomyOf(user.id);
  const cleaned = cleanModes(input);
  // Keep anything the form didn't send (a row added later) as it was.
  const modes: Modes = { purchase: { ...before.modes.purchase, ...cleaned.purchase }, refi: { ...before.modes.refi, ...cleaned.refi } };
  const changed = changedKeys(before.modes, modes);
  const raw = await loaStore().autonomy(user.id);
  await loaStore().putAutonomy({ ...raw, modes, updatedAt: iso(now) });
  await syncAutomations(user.id, modes, changed, now);
  if (changed.length) await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.autonomy", detail: { keys: changed.join(",").slice(0, 900), count: changed.length } });
  return { ok: true, changed: changed.length };
}

export async function applyPreset(user: User, preset: Preset, now = new Date()): Promise<SaveResult> {
  return saveAutonomy(user, presetModes(preset), now);
}

/** The officer's switches as their loans see them, for the loan's officer. */
export async function loanSwitches(user: User, loanId: string, now = new Date()) {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return null;
  return { ...ctx, settings: await switchesFor(ctx.loan.ownerUserId), purpose: purposeKind(ctx.loan, ctx.file), canEdit: canChangeSwitches(user, ctx.loan.ownerUserId), now };
}

/** "Just this loan": "inherit" clears a task back to the officer's setting. */
export async function setLoanAutonomy(user: User, loanId: string, input: Record<string, unknown>, now = new Date()): Promise<SaveResult> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  if (!canChangeSwitches(user, ctx.loan.ownerUserId)) return { ok: false, error: "Only this loan's loan officer can change its switches." };
  const purpose = purposeKind(ctx.loan, ctx.file);
  const next: Partial<Record<CapKey, Mode>> = { ...(ctx.file.autonomy ?? {}) };
  const keys: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (!isCapKey(k)) continue;
    const c = capByKey(k);
    if (purpose && !c.applies[purpose]) continue;
    const was = next[k];
    if (v === "inherit") delete next[k];
    else if (isMode(v)) next[k] = purpose ? lowest(v, c.max[purpose]) : v;
    if (next[k] !== was) keys.push(k);
  }
  await loaStore().putFile({ ...ctx.file, autonomy: next, updatedAt: iso(now) });
  if (keys.length) await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.autonomy", detail: { loanId, keys: keys.join(","), count: keys.length } });
  return { ok: true, changed: keys.length };
}

export async function setLoanPaused(user: User, loanId: string, paused: boolean, now = new Date()): Promise<SaveResult> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  if (!canChangeSwitches(user, ctx.loan.ownerUserId)) return { ok: false, error: "Only this loan's loan officer can change its switches." };
  await loaStore().putFile({ ...log({ ...ctx.file, paused }, paused ? "Paused on this loan." : "Resumed on this loan.", now), updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.autonomy", detail: { loanId, keys: "paused", count: 1 } });
  return { ok: true, changed: 1 };
}

/** The loan officer's answer when the loan system doesn't say purchase or refinance. */
export async function setPurpose(user: User, loanId: string, purpose: Purpose, now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  if (!ctx || (purpose !== "purchase" && purpose !== "refi")) return false;
  await loaStore().putFile({ ...log({ ...ctx.file, purposeOverride: purpose }, `Marked as a ${purpose === "refi" ? "refinance" : "purchase"}.`, now), updatedAt: iso(now) });
  return true;
}

/** D70: an answer to "What the contract didn't answer". Typed by the loan officer, so a typed email is confirmed. */
export async function answerFact(user: User, loanId: string, key: FactKey, value: string | boolean, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  if (!(key in FACT_WORDS)) return { ok: false, error: "Pick a question." };
  if (key === "hoa") {
    if (typeof value !== "boolean") return { ok: false, error: "Pick yes or no." };
    await loaStore().putFile({ ...log({ ...ctx.file, hoa: value }, value ? "There's an HOA." : "No HOA.", now), updatedAt: iso(now) });
    return { ok: true };
  }
  const v = String(value).trim();
  if (!v) return { ok: false, error: "Type an answer first." };
  const map: Record<Exclude<FactKey, "hoa">, { role: PartyRole; field: "company" | "email" }> = {
    escrow_company: { role: "escrow", field: "company" }, escrow_email: { role: "escrow", field: "email" },
    title_company: { role: "title", field: "company" }, title_email: { role: "title", field: "email" },
    insurance_email: { role: "insurance", field: "email" }, lender: { role: "lender", field: "company" },
  };
  const m = map[key];
  const cur: Party = ctx.file.parties.find((p) => p.role === m.role) ?? { role: m.role, company: "", name: "", email: "", phone: "", source: "lo", confirmedAt: null, confirmedBy: null };
  if (m.field === "email") {
    if (!EMAIL.test(v)) return { ok: false, error: "That email doesn't look right." };
    return setParty(user, loanId, { ...cur, email: v.toLowerCase() }, now);
  }
  // A company name doesn't confirm anyone's email.
  const f = { ...ctx.file, parties: [...ctx.file.parties.filter((p) => p.role !== m.role), { ...cur, company: v.slice(0, 120) }] };
  await loaStore().putFile({ ...log(f, `${PARTY_LABELS[m.role]}: ${v.slice(0, 120)}.`, now), updatedAt: iso(now) });
  return { ok: true };
}

// ---- D70: one approval queue ----

export type QueueItem = { loanId: string; borrower: string; draft: Draft };
export type QueueProposal = { id: string; name: string; purpose: string; body: string; source: string };

/** Every prepared message waiting for a tap, plus the Concierge drafts to clients and agents. */
export async function loaQueue(user: User): Promise<{ drafts: QueueItem[]; proposals: QueueProposal[] }> {
  const book = loaBook(user);
  const loans = (await pipelineStore().list(book).catch(() => [])).filter((l) => !l.closed && !l.dead);
  const drafts: QueueItem[] = [];
  for (const loan of loans) {
    const f = await loaStore().file(loan.id).catch(() => null);
    for (const d of f?.drafts ?? []) if (d.status === "draft") drafts.push({ loanId: loan.id, borrower: loan.borrowerName, draft: d });
  }
  drafts.sort((a, b) => b.draft.createdAt.localeCompare(a.draft.createdAt));
  const owner = book ?? user.id;
  const pend = await conciergeStore().proposals(owner, "pending").catch(() => []);
  const proposals: QueueProposal[] = [];
  for (const p of pend.slice(0, 12)) {
    const c = await contactStore().get(p.contactId).catch(() => null);
    proposals.push({ id: p.id, name: c ? `${c.firstName} ${c.lastName}`.trim() || "A contact" : "A contact", purpose: p.purpose, body: p.body, source: p.source });
  }
  return { drafts, proposals };
}

/** Approve & send: the draft as it stands, to its saved address. Assistants may approve. */
export async function approveLoaDraft(user: User, loanId: string, draftId: string, now = new Date(), send: PartySender = realPartySender): Promise<{ ok: true; via: string } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  const d = ctx?.file.drafts.find((x) => x.id === draftId);
  if (!ctx || !d || d.status !== "draft") return { ok: false, error: "That draft isn't waiting to go." };
  if (!d.toEmail) {
    const p = ctx.file.parties.find((x) => x.role === d.to);
    if (!p?.email) return { ok: false, error: "Add their email on the loan first." };
    return sendDraft(user, loanId, draftId, { to: p.email, subject: d.subject, body: d.body }, now, send);
  }
  return sendDraft(user, loanId, draftId, { to: d.toEmail, subject: d.subject, body: d.body }, now, send);
}
