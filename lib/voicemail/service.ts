/**
 * lib/voicemail/service.ts — voicemail drops (D57). SERVER-ONLY.
 *
 * A loan officer records a short voicemail once (up to 55 seconds) and
 * leaves it for one person or many. Command Center places the call through
 * Twilio; when it reaches voicemail it waits for the beep and plays the
 * message, and when a person answers they hear it too, with a way to stop.
 *
 * A recorded message is a "prerecorded voice" call under the TCPA (47 USC
 * 227(b); the FCC treats ringless voicemail the same way, 2022), so every
 * drop goes through the send gate as an AI/recorded-voice call ("ai_call"):
 * proof of permission for loan updates, written permission for offers, the
 * do-not-call lists, caps, quiet hours, licensing, and the California hold.
 * And each message carries what 47 CFR 64.1200(b) requires, added by
 * Command Center around the recording:
 *  - first, who is calling: the loan officer and the company;
 *  - for an offer, right after that, how to stop: press 9 (a person) or call
 *    the toll-free opt-out line (a voicemail), TWILIO_OPTOUT_NUMBER;
 *  - at the end, the number to call back.
 * Pressing 9, on the drop or on the company's calling line, stops recorded
 * calls and texts to that number from everyone on the platform.
 *
 * The word check: the recording is turned into words and checked by the same
 * rules as every text and email before it's saved. The bytes checked are the
 * bytes played.
 */
import { randomBytes } from "node:crypto";
import { del as blobDel, put as blobPut } from "@vercel/blob";
import { accountStore, type User } from "@/lib/accounts/store";
import { companyDetails, companyOfMlo } from "@/lib/accounts/company";
import { CONFIG, mloById } from "@/lib/config";
import { canSee, recordConsent } from "@/lib/contacts/service";
import { contactStore, type Purpose } from "@/lib/contacts/store";
import { toE164 } from "@/lib/contacts/normalize";
import { incr } from "@/lib/m8/kv";
import { gateFor } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";
import { twilioConfig } from "@/lib/messaging/twilio";
import { textingStore } from "@/lib/texting/store";
import { checkTranscript } from "@/lib/videos/service";
import { transcribeOn, transcribePart } from "@/lib/videos/transcribe";
import { MAX_VM_SECONDS, readWav, VM_RATE } from "./audio";
import { voicemailStore, type Drop, type DropStatus, type Voicemail } from "./store";

const env = (k: string) => process.env[k]?.trim() || undefined;
const iso = (d: Date) => d.toISOString();
const rid = (p: string) => `${p}${randomBytes(9).toString("base64url")}`;
const SITE = () => CONFIG.siteUrl.replace(/\/$/, "");
const SYSTEM: User = { id: "system", email: "system", name: "System", role: "owner", mloId: null, status: "active", createdAt: "", createdBy: "" };

/** On with Twilio and a Blob store; CC_VOICEMAIL="false" turns it off. */
export const voicemailOn = () => !!twilioConfig() && !!env("BLOB_READ_WRITE_TOKEN") && env("CC_VOICEMAIL") !== "false";
/** The toll-free opt-out line voicemails for offers must name (64.1200(b)(3)). */
export function optOutLine(): string | null {
  const n = toE164(env("TWILIO_OPTOUT_NUMBER"));
  return n && /^\+18(00|33|44|55|66|77|88)\d{7}$/.test(n) ? n : null;
}
export const MAX_BATCH = 50;

/** The number a company's drops come from, and the subaccount that owns it. */
export async function callerFor(company: string | null): Promise<{ from: string; account: string | null } | null> {
  const own = company ? toE164(env(`TWILIO_CALLER_ID_${company.replace(/\D/g, "")}`)) : null;
  if (own) return { from: own, account: null };
  if (company) {
    const s = await textingStore().get(company).catch(() => null);
    if (s?.status === "live" && s.phoneNumber && s.subaccountSid) return { from: s.phoneNumber, account: s.subaccountSid };
  }
  const shared = toE164(env("TWILIO_CALLER_ID"));
  return shared ? { from: shared, account: null } : null;
}

// ---- Recording ----

export type BlobDeps = { put: (path: string, body: Uint8Array) => Promise<string>; del: (url: string) => Promise<void> };
const realBlob: BlobDeps = {
  put: async (path, body) => (await blobPut(path, Buffer.from(body), { access: "public", contentType: "audio/wav", addRandomSuffix: true })).url,
  del: (url) => blobDel(url),
};

/** Checks the words, then saves the recording. A recording that doesn't pass isn't kept. */
export async function addVoicemail(user: User, title: string, wav: Uint8Array, now: Date, blob: BlobDeps = realBlob, transcriber = transcribePart): Promise<{ ok: true; voicemail: Voicemail } | { ok: false; error: string }> {
  if (!voicemailOn()) return { ok: false, error: "Voicemail drops are off." };
  if (!transcribeOn()) return { ok: false, error: "The word check isn't set up (the Google key with Speech-to-Text on)." };
  const audio = readWav(wav);
  if (!audio) return { ok: false, error: "That recording couldn't be read. Record it again here." };
  const seconds = audio.pcm.length / (VM_RATE * 2);
  if (seconds < 2) return { ok: false, error: "That's too short to be a message." };
  if (seconds > MAX_VM_SECONDS + 0.5) return { ok: false, error: `Keep voicemails under ${MAX_VM_SECONDS} seconds.` };
  if ((await incr(`cc:vm:add:${user.id}:${Math.floor(now.getTime() / 3_600_000)}`, 3_700)) > 30) return { ok: false, error: "Too many recordings this hour. Try again shortly." };
  let text: string;
  try {
    text = (await transcriber(audio.pcm, 0, fetch, VM_RATE)).text;
  } catch {
    return { ok: false, error: "The word check didn't answer. Try again in a minute." };
  }
  if (!text.trim()) return { ok: false, error: "No words were heard. Check your microphone and record it again." };
  const c = checkTranscript(text);
  if (!c.ok) return { ok: false, error: `It can't be used: it ${c.reason}. Near: “${c.near}” Record it again without that part.` };
  const url = await blob.put(`voicemail/${user.id.replace(/[^A-Za-z0-9_-]/g, "")}/${now.getTime()}.wav`, wav);
  const v: Voicemail = { id: rid("vm_"), ownerUserId: user.id, title: title.replace(/\s+/g, " ").trim().slice(0, 80) || "Voicemail", url, seconds: Math.round(seconds * 10) / 10, status: "ok", transcript: text, createdAt: iso(now) };
  await voicemailStore().putVoicemail(v);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "voicemail.add", detail: { id: v.id, seconds: v.seconds } });
  return { ok: true, voicemail: v };
}

export async function deleteVoicemail(user: User, id: string, now: Date, blob: BlobDeps = realBlob): Promise<boolean> {
  const v = await voicemailStore().voicemail(id);
  if (!v || v.ownerUserId !== user.id || v.status !== "ok") return false;
  await blob.del(v.url).catch(() => undefined);
  await voicemailStore().putVoicemail({ ...v, status: "deleted", url: "", transcript: "" });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "voicemail.delete", detail: { id } });
  return true;
}

// ---- Dropping ----

export type Dialer = (c: { account: string; from: string; to: string; url: string; statusCallback: string }) => Promise<{ ok: true; sid: string } | { ok: false; error: string }>;

/** Places a call that waits for the voicemail beep (Twilio answering-machine detection). */
export const twilioDialer: Dialer = async (x) => {
  const cfg = twilioConfig();
  if (!cfg) return { ok: false, error: "Twilio isn't connected." };
  const body = new URLSearchParams({ To: x.to, From: x.from, Url: x.url, Method: "POST", StatusCallback: x.statusCallback, StatusCallbackMethod: "POST", MachineDetection: "DetectMessageEnd", MachineDetectionTimeout: "30", Timeout: "30" });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${x.account}/Calls.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const out = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    return res.ok && out.sid ? { ok: true, sid: out.sid } : { ok: false, error: "Twilio didn't place the call." };
  } catch {
    return { ok: false, error: "Couldn't reach Twilio." };
  }
};

/** True when the public site runs this version (Twilio fetches the message from there). */
export async function liveSiteReady(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await fetcher(`${SITE()}/api/twilio/voicedrop/ping`, { cache: "no-store" });
    return r.ok && ((await r.json().catch(() => null)) as { feature?: string } | null)?.feature === "voicemail-drops";
  } catch {
    return false;
  }
}

export type DropResult = { contactId: string; name: string; ok: boolean; reason: string };

/**
 * Leaves a voicemail for each person, one call each, after the send gate
 * says yes for a recorded-voice call with this purpose.
 */
export async function dropVoicemail(actor: User, input: { voicemailId: string; contactIds: string[]; purpose: Purpose }, now: Date, dial: Dialer = twilioDialer, ready: () => Promise<boolean> = liveSiteReady): Promise<{ ok: true; results: DropResult[] } | { ok: false; error: string }> {
  if (!voicemailOn()) return { ok: false, error: "Voicemail drops are off." };
  const v = await voicemailStore().voicemail(input.voicemailId);
  if (!v || v.ownerUserId !== actor.id || v.status !== "ok") return { ok: false, error: "Pick one of your voicemails." };
  const ids = [...new Set(input.contactIds)].slice(0, MAX_BATCH + 1);
  if (!ids.length) return { ok: false, error: "Pick at least one person." };
  if (ids.length > MAX_BATCH) return { ok: false, error: `Up to ${MAX_BATCH} people at a time.` };
  if (input.purpose === "marketing" && !optOutLine()) return { ok: false, error: "Voicemails with an offer must name a toll-free line to stop them (the owner sets TWILIO_OPTOUT_NUMBER). Loan updates can go now." };
  const mlo = mloById(actor.mloId);
  if (!mlo) return { ok: false, error: "Your account isn't linked to your loan officer record." };
  const caller = await callerFor(companyOfMlo(actor.mloId));
  if (!caller) return { ok: false, error: "There's no calling number for your company yet. Set up texting for your company (it brings the number), or the owner sets TWILIO_CALLER_ID." };
  if (!(await ready())) return { ok: false, error: `Voicemail drops start once this version of Command Center is live at ${SITE()}.` };
  const cfg = twilioConfig()!;
  const results: DropResult[] = [];
  for (const id of ids) {
    const c = await contactStore().get(id);
    if (!c || !canSee(actor, c)) {
      results.push({ contactId: id, name: "Unknown", ok: false, reason: "No such contact." });
      continue;
    }
    const name = `${c.firstName} ${c.lastName}`.trim() || "Contact";
    const d = await gateFor(actor, c, "ai_call", input.purpose, now);
    if (!d.allowed) {
      await accountStore().audit({ at: iso(now), actor: actor.email, action: "gate.block.voicemail", detail: { contactId: c.id, purpose: input.purpose, reason: d.reasons[0] ?? "" } });
      results.push({ contactId: c.id, name, ok: false, reason: d.reasons[0] ?? "Not allowed right now." });
      continue;
    }
    if ((await incr(`cc:vm:drop:${actor.id}:${Math.floor(now.getTime() / 3_600_000)}`, 3_700)) > 200) {
      results.push({ contactId: c.id, name, ok: false, reason: "Over 200 drops this hour. Try again later." });
      continue;
    }
    const drop: Drop = { id: rid("dr_"), voicemailId: v.id, ownerUserId: actor.id, contactId: c.id, contactName: name, phone: c.phone!, purpose: input.purpose, callSid: null, account: caller.account, from: caller.from, status: "queued", answeredBy: null, optedOut: false, at: iso(now), endedAt: null };
    await voicemailStore().putDrop(drop);
    const placed = await dial({ account: caller.account ?? cfg.sid, from: caller.from, to: c.phone!, url: `${SITE()}/api/twilio/voicedrop?d=${drop.id}`, statusCallback: `${SITE()}/api/twilio/voicedrop/status?d=${drop.id}` });
    if (!placed.ok) {
      await voicemailStore().putDrop({ ...drop, status: "failed", endedAt: iso(now) });
      results.push({ contactId: c.id, name, ok: false, reason: placed.error });
      continue;
    }
    await voicemailStore().putDrop({ ...drop, callSid: placed.sid });
    await touchStore().add({ id: rid("t_"), contactId: c.id, ownerUserId: c.ownerUserId, channel: "ai_call", purpose: input.purpose, direction: "out", body: `Voicemail drop: "${v.title}"`, status: "queued", providerId: placed.sid, note: d.basis, at: iso(now), actor: actor.email, phone: c.phone, sender: caller.from, origin: "human" });
    await accountStore().audit({ at: iso(now), actor: actor.email, action: "gate.send.voicemail", detail: { contactId: c.id, purpose: input.purpose, basis: d.basis } });
    results.push({ contactId: c.id, name, ok: true, reason: "" });
  }
  return { ok: true, results };
}

// ---- What the call says (TwiML) ----

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** "2 0 6, 5 5 5, 0 1 2 3": phone numbers read slowly enough to write down. */
export function spoken(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `${d.slice(0, 3).split("").join(" ")}, ${d.slice(3, 6).split("").join(" ")}, ${d.slice(6).split("").join(" ")}` : d.split("").join(" ");
}
const say = (s: string) => `<Say voice="Polly.Joanna">${xml(s)}</Say>`;
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
export const hangup = () => twiml("<Hangup/>");

/**
 * The message: who's calling, how to stop (offers), the recording, and the
 * number to call back. A person can press 9 at any point to stop.
 */
export async function dropTwiml(dropId: string, answeredBy: string): Promise<string> {
  const d = await voicemailStore().drop(dropId);
  if (!d) return hangup();
  const [v, owner] = await Promise.all([voicemailStore().voicemail(d.voicemailId), accountStore().userById(d.ownerUserId)]);
  if (!v || v.status !== "ok" || !owner) return hangup();
  const m = mloById(owner.mloId);
  const co = companyDetails(m);
  const who = m?.name ?? owner.name;
  const machine = answeredBy.startsWith("machine") || answeredBy === "fax";
  const back = m?.phone || d.from;
  const optout = optOutLine();
  const intro = say(`This is a recorded message from ${who} with ${co.short || co.name}.`);
  const stop = d.purpose === "marketing" ? say(machine ? `To stop these calls, call ${spoken(optout ?? d.from)}.` : "To stop these calls, press 9 at any time.") : "";
  const outro = say(`To reach ${m?.firstName ?? who}, call ${spoken(back)}.${d.purpose === "service" ? (machine ? ` To stop these calls, call ${spoken(d.from)} and press 9.` : " To stop these calls, press 9.") : ""}`);
  const body = `${intro}${stop}<Play>${xml(v.url)}</Play>${outro}`;
  if (machine) return twiml(`${body}<Hangup/>`);
  return twiml(`<Gather numDigits="1" timeout="4" action="${xml(`${SITE()}/api/twilio/voice/key?k=drop&d=${d.id}`)}" method="POST">${body}</Gather><Hangup/>`);
}

/** Twilio's final word on a drop. */
export async function dropStatus(dropId: string, p: Record<string, string>, now: Date): Promise<void> {
  const d = await voicemailStore().drop(dropId);
  if (!d || (p.CallSid && d.callSid && p.CallSid !== d.callSid)) return;
  const ab = p.AnsweredBy ?? d.answeredBy ?? null;
  const st = p.CallStatus ?? "";
  const status: DropStatus = st === "completed" ? (ab && (ab.startsWith("machine") || ab === "fax") ? "left" : "answered") : st === "no-answer" ? "no-answer" : st === "busy" ? "busy" : st === "canceled" ? "canceled" : st === "failed" ? "failed" : d.status;
  await voicemailStore().putDrop({ ...d, status, answeredBy: ab, endedAt: iso(now) });
  if (d.callSid) await touchStore().setStatus(d.callSid, status === "left" ? "voicemail left" : status === "answered" ? "answered" : status);
}

/** A number said stop: no more recorded calls or texts to it, from anyone on the platform. */
export async function optOutPhone(rawPhone: string, sender: string, source: string, now: Date): Promise<number> {
  const phone = toE164(rawPhone);
  if (!phone) return 0;
  await touchStore().optOut(phone, sender, iso(now), source);
  const people = await contactStore().findByPhone(phone);
  for (const c of people) {
    for (const channel of ["ai_call", "call"] as const) await recordConsent(SYSTEM, c.id, { channel, purpose: "marketing", granted: false, evidence: "revoked", proof: source }, now).catch(() => undefined);
  }
  await accountStore().audit({ at: iso(now), actor: "system", action: "voicemail.optout", detail: { contacts: people.length, source } });
  return people.length;
}

/** A key pressed on a drop, the company line or the opt-out line. Only 9 means anything. */
export async function keyTwiml(kind: string, p: Record<string, string>, dropId: string | null, now: Date): Promise<string> {
  if ((p.Digits ?? "") !== "9") return hangup();
  const to = kind === "drop" ? p.To : p.From;
  const sender = kind === "drop" ? p.From : p.To;
  if (kind === "drop" && dropId) {
    const d = await voicemailStore().drop(dropId);
    if (d) await voicemailStore().putDrop({ ...d, optedOut: true });
  }
  await optOutPhone(to ?? "", sender ?? "", kind === "optout" ? "pressed 9 on the opt-out line" : kind === "drop" ? "pressed 9 on a recorded call" : "pressed 9 on the calling line", now);
  return twiml(`${say("Done. You won't get more of these calls or texts. Goodbye.")}<Hangup/>`);
}

/**
 * Someone called a company's number back (D56 numbers point here): press 9
 * to stop, or stay on the line for the loan officer who last called them.
 */
export async function companyLineTwiml(p: Record<string, string>): Promise<string> {
  const from = toE164(p.From);
  const last = from ? await voicemailStore().latestToPhone(from) : null;
  const owner = last ? await accountStore().userById(last.ownerUserId) : null;
  const m = mloById(owner?.mloId);
  const co = m ? companyDetails(m).short : "the mortgage company that called you";
  const gather = `<Gather numDigits="1" timeout="5" action="${SITE()}/api/twilio/voice/key?k=company" method="POST">${say(`You've reached ${co}. To stop recorded calls and texts to this number, press 9. To reach your loan officer, stay on the line.`)}</Gather>`;
  const dial = m?.phone && toE164(m.phone) ? `${say(`Connecting you to ${m.firstName}.`)}<Dial timeout="25">${toE164(m.phone)}</Dial>` : say("Please call your loan officer directly. Goodbye.");
  return twiml(`${gather}${dial}<Hangup/>`);
}

/** The platform's toll-free opt-out line. */
export const optOutLineTwiml = () =>
  twiml(`<Gather numDigits="1" timeout="8" action="${SITE()}/api/twilio/voice/key?k=optout" method="POST">${say("This is the opt-out line for recorded calls from loan officers using MLO Command Center. To stop recorded calls and texts to the number you're calling from, press 9.")}</Gather>${say("Nothing was changed. Goodbye.")}<Hangup/>`);
