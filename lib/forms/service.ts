/**
 * lib/forms/service.ts — the LOA's forms side (D66). SERVER-ONLY.
 *
 *  - The library: blank forms a loan officer reuses (official forms, their
 *    title and escrow companies' forms, ARIVE downloads).
 *  - Each loan's forms: dropped in, filled from the file, or written as a
 *    letter from it.
 *  - Sending: picked forms go to escrow, title or anyone on the deal as
 *    attachments, from the loan officer's own mailbox when it's connected.
 * Command Center never puts a Social Security number, date of birth or
 * account number on a form, and won't keep a form that already has one in
 * its fields: signed borrower documents stay in the loan system.
 */
import { randomBytes } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { companyDetails } from "@/lib/accounts/company";
import { mloById } from "@/lib/config";
import { bookOf } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { loanFor } from "@/lib/journey/engine";
import { fileFor, realPartySender, type PartySender } from "@/lib/loa/service";
import { loaStore } from "@/lib/loa/store";
import { signatureFor } from "@/lib/profile/signature";
import { FORM_KINDS, letterByKind, SENSITIVE_FIELD, SSN_VALUE, suggest, type Facts, type FormKind, type LetterKind, type Suggestion } from "./catalog";
import { fillPdf, isPdf, makeLetterPdf, readFields, type PdfField } from "./pdf";
import { formStore, realBox, type FileBox, type FormDoc } from "./store";

export const MAX_FORM_BYTES = 4 * 1024 * 1024;
/** What one email can carry (Microsoft 365 takes about 3 MB of attachments in one send). */
export const MAX_SEND_BYTES = 3 * 1024 * 1024;
export const MAX_LIBRARY = 200;
export const MAX_PER_LOAN = 60;

const iso = (d: Date) => d.toISOString();
const rid = () => `fm_${randomBytes(8).toString("base64url")}`;
const money = (n: number | null | undefined) => (n == null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);
const usDate = (s: string | null | undefined) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
};
const todayUs = (now: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" }).format(now);
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Form";
const libraryOwner = (u: User) => bookOf(u) ?? u.id;

/** Can this user use the form? Loan forms follow the loan; library forms their owner's book. */
async function mayUse(user: User, f: FormDoc | null): Promise<boolean> {
  if (!f || user.status !== "active") return false;
  if (f.loanId) return !!(await loanFor(user, f.loanId));
  const book = bookOf(user);
  return book === undefined || f.ownerUserId === book;
}

export async function formFor(user: User, id: string): Promise<FormDoc | null> {
  const f = await formStore().get(id);
  return (await mayUse(user, f)) ? f : null;
}

export const libraryFor = (user: User) => formStore().list(libraryOwner(user), null);
export async function loanForms(user: User, loanId: string): Promise<FormDoc[]> {
  const loan = await loanFor(user, loanId);
  return loan ? formStore().list(loan.ownerUserId, loan.id) : [];
}

/** What the file says, for letters and for filling forms. */
export async function factsFor(user: User, loanId: string, now = new Date()): Promise<Facts | null> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return null;
  const { loan, file } = ctx;
  const owner = loan.ownerUserId === user.id ? user : ((await accountStore().userById(loan.ownerUserId)) ?? user);
  const m = mloById(owner.mloId);
  const co = companyDetails(m);
  const c = loan.contactId ? await contactStore().get(loan.contactId) : null;
  const p = file.contract?.property;
  const party = (role: string) => file.parties.find((x) => x.role === role);
  const first = c?.firstName ?? loan.borrowerName.split(" ")[0] ?? "";
  const last = c?.lastName ?? loan.borrowerName.split(" ").slice(1).join(" ");
  return {
    today: todayUs(now),
    borrowerName: (c ? `${c.firstName} ${c.lastName}` : loan.borrowerName).trim(),
    borrowerFirst: first,
    borrowerLast: last,
    borrowerEmail: c?.email ?? "",
    borrowerPhone: c?.phone ?? "",
    propertyStreet: p?.street ?? "",
    propertyCity: p?.city ?? "",
    propertyState: p?.state ?? "",
    propertyZip: p?.zip ?? "",
    propertyAddress: p ? [p.street, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
    purpose: loan.purpose ?? "",
    loanNumber: loan.externalId,
    loanAmount: money(loan.amount),
    salesPrice: money(file.contract?.price),
    closingDate: usDate(file.contract?.closingDate ?? loan.keyDates.closing),
    loName: m?.name ?? owner.name,
    loNmls: m?.nmls ?? "",
    loPhone: m?.phone ?? "",
    loEmail: owner.email,
    companyName: co.name,
    companyNmls: co.nmls,
    companyAddress: co.address,
    escrowCompany: party("escrow")?.company ?? "",
    escrowOfficer: party("escrow")?.name ?? "",
    escrowEmail: party("escrow")?.email ?? "",
    titleCompany: party("title")?.company ?? "",
    titleOfficer: party("title")?.name ?? "",
    titleEmail: party("title")?.email ?? "",
    lenderName: party("lender")?.company ?? "",
    insuranceAgent: [party("insurance")?.name, party("insurance")?.company].filter(Boolean).join(", "),
    buyerAgent: party("buyer_agent")?.name ?? loan.agentName ?? "",
    listingAgent: party("listing_agent")?.name ?? "",
    payoffs: (file.title?.items ?? []).filter((x) => x.payoff && x.status !== "cleared").map((x) => x.text.slice(0, 160)),
  };
}

async function save(user: User, doc: Omit<FormDoc, "id" | "ref" | "bytes" | "createdAt">, bytes: Uint8Array, now: Date, box: FileBox): Promise<FormDoc> {
  const id = rid();
  const ref = await box.put(id, doc.ownerUserId, bytes);
  const f: FormDoc = { ...doc, id, ref, bytes: bytes.length, createdAt: iso(now) };
  await formStore().put(f);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "forms.add", detail: { id, loanId: doc.loanId, source: doc.source, kind: doc.kind } });
  return f;
}

/** Fields that already hold a Social Security number. */
const ssnIn = (fields: PdfField[]) => fields.filter((x) => x.kind === "text" && x.value && SSN_VALUE.test(x.value.replace(/\s+/g, " "))).map((x) => x.name);

/** Drops a PDF into the library (loanId null) or onto one loan. */
export async function addForm(user: User, input: { loanId: string | null; name: string; kind: string; bytes: Uint8Array | null }, now = new Date(), box: FileBox = realBox()): Promise<{ ok: true; form: FormDoc } | { ok: false; error: string }> {
  const b = input.bytes;
  if (!b || !b.length) return { ok: false, error: "Choose a PDF." };
  if (b.length > MAX_FORM_BYTES) return { ok: false, error: "Keep each form under 4 MB." };
  if (!isPdf(b)) return { ok: false, error: "Forms need to be PDFs. Save a Word form as PDF first." };
  const kind = ((FORM_KINDS as readonly string[]).includes(input.kind) ? input.kind : "other") as FormKind;
  let owner = libraryOwner(user);
  if (input.loanId) {
    const loan = await loanFor(user, input.loanId);
    if (!loan) return { ok: false, error: "No such loan." };
    owner = loan.ownerUserId;
    if ((await formStore().list(owner, loan.id)).length >= MAX_PER_LOAN) return { ok: false, error: `Up to ${MAX_PER_LOAN} forms on one loan. Remove one first.` };
  } else if ((await formStore().list(owner, null)).length >= MAX_LIBRARY) return { ok: false, error: `Up to ${MAX_LIBRARY} forms in your library. Remove one first.` };
  let fields: PdfField[];
  try {
    fields = await readFields(b);
  } catch (e) {
    return { ok: false, error: /encrypt/i.test(e instanceof Error ? e.message : "") ? "That PDF is locked with a password. Save an unlocked copy and drop it again." : "That PDF couldn't be read. Try saving it again as a PDF." };
  }
  if (ssnIn(fields).length) return { ok: false, error: "That form already has a Social Security number filled in. Command Center doesn't keep those: keep signed borrower forms in your loan system, and drop the blank form here." };
  const name = cleanName(input.name.replace(/\.pdf$/i, ""));
  const form = await save(user, { ownerUserId: owner, loanId: input.loanId, name, kind, source: "upload", fields: fields.filter((x) => x.kind !== "other").map((x) => x.name).slice(0, 400), fromId: null }, b, now, box);
  return { ok: true, form };
}

/** A letter's starting words, from the file. */
export async function letterDraft(user: User, loanId: string, kind: string, now = new Date()): Promise<{ title: string; body: string; label: string; about: string } | null> {
  const l = letterByKind(kind);
  const f = l ? await factsFor(user, loanId, now) : null;
  return l && f ? { title: l.title(f), body: l.body(f), label: l.label, about: l.about } : null;
}

/** Saves the letter the loan officer read and edited, as a PDF on their letterhead. */
export async function makeLetter(user: User, loanId: string, kind: string, edits: { title: string; body: string }, now = new Date(), box: FileBox = realBox()): Promise<{ ok: true; form: FormDoc } | { ok: false; error: string }> {
  const l = letterByKind(kind);
  if (!l) return { ok: false, error: "Pick a letter." };
  const loan = await loanFor(user, loanId);
  const f = loan ? await factsFor(user, loanId, now) : null;
  if (!loan || !f) return { ok: false, error: "No such loan." };
  const title = edits.title.replace(/\s+/g, " ").trim().slice(0, 140) || l.title(f);
  const body = edits.body.replace(/\r\n/g, "\n").trim().slice(0, 12_000);
  if (body.length < 20) return { ok: false, error: "The letter is empty." };
  if (SSN_VALUE.test(body)) return { ok: false, error: "Take the Social Security number out: the borrower writes it on the signed copy." };
  if ((await formStore().list(loan.ownerUserId, loan.id)).length >= MAX_PER_LOAN) return { ok: false, error: `Up to ${MAX_PER_LOAN} forms on one loan. Remove one first.` };
  const bytes = await makeLetterPdf({ name: f.loName, nmls: f.loNmls, company: f.companyName, companyNmls: f.companyNmls, address: f.companyAddress, phone: f.loPhone, email: f.loEmail }, title, body, now);
  const form = await save(user, { ownerUserId: loan.ownerUserId, loanId: loan.id, name: cleanName(`${l.label} - ${f.borrowerLast || f.borrowerName || loan.externalId}`), kind: l.formKind, source: "letter", fields: [], fromId: null }, bytes, now, box);
  return { ok: true, form };
}

export type FillField = PdfField & Suggestion;

/** A fillable form's fields, each with what the file suggests. */
export async function fillPlan(user: User, formId: string, loanId: string, now = new Date(), box: FileBox = realBox()): Promise<{ form: FormDoc; fields: FillField[] } | null> {
  const form = await formFor(user, formId);
  const facts = form ? await factsFor(user, loanId, now) : null;
  if (!form || !facts) return null;
  const bytes = await box.get(form.ref);
  if (!bytes) return null;
  const fields = (await readFields(bytes)).filter((x) => x.kind !== "other");
  return { form, fields: fields.map((x) => ({ ...x, ...suggest(x.name, facts), ...(x.value && !SENSITIVE_FIELD.test(x.name.toLowerCase().replace(/[^a-z0-9#]/g, "")) ? { value: x.value } : {}) })) };
}

/** Fills a copy for this loan with the values the loan officer checked. */
export async function saveFilled(user: User, formId: string, loanId: string, values: Record<string, string>, now = new Date(), box: FileBox = realBox()): Promise<{ ok: true; form: FormDoc; filled: number } | { ok: false; error: string }> {
  const plan = await fillPlan(user, formId, loanId, now, box);
  const loan = plan ? await loanFor(user, loanId) : null;
  if (!plan || !loan) return { ok: false, error: "That form or loan isn't available." };
  const clean: Record<string, string> = {};
  for (const f of plan.fields) {
    if (f.sensitive || !(f.name in values)) continue;
    const v = String(values[f.name] ?? "").slice(0, 500);
    if (SSN_VALUE.test(v)) return { ok: false, error: `Take the Social Security number out of "${f.name}": the borrower fills that in.` };
    clean[f.name] = v;
  }
  if ((await formStore().list(loan.ownerUserId, loan.id)).length >= MAX_PER_LOAN) return { ok: false, error: `Up to ${MAX_PER_LOAN} forms on one loan. Remove one first.` };
  const src = await box.get(plan.form.ref);
  if (!src) return { ok: false, error: "The form's file couldn't be read." };
  const out = await fillPdf(src, clean);
  const facts = await factsFor(user, loanId, now);
  const form = await save(user, { ownerUserId: loan.ownerUserId, loanId: loan.id, name: cleanName(`${plan.form.name} - ${facts?.borrowerLast || loan.externalId}`), kind: plan.form.kind, source: "filled", fields: plan.form.fields, fromId: plan.form.id }, out.bytes, now, box);
  return { ok: true, form, filled: out.filled };
}

export async function removeForm(user: User, id: string, now = new Date(), box: FileBox = realBox()): Promise<boolean> {
  const f = await formFor(user, id);
  if (!f) return false;
  await box.del(f.ref).catch((e) => console.warn(`[forms] delete failed: ${e instanceof Error ? e.name : "error"}`));
  await formStore().remove(id);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "forms.remove", detail: { id, loanId: f.loanId } });
  return true;
}

/** The file, for the signed-in download route. */
export async function formBytes(user: User, id: string, box: FileBox = realBox()): Promise<{ form: FormDoc; bytes: Uint8Array } | null> {
  const form = await formFor(user, id);
  const bytes = form ? await box.get(form.ref) : null;
  return form && bytes ? { form, bytes } : null;
}

/** Emails picked forms to someone on the deal (escrow, title, the borrower), from the loan officer's mailbox when it's connected. */
export async function sendForms(user: User, loanId: string, input: { to: string; subject: string; body: string; formIds: string[] }, now = new Date(), send: PartySender = realPartySender, box: FileBox = realBox()): Promise<{ ok: true; via: string; count: number } | { ok: false; error: string }> {
  const ctx = await fileFor(user, loanId);
  if (!ctx) return { ok: false, error: "No such loan." };
  const to = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) return { ok: false, error: "Add their email address." };
  const subject = input.subject.replace(/\s+/g, " ").trim().slice(0, 120);
  const body = input.body.replace(/\r\n/g, "\n").trim().slice(0, 6000);
  if (!subject || body.length < 5) return { ok: false, error: "Write a subject and a message." };
  const ids = [...new Set(input.formIds)].slice(0, 10);
  if (!ids.length) return { ok: false, error: "Tick at least one form to attach." };
  const files: { filename: string; contentType: string; content: Uint8Array }[] = [];
  for (const id of ids) {
    const f = await formFor(user, id);
    if (!f || f.loanId !== ctx.loan.id) return { ok: false, error: "One of those forms isn't on this loan." };
    const bytes = await box.get(f.ref);
    if (!bytes) return { ok: false, error: `"${f.name}" couldn't be read.` };
    files.push({ filename: `${f.name}.pdf`, contentType: "application/pdf", content: bytes });
  }
  if (files.reduce((n, f) => n + f.content.length, 0) > MAX_SEND_BYTES) return { ok: false, error: "Those forms are too big for one email (3 MB). Send them in two emails." };
  const sig = await signatureFor(user).catch(() => "");
  const r = await send(user, to, subject, sig ? `${body}\n\n${sig}` : body, files);
  if (!r.ok) return { ok: false, error: r.error ?? "It didn't go out." };
  const f = ctx.file;
  await loaStore().putFile({ ...f, log: [...f.log, { at: iso(now), text: `Sent ${files.length} form${files.length === 1 ? "" : "s"} ("${subject}") to ${to}.` }].slice(-60), updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "forms.send", detail: { loanId, count: files.length } });
  return { ok: true, via: r.via, count: files.length };
}
