/**
 * lib/messaging/service.ts — sending texts through the gate, and handling
 * replies, opt-outs and delivery status (D4). SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";
import { mloById } from "@/lib/config";
import { accountStore, type User } from "@/lib/accounts/store";
import { redactChatInput } from "@/lib/m8/redact";
import { canSee, recordConsent, summarize } from "@/lib/contacts/service";
import { contactStore, type Channel, type Contact, type Purpose } from "@/lib/contacts/store";
import { decide, type GateDecision } from "@/lib/send-gate/gate";
import { licensedStatesFor } from "@/lib/send-gate/for-contact";
import { areaCodeState } from "@/lib/send-gate/rules";
import { isOptIn, isOptOut, lookupLineType, sendSms, twilioConfig } from "./twilio";
import { touchStore, type Touch } from "./store";
import { pipelineStore } from "@/lib/pipeline/store";
import { conciergeStore } from "@/lib/concierge/store";

export const MAX_TEXT = 640;
const tid = () => `t_${randomBytes(9).toString("base64url")}`;
const SYSTEM: User = { id: "system", email: "system", name: "System", role: "owner", mloId: null, status: "active", createdAt: "", createdBy: "" };

/** The gate's answer for this contact right now, with real counts, opt-outs and do-not-call status. */
export async function gateFor(actor: User, c: Contact, channel: Channel, purpose: Purpose, now = new Date()): Promise<GateDecision> {
  const consent = summarize(await contactStore().consents(c.id));
  const ts = touchStore();
  if (c.phone && (channel === "text" || channel === "call" || channel === "ai_call") && (await ts.optedOut(c.phone))) {
    consent.text.service = consent.text.marketing = { granted: false, evidence: "revoked", at: null, proof: "replied STOP" };
  }
  const day = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const week = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  // D13: caps count every marketing touch to this phone number, across every loan officer on the platform
  // (Florida counts "regardless of the phone number used"; the strictest reading everywhere).
  const sameNumber = c.phone ? (await contactStore().findByPhone(c.phone)).map((x) => x.id) : [];
  const ids = [...new Set([c.id, ...sameNumber])];
  const recent = (await Promise.all(ids.map((id) => ts.sentSince(id, week)))).flat();
  const declined = (await ts.forContact(c.id, 200)).find((t) => t.channel === "call" && t.direction === "out" && (t.note ?? "").includes("declined a sales call"));
  const count = (chs: Channel[], since: string) => recent.filter((t) => chs.includes(t.channel) && t.at >= since).length;
  return decide({
    channel,
    purpose,
    manual: channel === "call",
    contact: { locked: c.locked, state: c.state, hasPhone: !!c.phone, hasEmail: !!c.email, relationship: c.relationship, ebrClosedOn: await ebrDate(c), areaState: areaCodeState(c.phone), declinedCallAt: declined?.at ?? null },
    clearances: stateClearances(),
    consent,
    licensedStates: licensedStatesFor(actor),
    dnc: c.dnc ? { onList: c.dnc.onList, checkedAt: c.dnc.checkedAt } : null,
    sent: { callsLast24h: count(["call", "ai_call"], day), textsLast24h: count(["text"], day), textsLast7d: count(["text"], week) },
    now,
  });
}

/**
 * D13: state rules the owner opens once counsel clears them (Vercel env,
 * exactly "true"). Until then the gate keeps them closed.
 */
export function stateClearances() {
  return { tx302: process.env.GATE_TX_302_CLEARED === "true", azPhone: process.env.GATE_AZ_PHONE_CLEARED === "true", caAiVoice: process.env.GATE_CA_AI_VOICE_CLEARED === "true" };
}

/** D6: the latest closing for this contact in the loan officer's own loan system (their current company). */
async function ebrDate(c: Contact): Promise<string | null> {
  const loans = (await pipelineStore().list(c.ownerUserId)).filter((l) => l.contactId === c.id && l.closed);
  const dates = loans.map((l) => l.keyDates.closing ?? l.updatedAt.slice(0, 10)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** Who the text is from, and how to stop, on the first text and every marketing text. */
export function signature(actor: User): string {
  const mlo = mloById(actor.mloId);
  return mlo ? `${mlo.firstName} at LoanM8, NMLS #${mlo.nmls}. Reply STOP to opt out.` : "LoanM8. Reply STOP to opt out.";
}

export type SendOutcome = { ok: true } | { ok: false; error: string; reasons?: string[]; retryAt?: string | null };

export async function sendText(actor: User, contactId: string, rawBody: string, purpose: Purpose, statusCallback: string | null, now = new Date(), opts: { origin?: Touch["origin"] } = {}): Promise<SendOutcome> {
  const c = await contactStore().get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "No such contact." };
  const text = redactChatInput(rawBody.trim()).text;
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Keep it under ${MAX_TEXT} characters.` };
  if (!twilioConfig()) return { ok: false, error: "Texting isn't connected yet. Add the Twilio keys in Vercel." };
  const d = await gateFor(actor, c, "text", purpose, now);
  const audit = accountStore();
  if (!d.allowed) {
    await audit.audit({ at: now.toISOString(), actor: actor.email, action: "gate.block.text", detail: { contactId, purpose, reason: d.reasons[0] ?? "" } });
    return { ok: false, error: d.reasons[0] ?? "Not allowed right now.", reasons: d.reasons, retryAt: d.retryAt };
  }
  const first = !(await touchStore().forContact(c.id, 500)).some((t) => t.direction === "out" && t.channel === "text");
  const sig = signature(actor);
  const body = purpose === "marketing" || first ? (text.includes("STOP") ? text : `${text}\n\n${sig}`) : text;
  const res = await sendSms(c.phone!, body, statusCallback);
  await touchStore().add({ id: tid(), contactId: c.id, ownerUserId: c.ownerUserId, channel: "text", purpose, direction: "out", body, status: res.ok ? res.status : "failed", providerId: res.ok ? res.sid : null, note: d.basis, at: now.toISOString(), actor: actor.email, phone: c.phone, sender: twilioConfig()!.service, origin: opts.origin ?? "human" });
  await audit.audit({ at: now.toISOString(), actor: actor.email, action: "gate.send.text", detail: { contactId, purpose, basis: d.basis, ok: res.ok } });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * An inbound text to one of our senders (a Twilio Messaging Service).
 *
 * D6 (overnight review): it's stored ONLY on the contacts of loan officers
 * who have texted this phone from that same sender, never copied to every
 * loan officer who happens to have the number (that leaked one company's
 * conversation into another's). An opt-out goes on the one-way opt-out list
 * for that sender (which blocks the phone everywhere) and revokes every
 * phone channel for the matched contacts. A START clears only that
 * sender's entry, so it can't cancel a STOP given to anyone else.
 */
export async function handleInbound(from: string, sender: string, rawBody: string, now = new Date()): Promise<{ contacts: number; optedOut: boolean }> {
  const at = now.toISOString();
  const body = redactChatInput(rawBody).text.slice(0, 2000);
  const ts = touchStore();
  const owners = new Set(await ts.ownersWhoTexted(from, sender));
  const contacts = (await contactStore().findByPhone(from)).filter((c) => owners.has(c.ownerUserId));
  const out = isOptOut(body);
  if (out) await ts.optOut(from, sender, at, "text reply");
  else if (isOptIn(body)) await ts.clear(from, sender);
  for (const c of contacts) {
    // D8.1: anything they send makes waiting Concierge drafts stale (they were written before it).
    await conciergeStore().markStale(c.id);
    if (out) await recordConsent(SYSTEM, c.id, { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: `texted "${body.slice(0, 60)}"` }, now);
    await ts.add({ id: tid(), contactId: c.id, ownerUserId: c.ownerUserId, channel: "text", purpose: "service", direction: "in", body, status: "received", providerId: null, phone: from, sender, note: out ? "Opt-out recorded: texts and calls are off for this number." : isOptIn(body) ? "They texted START. Texting is unblocked, but permission still has to be on file." : null, at, actor: "contact" });
  }
  await accountStore().audit({ at, actor: "twilio", action: out ? "text.inbound.optout" : "text.inbound", detail: { matched: contacts.length } });
  return { contacts: contacts.length, optedOut: out };
}

export async function handleStatus(messageSid: string, status: string): Promise<void> {
  if (/^SM[0-9a-f]{32}$|^MM[0-9a-f]{32}$/.test(messageSid) && /^[a-z_]{3,20}$/.test(status)) await touchStore().setStatus(messageSid, status);
}

export async function checkLine(actor: User, contactId: string, now = new Date()): Promise<{ ok: boolean; message: string }> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c) || !c.phone) return { ok: false, message: "No phone to check." };
  const r = await lookupLineType(c.phone);
  if (!r) return { ok: false, message: twilioConfig() ? "Twilio couldn't check that number." : "Line checks need the Twilio keys in Vercel." };
  await store.put({ ...c, line: { ...r, checkedAt: now.toISOString() }, updatedAt: now.toISOString() });
  return { ok: true, message: `It's a ${r.type} line${r.carrier ? ` (${r.carrier})` : ""}.` };
}

/** The loan officer records a do-not-call scrub result (from their DNC vendor or the registry). */
export async function recordDnc(actor: User, contactId: string, onList: boolean, source: string, now = new Date()): Promise<boolean> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c)) return false;
  await store.put({ ...c, dnc: { onList, checkedAt: now.toISOString(), source: source.trim().slice(0, 120) || "not given" }, updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "dnc.record", detail: { contactId, onList } });
  return true;
}
