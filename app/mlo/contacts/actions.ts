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
import { canSee, deleteContact, importBatch, MAX_BATCH, recordConsent, unlockContacts, type ImportResult } from "@/lib/contacts/service";
import { onContactReply } from "@/lib/campaigns/service";
import { contactStore } from "@/lib/contacts/store";
import { UNLOCK_ATTESTATION } from "@/lib/contacts/attestation";
import { CHANNELS, EVIDENCE, PROVENANCE, PURPOSES } from "@/lib/contacts/store";

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
  loan: z.object({ closedOn: s(10).nullable(), amount: n, noteRate: n }).nullable(),
  agent: z.object({ brokerage: s(120).nullable(), units: n, volume: n, buyerUnits: n, listingUnits: n, avgPrice: n, topLender: s(120).nullable() }).nullable(),
  attestedOptIns: z.array(z.enum(["text", "call", "email"])).max(3),
});
const Batch = z.object({ kind: z.enum(["contacts", "agents"]), source: s(160), provenance: z.enum(PROVENANCE), records: z.array(Record_).max(MAX_BATCH) });

/** One batch from the import wizard. Returns counts; never echoes data back. */
export async function importBatchAction(input: unknown): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again." };
  const parsed = Batch.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some rows didn't look right. Check the column matches and try again." };
  return { ok: true, result: await importBatch(actor, parsed.data.kind, parsed.data.records, parsed.data.source, parsed.data.provenance) };
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
  const { contacts } = await contactStore().list({ ownerUserId: actor.id, limit: 500 });
  const n = await unlockContacts(actor, contacts.filter((c) => c.locked).map((c) => c.id), UNLOCK_ATTESTATION);
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
