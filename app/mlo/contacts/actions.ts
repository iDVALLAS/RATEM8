"use server";

import { draftClientLink } from "@/lib/clientpage/draft";
import { rotateLink } from "@/lib/clientpage/service";
import { debrief } from "@/lib/concierge/debrief";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLine, recordDnc, sendText, recordRnd } from "@/lib/messaging/service";
import { sendEmail } from "@/lib/messaging/email";
import { z } from "zod";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { canSee, deleteContact, importBatch, ImportRefused, MAX_BATCH, recordConsent, unlockAllHeld, type ImportResult } from "@/lib/contacts/service";
import { addBatchCounts, checkExisting, finishImport, getImport, MAX_SKIPPED_CSV, runForBatch, startImport, undoImport, type ExistingCheck } from "@/lib/contacts/imports";
import { REIMPORT_MODES } from "@/lib/contacts/reimport";
import { contactsImportCopy } from "@/lib/content/contacts-import";
import { importIssueText } from "@/lib/contacts/issues";
import { onContactReply } from "@/lib/campaigns/service";
import { contactStore } from "@/lib/contacts/store";
import { UNLOCK_ATTESTATION } from "@/lib/contacts/attestation";
import { CHANNELS, EVIDENCE, PROVENANCE, PURPOSES } from "@/lib/contacts/store";
import { bulkTags, deleteTag, MAX_BULK_IDS, mergeTag, renameTag, setContactTags } from "@/lib/contacts/tagging";
import { cleanTag, MAX_CONTACT_TAGS } from "@/lib/contacts/tags";
import { contactTagsCopy } from "@/lib/content/contact-tags";
import { contactPageCopy } from "@/lib/content/contact-page";
import { addContact, addNote, addToCampaign, logDial, mergeContacts, remindMe, updateContact } from "@/lib/contacts/manage";
import { nameOf } from "@/lib/contacts/merge";

const n = z.number().finite().nullable();
const s = (max: number) => z.string().max(max);
const Record_ = z.object({
  firstName: s(60),
  lastName: s(80),
  email: s(254).nullable(),
  phone: z.string().regex(/^\+1\d{10}$/).nullable(),
  phone2: z.string().regex(/^\+1\d{10}$/).nullable(),
  street: s(120).nullable(),
  city: s(60).nullable(),
  state: z.string().regex(/^[A-Z]{2}$/).nullable(),
  zip: s(10).nullable(),
  relationship: z.enum(["past_client", "lead", "sphere", "agent", "other"]),
  tags: z.array(s(60)).max(20),
  notes: s(2000).nullable(),
  // D74: where a lead came from, and who sent them.
  leadSource: s(120).nullable().optional(),
  referredBy: s(120).nullable().optional(),
  loan: z.object({ closedOn: s(10).nullable(), amount: n, noteRate: n }).nullable(),
  agent: z.object({ brokerage: s(120).nullable(), units: n, volume: n, buyerUnits: n, listingUnits: n, avgPrice: n, topLender: s(120).nullable() }).nullable(),
  attestedOptIns: z.array(z.enum(["text", "call", "email"])).max(3),
  // D69: where each opt-out came from ("<file> column <header>").
  optOuts: z.object({ text: s(200).optional(), call: s(200).optional(), email: s(200).optional() }).optional(),
  // D75: the real file name, and the loan officer's pick for someone like a person already in the book.
  sourceFile: s(160).optional(),
  matchTo: z.string().regex(/^(new|c_[A-Za-z0-9_-]{6,40})$/).optional(),
});
const ImportId = z.string().regex(/^imp_[A-Za-z0-9_-]{6,40}$/);
const Batch = z.object({ kind: z.enum(["contacts", "agents"]), source: s(160), provenance: z.enum(PROVENANCE), records: z.array(Record_).max(MAX_BATCH), offset: z.number().int().min(0).max(1_000_000).optional(), importId: ImportId.optional(), mode: z.enum(REIMPORT_MODES).optional() });

/** One batch from the import wizard. Returns counts; never echoes data back. */
export async function importBatchAction(input: unknown): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const parsed = Batch.safeParse(input);
  if (!parsed.success) {
    // D69: say which person and which field, in plain words (field names only; no values are echoed).
    const offset = typeof (input as { offset?: unknown })?.offset === "number" ? Math.max(0, Math.floor((input as { offset: number }).offset)) : 0;
    return { ok: false, error: importIssueText(parsed.error.issues[0], offset) };
  }
  try {
    // D75: a batch belongs to a run this person started (its id goes on everyone it creates, for undo and history).
    const run = parsed.data.importId ? await runForBatch(actor, parsed.data.importId) : null;
    if (parsed.data.importId && !run) return { ok: false, error: contactsImportCopy.history.runGone };
    const result = await importBatch(actor, parsed.data.kind, parsed.data.records, parsed.data.source, parsed.data.provenance, new Date(), { importId: run?.id, mode: parsed.data.mode });
    if (run) await addBatchCounts(run, result);
    return { ok: true, result };
  } catch (e) {
    if (e instanceof ImportRefused) return { ok: false, error: e.message };
    throw e;
  }
}

const Start = z.object({ kind: z.enum(["contacts", "agents"]), files: z.array(s(160)).min(1).max(40), provenance: z.enum(PROVENANCE), mode: z.enum(REIMPORT_MODES), tags: z.array(s(60)).max(10) });

/** D75: one id for the whole run (every batch, the history page and undo). */
export async function startImportAction(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const parsed = Start.safeParse(input);
  if (!parsed.success) return { ok: false, error: contactsImportCopy.issue.generic };
  try {
    return { ok: true, id: (await startImport(actor, parsed.data)).id };
  } catch (e) {
    if (e instanceof ImportRefused) return { ok: false, error: e.message };
    throw e;
  }
}

const Finish = z.object({ inFile: z.number().int().min(0).max(1_000_000), skipped: z.number().int().min(0).max(1_000_000), skippedCsv: z.string().max(MAX_SKIPPED_CSV).nullable() });

/** D75: the totals only the browser knows, and the skipped rows for the history page. */
export async function finishImportAction(id: unknown, input: unknown): Promise<{ ok: true; people: number; withPhone: number } | { ok: false }> {
  const actor = await currentUser();
  const pid = ImportId.safeParse(id);
  const parsed = Finish.safeParse(input);
  if (!actor || !pid.success || !parsed.success) return { ok: false };
  const r = await finishImport(actor, pid.data, parsed.data);
  return r ? { ok: true, people: r.people, withPhone: r.withPhone } : { ok: false };
}

const Check = z.object({ records: z.array(Record_).max(MAX_BATCH), importId: ImportId.optional() });

/** D75: who in the file is already in the book, and what each choice would change (field names only). Saves nothing. */
export async function checkExistingAction(input: unknown): Promise<{ ok: true; results: ExistingCheck[] } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const parsed = Check.safeParse(input);
  if (!parsed.success) return { ok: false, error: contactsImportCopy.issue.generic };
  try {
    return { ok: true, results: await checkExisting(actor, parsed.data.records, parsed.data.importId) };
  } catch (e) {
    if (e instanceof ImportRefused) return { ok: false, error: e.message };
    throw e;
  }
}

const historyPage = (flash: { ok: boolean; lines: string[] }) => `/mlo/contacts/import/history?f=${encodeFlash(flash)}`;

/** D75: "Undo this import" (bound: `undoImportAction.bind(null, importId)`), after typing UNDO. */
export async function undoImportAction(id: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const h = contactsImportCopy.history;
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== h.confirmWord.toLowerCase()) redirect(historyPage({ ok: false, lines: [h.confirmMismatch] }));
  const pid = ImportId.safeParse(id);
  const r = pid.success ? await undoImport(actor, pid.data) : ({ ok: false, error: "gone" } as const);
  redirect(historyPage(r.ok ? { ok: true, lines: h.undone(r.result, r.done) } : { ok: false, lines: [h.refused[r.error]] }));
}

/** D75: the skipped rows of a past import (the history page's download). */
export async function skippedRowsAction(id: string): Promise<{ ok: true; csv: string } | { ok: false }> {
  const actor = await currentUser();
  const pid = ImportId.safeParse(id);
  if (!actor || !pid.success) return { ok: false };
  const run = await getImport(actor, pid.data);
  return run?.skippedCsv ? { ok: true, csv: run.skippedCsv } : { ok: false };
}

export async function consentAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const contactId = String(fd.get("contactId") ?? "");
  const channel = String(fd.get("channel") ?? "");
  const purpose = String(fd.get("purpose") ?? "");
  const evidence = String(fd.get("evidence") ?? "");
  const granted = fd.get("granted") === "yes";
  if (!(CHANNELS as readonly string[]).includes(channel) || !(PURPOSES as readonly string[]).includes(purpose) || !(EVIDENCE as readonly string[]).includes(evidence)) {
    redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: false, lines: ["Pick a channel, purpose and how they told you."] })}`);
  }
  const res = await recordConsent(actor, contactId, { channel: channel as (typeof CHANNELS)[number], purpose: purpose as (typeof PURPOSES)[number], granted, evidence: (granted ? evidence : "revoked") as (typeof EVIDENCE)[number], proof: String(fd.get("proof") ?? "") });
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash(res.ok ? { ok: true, lines: [granted ? "Permission recorded." : "Recorded: calls and texts are off for this person, for every purpose."] } : { ok: false, lines: [res.error] })}`);
}

export async function deleteContactAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const res = await deleteContact(actor, String(fd.get("contactId") ?? ""));
  redirect(`/mlo/contacts?f=${encodeFlash(res.ok ? { ok: true, lines: ["Deleted, with its consent history."] } : { ok: false, lines: ["Couldn't delete that contact."] })}`);
}

/** Clears the hold on the signed-in loan officer's prior-employer contacts, after the attestation. */
export async function unlockAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  if (fd.get("attest") !== "yes") redirect(`/mlo/contacts?f=${encodeFlash({ ok: false, lines: ["Tick the box to confirm first."] })}`);
  // D75: everyone on hold in one go (before, only the first 500 were read).
  const n = await unlockAllHeld(actor, UNLOCK_ATTESTATION);
  redirect(`/mlo/contacts?f=${encodeFlash({ ok: true, lines: [`Released ${n} ${n === 1 ? "person" : "people"} from hold. They're still relationship only until their permission is recorded.`] })}`);
}

/** D4: send a text through the gate. */
export async function sendTextAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const contactId = String(fd.get("contactId") ?? "");
  const purpose = fd.get("purpose") === "marketing" ? "marketing" : "service";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const res = await sendText(actor, contactId, String(fd.get("body") ?? ""), purpose, `${origin}/api/twilio/status`);
  const lines = res.ok ? ["Sent."] : [res.error, ...(res.retryAt ? [`Their window opens ${new Date(res.retryAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" })} Pacific.`] : [])];
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: res.ok, lines })}#conversation`);
}

/** D33: send an email through the gate. */
export async function sendEmailAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const contactId = String(fd.get("contactId") ?? "");
  const purpose = fd.get("purpose") === "marketing" ? "marketing" : "service";
  const res = await sendEmail(actor, contactId, String(fd.get("subject") ?? ""), String(fd.get("body") ?? ""), purpose);
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: res.ok, lines: [res.ok ? "Email sent. Replies go to your inbox." : res.error] })}#conversation`);
}

/** D52: they answered by email or phone; end their follow-up campaigns. */
export async function contactRepliedAction(contactId: string): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const c = await contactStore().get(contactId);
  const n = c && canSee(actor, c) ? await onContactReply(c.id, false) : 0;
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: true, lines: [n ? `Stopped ${n} follow-up campaign${n === 1 ? "" : "s"} for them.` : "No follow-up campaigns to stop (keep-in-touch campaigns carry on)."] })}#email`);
}

/** D4: line type from Twilio Lookup. */
export async function checkLineAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const contactId = String(fd.get("contactId") ?? "");
  const r = await checkLine(actor, contactId);
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: r.ok, lines: [r.message] })}`);
}

/** D4: record a do-not-call scrub result. */
export async function dncAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const contactId = String(fd.get("contactId") ?? "");
  const ok = await recordDnc(actor, contactId, fd.get("onList") === "yes", String(fd.get("source") ?? ""));
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok, lines: [ok ? "Do-not-call check recorded. It's good for 31 days." : "Couldn't record that."] })}`);
}

/** D16: the loan officer's own note after a call. */
export async function debriefAction(contactId: string, note: string) {
  const u = await currentUser();
  if (!u) return { ok: false as const, error: "Sign in again." };
  return debrief(u, contactId, note);
}

/** D21: a Reassigned Numbers Database result. */
export async function rndAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const contactId = String(fd.get("contactId") ?? "");
  const r = String(fd.get("result") ?? "no");
  const ok = await recordRnd(actor, contactId, r === "yes" ? "yes" : r === "no_data" ? "no_data" : "no", String(fd.get("since") ?? ""), String(fd.get("source") ?? ""));
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok, lines: [ok ? "Reassigned-number check recorded. It's good for 30 days." : "Pick the date you checked from."] })}#phone-checks`);
}

/** D26: draft a text with the client's own page link (for approval on the desk). */
export async function draftClientLinkAction(contactId: string): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const r = await draftClientLink(actor, contactId);
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Drafted on your Concierge desk." : r.error] })}#their-page`);
}

/** D26: a new link; the old one stops working. */
export async function rotateClientLinkAction(contactId: string): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const c = await contactStore().get(contactId);
  if (c && c.ownerUserId === actor.id) await rotateLink(c);
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: !!c, lines: [c ? "New link made. The old one no longer works." : "No such contact."] })}#their-page`);
}

/** D42: M8 matches columns from headers and value shapes only (never values; never agent lists). */
export async function aiMapAction(input: { fileName: string; kind: string; columns: { header: string; shapes: string[] }[] }): Promise<import("@/lib/contacts/ai-map").AiMapResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in first." };
  const { aiMapColumns } = await import("@/lib/contacts/ai-map");
  return aiMapColumns(actor, input);
}

/**
 * D74: M8's tip for one "Needs a look" value, from the field, the value's
 * shape and a reason code only (never the value or the row). `{ ok: false }`
 * without a key: the step-through works the same without a tip.
 */
export async function fixTipAction(input: unknown): Promise<import("@/lib/contacts/ai-fix").TipResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false };
  const { aiFixTip, TipInput } = await import("@/lib/contacts/ai-fix");
  const parsed = TipInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  return aiFixTip(actor, parsed.data);
}

/** D67: check the rules and get the link that opens Messages on the loan officer's own phone. */
export async function phoneTextAction(contactId: string, input: { body: string; purpose: string }): Promise<{ ok: true; href: string; body: string } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const { textFromPhone } = await import("@/lib/messaging/phone");
  const r = await textFromPhone(actor, contactId, String(input.body ?? ""), input.purpose === "marketing" ? "marketing" : "service");
  if (r.ok) return r;
  return { ok: false, error: r.retryAt ? `${r.error} Their window opens ${new Date(r.retryAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" })} Pacific.` : r.error };
}

/** D67: they texted STOP (or asked to be left alone) on the loan officer's own phone. */
export async function phoneStopAction(contactId: string): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const { phoneStop } = await import("@/lib/messaging/phone");
  const ok = await phoneStop(actor, contactId);
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok, lines: [ok ? "Recorded: no more texts or calls to this number, from anyone in Command Center." : "Couldn't record that."] })}#conversation`);
}

/** D73: one person's tags, from the contact page (bound: `setTagsAction.bind(null, contactId)`). */
export async function setTagsAction(contactId: string, tags: unknown): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const parsed = z.array(z.string().max(200)).max(60).safeParse(tags);
  if (!parsed.success) return { ok: false, error: contactTagsCopy.failed };
  return setContactTags(actor, String(contactId), parsed.data);
}

const BulkInput = z.object({
  target: z.union([
    z.object({ ids: z.array(z.string().max(64)).max(MAX_BULK_IDS) }),
    z.object({ filter: z.object({ kind: z.enum(["contact", "agent"]), q: z.string().max(200).optional(), rel: z.string().max(40).optional(), tag: z.string().max(200).optional(), imp: z.string().max(60).optional() }) }),
  ]),
  op: z.object({ op: z.enum(["addTag", "removeTag"]), tag: z.string().max(200) }),
});

/** D73: the bulk bar on the Contacts list (add or remove a tag). `canSee` is checked for every person. */
export async function bulkContactsAction(target: unknown, op: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const parsed = BulkInput.safeParse({ target, op });
  if (!parsed.success) return { ok: false, error: contactTagsCopy.failed };
  const r = await bulkTags(actor, parsed.data.target, parsed.data.op);
  if (!r.ok) return r;
  const tag = cleanTag(parsed.data.op.tag);
  return { ok: true, message: parsed.data.op.op === "addTag" ? contactTagsCopy.added(tag, r.changed, r.skipped, MAX_CONTACT_TAGS) : contactTagsCopy.removed(tag, r.changed) };
}

const tagsPage = (kind: string, flash: { ok: boolean; lines: string[] }) => `/mlo/contacts?${kind === "agent" ? "kind=agent&" : ""}f=${encodeFlash(flash)}#tags`;

/** D73: Rename tag (bound: `renameTagAction.bind(null, kind, tag)`). */
export async function renameTagAction(kind: string, from: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const r = await renameTag(actor, String(from), String(fd.get("to") ?? ""));
  redirect(tagsPage(kind, r.ok ? { ok: true, lines: [contactTagsCopy.renamed(r.changed)] } : { ok: false, lines: [r.error] }));
}

/** D73: Merge into… (bound: `mergeTagAction.bind(null, kind, tag)`); the picked tag keeps its name. */
export async function mergeTagAction(kind: string, from: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const into = String(fd.get("into") ?? "");
  if (!into) redirect(tagsPage(kind, { ok: false, lines: [contactTagsCopy.pickMerge] }));
  const r = await mergeTag(actor, String(from), into);
  redirect(tagsPage(kind, r.ok ? { ok: true, lines: [contactTagsCopy.merged(r.changed)] } : { ok: false, lines: [r.error] }));
}

/** D73: Delete tag, after typing it (bound: `deleteTagAction.bind(null, kind, tag)`). */
export async function deleteTagAction(kind: string, tag: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  if (String(fd.get("confirm") ?? "").trim() !== String(tag).trim()) redirect(tagsPage(kind, { ok: false, lines: [contactTagsCopy.confirmMismatch] }));
  const r = await deleteTag(actor, String(tag));
  redirect(tagsPage(kind, r.ok ? { ok: true, lines: [contactTagsCopy.deleted(r.changed)] } : { ok: false, lines: [r.error] }));
}

// ---- D77: add, edit and merge people; the contact page's one-tap actions ----

const contactHref = (id: string, flash?: { ok: boolean; lines: string[] }, hash = "", tab?: string) => `/mlo/contacts/${encodeURIComponent(id)}?${tab ? `tab=${tab}&` : ""}${flash ? `f=${encodeFlash(flash)}` : ""}${hash}`;
const EditInputSchema = z.record(z.string(), z.string().max(5000));

/** D77: the Details form (bound: `updateContactAction.bind(null, contactId)`). Returns field errors in plain words. */
export async function updateContactAction(contactId: string, input: unknown): Promise<import("./[id]/EditDetails").EditOutcome> {
  const actor = await currentUser();
  if (!actor) return { ok: false, errors: { form: "Sign in again." } };
  const parsed = EditInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: { form: contactPageCopy.errors.gone } };
  const r = await updateContact(actor, String(contactId), parsed.data);
  if (!r.ok) return r;
  const e = contactPageCopy.edit;
  const message = !r.changed.length ? e.nothing : r.phoneChanged && r.resets ? e.savedPhone : r.emailChanged && r.resets ? e.savedEmail : e.saved;
  return { ok: true, message, sameAs: r.sameAs ? { id: r.sameAs.id, name: nameOf(r.sameAs) } : null };
}

/** D77: "+ Add a person" / "+ Add an agent" (bound: `addContactAction.bind(null, kind)`). */
export async function addContactAction(kind: string, input: unknown): Promise<import("./AddPerson").AddOutcome> {
  const actor = await currentUser();
  if (!actor) return { ok: false, errors: { form: "Sign in again." } };
  const parsed = EditInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: { form: contactPageCopy.errors.gone } };
  const k = kind === "agent" ? "agent" : "contact";
  const r = await addContact(actor, k, parsed.data);
  if (!r.ok) return { ok: false, errors: r.errors, ...(r.existingId ? { existingHref: `/mlo/contacts/${encodeURIComponent(r.existingId)}` } : {}) };
  return { ok: true, href: contactHref(r.id, { ok: true, lines: [r.message] }) };
}

/** D77: a note from the page (bound: `addNoteAction.bind(null, contactId)`). */
export async function addNoteAction(contactId: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const r = await addNote(actor, String(contactId), String(fd.get("note") ?? ""));
  redirect(contactHref(contactId, { ok: r.ok, lines: [r.message] }, "#timeline", "conversation"));
}

/** D77: the header's Call: checked by the contact rules and logged, then the phone app opens. */
export async function dialAction(contactId: string): Promise<{ ok: true; tel: string } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  return logDial(actor, String(contactId));
}

/** D77: "Remind me" (bound: `remindAction.bind(null, contactId)`; what and when are picked from lists). */
export async function remindAction(contactId: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const r = await remindMe(actor, String(contactId), String(fd.get("what") ?? ""), Number(fd.get("when") ?? 0));
  redirect(contactHref(contactId, { ok: r.ok, lines: [r.message] }));
}

/** D77: "Add to campaign" (bound: `campaignAddAction.bind(null, contactId)`). */
export async function campaignAddAction(contactId: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const r = await addToCampaign(actor, String(contactId), String(fd.get("campaignId") ?? ""));
  redirect(contactHref(contactId, { ok: r.ok, lines: [r.message] }));
}

/** D77: merge two records (bound: `mergeContactsAction.bind(null, keepId, dropId)`), after the confirm box. */
export async function mergeContactsAction(keepId: string, dropId: string, back: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const m = contactPageCopy.merge;
  if (fd.get("same") !== "yes") redirect(contactHref(back, { ok: false, lines: [m.confirmFirst] }, "#merge", "details") + "");
  const r = await mergeContacts(actor, String(keepId), String(dropId));
  if (!r.ok) redirect(contactHref(back, { ok: false, lines: [m.refused[r.error] ?? m.refused.gone] }, "", "details"));
  redirect(contactHref(r.keptId, { ok: true, lines: [m.done(r.name, r.moved)] }, "", "permission"));
}

/** D77: approve the Concierge's draft from the person's page (bound: `approveHereAction.bind(null, contactId)`). */
export async function approveHereAction(contactId: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { approve } = await import("@/lib/concierge/desk");
  const r = await approve(actor, String(fd.get("id") ?? ""), fd.has("body") ? String(fd.get("body")) : null, `${origin}/api/twilio/status`);
  redirect(contactHref(contactId, { ok: r.ok, lines: [r.ok ? contactPageCopy.suggestion.sent : r.error] }, "#timeline", "conversation"));
}

/** D77: skip the Concierge's draft from the person's page (bound: `skipHereAction.bind(null, contactId)`). */
export async function skipHereAction(contactId: string, fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const { dismiss } = await import("@/lib/concierge/desk");
  await dismiss(actor, String(fd.get("id") ?? ""));
  redirect(contactHref(contactId, { ok: true, lines: [contactPageCopy.suggestion.skipped] }));
}
