/**
 * lib/messaging/phone.ts — "Text from my phone" (D67). SERVER-ONLY.
 *
 * The owner: use the loan officer's own cell for one-to-one texts, next to
 * the registered Twilio texting. Command Center can't send from a personal
 * cell, so it does the next best thing:
 *  1. it checks the contact rules exactly as for a Twilio text (permission,
 *     opt-outs, do-not-call, quiet hours where they live, the daily limit);
 *  2. it writes the same text a Twilio text would be (first text and every
 *     offer end with who it's from and "Reply STOP to opt out");
 *  3. it logs it on the contact, and hands back an sms: link that opens
 *     Messages on the loan officer's phone with the text filled in. They
 *     press send; it goes from their own number (iMessage or SMS).
 * Replies land on their phone, not here. When someone texts back STOP (or
 * asks to be left alone), "They asked to stop" records it, which turns off
 * texts and calls to that number everywhere, the same as a STOP to Twilio.
 */
import { randomBytes } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { canSee, recordConsent } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { redactChatInput } from "@/lib/m8/redact";
import { recordPromises } from "@/lib/concierge/promises";
import { gateFor, signature, MAX_TEXT } from "./service";
import { toGsm } from "./segments";
import type { Purpose } from "@/lib/contacts/store";
import { touchStore } from "./store";

const tid = () => `t_${randomBytes(8).toString("base64url")}`;
/** The sender field for texts sent from a loan officer's own phone. */
export const phoneSender = (userId: string) => `phone:${userId}`;

/** An sms: link that opens Messages with the text in it (the "?&body=" form works on iPhone and Android). */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;
}

export type PhoneText = { ok: true; href: string; body: string } | { ok: false; error: string; retryAt?: string | null };

/** Checks the rules, writes the text, logs it, and returns the link that opens it on the loan officer's phone. */
export async function textFromPhone(actor: User, contactId: string, rawBody: string, purpose: Purpose, now = new Date()): Promise<PhoneText> {
  const c = await contactStore().get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "No such contact." };
  if (!c.phone) return { ok: false, error: "There's no phone number for them." };
  const text = redactChatInput(rawBody.trim()).text;
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Keep it under ${MAX_TEXT} characters.` };
  const d = await gateFor(actor, c, "text", purpose, now);
  if (!d.allowed) {
    await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "gate.block.phone_text", detail: { contactId, purpose, reason: d.reasons[0] ?? "" } });
    return { ok: false, error: d.reasons[0] ?? "Not allowed right now.", retryAt: d.retryAt };
  }
  const first = !(await touchStore().forContact(c.id, 500)).some((t) => t.direction === "out" && t.channel === "text");
  const body = toGsm(purpose === "marketing" || first ? (text.includes("STOP") ? text : `${text}\n\n${signature(actor)}`) : text);
  await touchStore().add({ id: tid(), contactId: c.id, ownerUserId: c.ownerUserId, channel: "text", purpose, direction: "out", body, status: "opened on your phone", providerId: null, note: `${d.basis} · from your own phone`, at: now.toISOString(), actor: actor.email, phone: c.phone, sender: phoneSender(actor.id), origin: "human" });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "gate.send.phone_text", detail: { contactId, purpose, basis: d.basis } });
  await recordPromises(actor, c, text, `phone:${now.getTime()}`, now).catch(() => 0);
  return { ok: true, href: smsHref(c.phone, body), body };
}

/** They texted STOP (or asked to be left alone) on the loan officer's own phone: off everywhere, like a STOP to Twilio. */
export async function phoneStop(actor: User, contactId: string, now = new Date()): Promise<boolean> {
  const c = await contactStore().get(contactId);
  if (!c || !canSee(actor, c) || !c.phone) return false;
  const at = now.toISOString();
  await touchStore().optOut(c.phone, phoneSender(actor.id), at, "asked the loan officer to stop");
  await recordConsent(actor, c.id, { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "asked to stop, by text to the loan officer's phone" }, now);
  await touchStore().add({ id: tid(), contactId: c.id, ownerUserId: c.ownerUserId, channel: "text", purpose: "service", direction: "in", body: "(Asked to stop, by text to your phone.)", status: "received", providerId: null, phone: c.phone, sender: phoneSender(actor.id), note: "Opt-out recorded: texts and calls are off for this number.", at, actor: "contact" });
  const { onContactReply } = await import("@/lib/campaigns/service");
  await onContactReply(c.id, true, now).catch(() => 0);
  await accountStore().audit({ at, actor: actor.email, action: "phone.stop", detail: { contactId } });
  return true;
}
