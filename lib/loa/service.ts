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
import { contactStore } from "@/lib/contacts/store";
import { loanFor } from "@/lib/journey/engine";
import { addDocs } from "@/lib/journey/docs";
import { journeyStore, emptyJourney, type Journey } from "@/lib/journey/store";
import { pipelineStore, type Loan } from "@/lib/pipeline/store";
import { sendFromMailbox } from "@/lib/mail/service";
import { resendMail } from "@/lib/pilot/service";
import { signatureFor } from "@/lib/profile/signature";
import { cdReceivedBy, cdSendBy, daysUntil, isDate, leDueBy, voeWindowOpens } from "./dates";
import { readDoc, type DocCall, type DocKind, type Read } from "./readers";
import { CHECKS, emptyFile, loaStore, PARTY_ROLES, type CheckKey, type Condition, type Deadline, type Draft, type LoaFile, type Party, type PartyRole, type TitleItem } from "./store";

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

function mergeParties(old: Party[], found: Party[]): Party[] {
  const out = [...old];
  for (const p of found) {
    if (!p.company && !p.name && !p.email) continue;
    const i = out.findIndex((x) => x.role === p.role);
    const clean: Party = { role: p.role, company: p.company.trim(), name: p.name.trim(), email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(p.email.trim()) ? p.email.trim().toLowerCase() : "", phone: p.phone.replace(/[^\d+()\-. ]/g, "").trim() };
    if (i < 0) out.push(clean);
    else out[i] = { ...out[i], ...Object.fromEntries(Object.entries(clean).filter(([, v]) => v)) } as Party;
  }
  return out;
}

const dateOrNull = (s: string | null | undefined) => (isDate(s) ? s : null);

/** Reads one document and puts what it says on the file. */
export async function readIntoFile(user: User, loanId: string, kind: DocKind, input: { pdf?: Uint8Array | null; text?: string }, now = new Date(), call?: DocCall | null): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  const r = await readDoc(user, kind, input, call);
  if (!r.ok) return r;
  let f = ctx.file;
  let summary = "";
  if (kind === "purchase_agreement") {
    const d = r.data as Read<"purchase_agreement">;
    f = {
      ...f,
      contract: {
        price: d.price, sellerCredits: d.sellerCredits, earnestMoney: d.earnestMoney, property: d.property,
        mutualAcceptance: dateOrNull(d.mutualAcceptance), earnestMoneyDue: dateOrNull(d.earnestMoneyDue), inspectionEnds: dateOrNull(d.inspectionEnds),
        financingContingencyEnds: dateOrNull(d.financingContingencyEnds), appraisalContingencyEnds: dateOrNull(d.appraisalContingencyEnds), closingDate: dateOrNull(d.closingDate), possession: dateOrNull(d.possession),
        notes: d.notes,
      },
      parties: mergeParties(f.parties, d.parties as Party[]),
      checks: { ...f.checks, contract: { done: true, at: iso(now), by: "LOA" } },
    };
    const dates = [d.closingDate && `closing ${d.closingDate}`, d.financingContingencyEnds && `financing contingency ${d.financingContingencyEnds}`].filter(Boolean);
    summary = `Purchase agreement read: ${money(d.price) || "price not found"}${dates.length ? `, ${dates.join(", ")}` : ""}. ${d.parties.length} parties on the file.`;
  } else if (kind === "title_commitment") {
    const d = r.data as Read<"title_commitment">;
    const items: TitleItem[] = d.items.map((x) => ({ id: rid("ti"), kind: x.kind, text: x.text, payoff: x.payoff, status: "open" }));
    f = { ...f, title: { commitmentDate: dateOrNull(d.commitmentDate), vesting: d.vesting, items, receivedAt: iso(now) }, checks: { ...f.checks, title_reviewed: { done: true, at: iso(now), by: "LOA" }, title_opened: f.checks.title_opened ?? { done: true, at: iso(now), by: "LOA", note: "commitment received" } } };
    const pay = items.filter((x) => x.payoff).length;
    summary = `Title commitment read: ${items.length} items, ${pay ? `${pay} to pay off or release at closing` : "nothing to pay off"}.`;
    if (pay) f = draftFor(f, "payoffs", user, now);
  } else if (kind === "conditional_approval") {
    const d = r.data as Read<"conditional_approval">;
    const have = new Set(f.conditions.map((c) => c.text.toLowerCase()));
    const fresh: Condition[] = d.conditions.filter((c) => !have.has(c.text.toLowerCase())).map((c) => ({ id: rid("cd"), text: c.text, owner: c.owner, priorTo: c.priorTo, status: "open" }));
    f = { ...f, conditions: [...f.conditions, ...fresh], approvalReceivedAt: iso(now), parties: d.lender ? mergeParties(f.parties, [{ role: "lender", company: d.lender, name: "", email: "", phone: "" }]) : f.parties };
    // The borrower's items join the document checklist, so the existing upload request covers them.
    const borrower = fresh.filter((c) => c.owner === "borrower");
    if (borrower.length) await addDocs(user, loanId, borrower.map((c) => ({ name: c.text.slice(0, 160), why: "Conditional approval", phase: "final" as const })), now).catch(() => 0);
    const by = (o: Condition["owner"]) => fresh.filter((c) => c.owner === o).length;
    summary = `Conditional approval read: ${fresh.length} conditions (${by("borrower")} from the borrower, ${by("third_party")} from third parties, ${by("loan_officer")} for you, ${by("lender")} the lender's own).${d.expires ? ` The approval expires ${d.expires}.` : ""}`;
    if (d.expires && isDate(d.expires)) f = { ...f, deadlines: [...f.deadlines.filter((x) => x.key !== "approval_expires"), { key: "approval_expires", label: "Conditional approval expires", date: d.expires, source: "lender", done: false }] };
  } else {
    const d = r.data as Read<"escrow_fees">;
    f = { ...f, escrowFees: { from: d.from, total: d.total, lines: d.lines, receivedAt: iso(now) }, parties: d.from ? mergeParties(f.parties, [{ role: "escrow", company: d.from, name: "", email: "", phone: "" }]) : f.parties, checks: { ...f.checks, escrow_fees: { done: true, at: iso(now), by: "LOA" } } };
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
  if (p.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(p.email.trim())) return { ok: false, error: "That email doesn't look right." };
  const parties = [...ctx.file.parties.filter((x) => x.role !== p.role), { role: p.role, company: p.company.trim().slice(0, 120), name: p.name.trim().slice(0, 80), email: p.email.trim().toLowerCase(), phone: p.phone.trim().slice(0, 30) }];
  await loaStore().putFile({ ...ctx.file, parties, updatedAt: iso(now) });
  return { ok: true };
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

function draftFor(f: LoaFile, kind: Draft["kind"], user: Pick<User, "name" | "mloId">, now: Date, borrower = "our mutual client"): LoaFile {
  if (f.drafts.some((d) => d.kind === kind && d.status === "draft")) return f;
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
    subject = `Escrow fee estimate: ${where}`;
    body = `${hi}\n\nI'm the loan officer for ${borrower} on ${where}.${closing} Could you send your estimated escrow and settlement fees for the buyer, so I can get them into the Loan Estimate?\n\nThank you,\n${me}`;
  } else if (kind === "open_title") {
    subject = `Please open title: ${where}`;
    body = `${hi}\n\nPlease open title on ${where} for ${borrower}'s purchase.${closing} When it's ready, please send the preliminary title commitment and the closing protection letter.\n\nThank you,\n${me}`;
  } else if (kind === "payoffs") {
    const items = (f.title?.items ?? []).filter((x) => x.payoff && x.status === "open");
    subject = `Payoffs needed for closing: ${where}`;
    body = `${hi}\n\nThe title commitment${f.title?.commitmentDate ? ` dated ${f.title.commitmentDate}` : ""} for ${where} shows these to be paid off or released at closing:\n\n${items.map((x) => `- ${x.text}`).join("\n")}\n\nCould you order the payoff statements and let me know if title or escrow needs anything from our side?${closing}\n\nThank you,\n${me}`;
  } else {
    return f;
  }
  const d: Draft = { id: rid("dr"), to: role, toName: to?.name ?? "", toEmail: to?.email ?? "", subject, body, kind, status: "draft", createdAt: iso(now), sentAt: null };
  return { ...f, drafts: [d, ...f.drafts].slice(0, 30) };
}

export async function makeDraft(user: User, loanId: string, kind: "escrow_fees" | "open_title" | "payoffs", now = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  if (kind === "payoffs" && !(ctx.file.title?.items ?? []).some((x) => x.payoff && x.status === "open")) return { ok: false, error: "The title commitment shows nothing open to pay off." };
  const c = ctx.loan.contactId ? await contactStore().get(ctx.loan.contactId) : null;
  const f = draftFor(ctx.file, kind, user, now, c ? `${c.firstName} ${c.lastName}`.trim() || ctx.loan.borrowerName : ctx.loan.borrowerName);
  await loaStore().putFile({ ...f, updatedAt: iso(now) });
  return { ok: true, id: f.drafts.find((d) => d.kind === kind && d.status === "draft")!.id };
}

export type PartySender = (user: User, to: string, subject: string, text: string) => Promise<{ ok: boolean; via: string; error?: string }>;

/** From the loan officer's own mailbox when it's connected; otherwise from Command Center with replies to them. */
export const realPartySender: PartySender = async (user, to, subject, text) => {
  const m = mloById(user.mloId);
  const r = await sendFromMailbox(user, { fromName: m?.name ?? user.name, to, subject, text }).catch(() => null);
  if (r?.ok) return { ok: true, via: r.from };
  if (r && !r.ok && r.reconnect) return { ok: false, via: "", error: r.error };
  const ok = await resendMail({ to, subject, text, replyTo: user.email });
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
  let f: LoaFile = { ...ctx.file, drafts: ctx.file.drafts.map((x) => (x.id === draftId ? { ...x, toEmail: to, subject, body, status: "sent", sentAt: iso(now) } : x)) };
  if (d.kind === "payoffs") f = { ...f, title: f.title ? { ...f.title, items: f.title.items.map((x) => (x.payoff && x.status === "open" ? { ...x, status: "payoff_requested" } : x)) } : null };
  if (d.kind === "open_title") f = { ...f, checks: { ...f.checks, title_opened: { done: true, at: iso(now), by: user.email } } };
  f = recompute(log(f, `Sent "${subject}" to ${to}.`, now), ctx.loan, ctx.journey, now);
  await loaStore().putFile({ ...f, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.send", detail: { loanId, kind: d.kind } });
  return { ok: true, via: r.via };
}

export async function discardDraft(user: User, loanId: string, draftId: string, now = new Date()): Promise<boolean> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return false;
  await loaStore().putFile({ ...ctx.file, drafts: ctx.file.drafts.map((x) => (x.id === draftId && x.status === "draft" ? { ...x, status: "discarded" } : x)), updatedAt: iso(now) });
  return true;
}

// ---- What needs the loan officer ----

export type LoaTask = { loanId: string; borrower: string; title: string; why: string; due: string | null; urgent: boolean };

/** Everything across their open loans that needs a person, soonest first. */
export async function loaTasks(user: User, now = new Date()): Promise<LoaTask[]> {
  const t = today(now);
  const loans = (await pipelineStore().list(user.id).catch(() => [])).filter((l) => !l.closed && !l.dead);
  const out: LoaTask[] = [];
  for (const loan of loans) {
    const [file0, j0] = await Promise.all([loaStore().file(loan.id), journeyStore().get(loan.id)]);
    const j = j0 ?? emptyJourney(loan.id, loan.ownerUserId);
    const f = recompute(file0 ?? emptyFile(loan.id, loan.ownerUserId), loan, j, now);
    const push = (title: string, why: string, due: string | null = null) => out.push({ loanId: loan.id, borrower: loan.borrowerName, title, why, due, urgent: !!due && daysUntil(due, t) <= 2 });
    for (const d of f.deadlines) {
      if (d.done || d.key === "closing") continue;
      const n = daysUntil(d.date, t);
      if (n < 0) push(`Past due: ${d.label}`, `It was ${d.date}.`, d.date);
      else if (n <= 5) push(d.label, n === 0 ? "Today." : `In ${n} day${n === 1 ? "" : "s"} (${d.date}).`, d.date);
    }
    const sign = signingDate(f, j, loan);
    if (isDate(loan.keyDates.lockExpires) && isDate(sign) && loan.keyDates.lockExpires < sign) push("The lock runs out before closing", `Lock ${loan.keyDates.lockExpires}, closing ${sign}: extend it or move the date.`, loan.keyDates.lockExpires);
    for (const d of f.drafts.filter((x) => x.status === "draft")) push(`Review and send: ${d.subject}`, `Drafted for the ${PARTY_LABELS[d.to].toLowerCase()}.`);
    const mine = f.conditions.filter((c) => c.owner === "loan_officer" && c.status === "open");
    if (mine.length) push(`${mine.length} condition${mine.length === 1 ? "" : "s"} for you`, mine.slice(0, 2).map((c) => c.text).join("; "));
    if (f.contract && !f.checks.escrow_fees?.done && !f.drafts.some((d) => d.kind === "escrow_fees")) push("Ask escrow for their fees", "The contract is in; the Loan Estimate needs escrow's fees.");
    if (f.contract && !f.checks.title_opened?.done && !f.drafts.some((d) => d.kind === "open_title")) push("Open title", "The contract is in and title isn't opened yet.");
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}
