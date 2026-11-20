/**
 * lib/aicalls/service.ts — M8 calls a client with a loan update (D58).
 * SERVER-ONLY. Off until the owner sets CC_AI_CALLS="true" (after counsel
 * reviews it).
 *
 * The narrowest useful AI call:
 *  - Only about a loan in progress, only to a client who gave permission for
 *    recorded or AI-voice calls with proof (a signature, a web form, a texted
 *    yes, or a yes on a recorded call; D61), and only when the send gate allows an AI-voice call now
 *    (quiet hours, reassigned numbers, caps, California held for counsel).
 *  - M8 says first that it's an AI calling for the loan officer and the
 *    company, and asks for the client by name. Nothing about the loan is
 *    said until they say it's them; anyone else hears only "please ask them
 *    to call (loan officer)". A voicemail gets no loan details at all.
 *  - It says it keeps a written note of the call for the loan officer.
 *  - It tells them where the loan stands, from the same plain words their
 *    own page shows (D30), and answers only from that. No rates, payments,
 *    costs, dates, approvals or advice. Anything else becomes a call-back
 *    task for the loan officer, with what they asked.
 *  - "Stop calling" (or 9) ends it and stops recorded calls and texts to
 *    that number. Every reply passes the same output guard as the
 *    Concierge's notes before it's spoken; a reply that fails is replaced
 *    by the call-back offer.
 *  - Without the AI (no key, allowance used, slow), it still gives the
 *    status and offers the call-back, with no model.
 * Turn by turn over plain HTTP (Twilio <Gather input="speech">), so it runs
 * on Vercel's functions with no extra server.
 */
import { randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { accountStore, type User } from "@/lib/accounts/store";
import { companyDetails, companyOfMlo } from "@/lib/accounts/company";
import { CONFIG, mloById, type Mlo } from "@/lib/config";
import { canSee, summarize } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { loansForClient, type ClientLoan } from "@/lib/clientpage/loan";
import { checkNote } from "@/lib/concierge/guard";
import { conciergeStore } from "@/lib/concierge/store";
import { dataBlock, dataRule, newNonce } from "@/lib/concierge/data";
import { aiMeter, type Meter } from "@/lib/ai/meter";
import { redactChatInput } from "@/lib/m8/redact";
import { gateFor } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";
import { isOptOut, twilioConfig } from "@/lib/messaging/twilio";
import { callerFor, liveSiteReady, optOutPhone, spoken, twilioDialer, type Dialer } from "@/lib/voicemail/service";
import { aiCallStore, type AiCall } from "./store";

const env = (k: string) => process.env[k]?.trim() || undefined;
const iso = (d: Date) => d.toISOString();
const SITE = () => CONFIG.siteUrl.replace(/\/$/, "");
/**
 * D61 (owner, 2026-11-20): AI calls go to clients who agreed in writing or
 * out loud. Out loud counts when it's on record (a recorded call), so
 * there's proof; a bare "your word" from an import still doesn't.
 */
const CONSENTED = ["written", "web_form", "text_reply", "recorded_call"];
export const MAX_TURNS = 8;

/** Off unless the owner turns it on (CC_AI_CALLS="true"), with Twilio connected. */
export const aiCallsOn = () => env("CC_AI_CALLS") === "true" && !!twilioConfig();

export type Mailer = (m: { to: string; subject: string; text: string }) => Promise<boolean>;

/** Whether M8 may call this person now, and why not. */
export async function canAiCall(actor: User, contactId: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!aiCallsOn()) return { ok: false, error: "M8 calls are off. The owner turns them on once counsel has reviewed them." };
  const c = await contactStore().get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "No such contact." };
  const p = summarize(await contactStore().consents(c.id)).ai_call.service;
  if (!p.granted || !CONSENTED.includes(p.evidence ?? "")) return { ok: false, error: "M8 calls need the client's permission for recorded or AI-voice calls, with proof: signed, a web form, a texted yes, or a yes on a recorded call. Record it under Permission to contact." };
  const d = await gateFor(actor, c, "ai_call", "service", now);
  if (!d.allowed) return { ok: false, error: d.reasons[0] ?? "Not allowed right now." };
  const mlo = mloById(actor.mloId);
  if (!mlo) return { ok: false, error: "Your account isn't linked to your loan officer record." };
  if (!(await loansForClient(c.id, c.ownerUserId, mlo, now)).some((l) => !l.closed)) return { ok: false, error: "There's no loan in progress to update them on." };
  return { ok: true };
}

/** Places the call. */
export async function startAiCall(actor: User, contactId: string, now: Date, dial: Dialer = twilioDialer, ready: () => Promise<boolean> = () => liveSiteReady(fetch, "ai-calls")): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const can = await canAiCall(actor, contactId, now);
  if (!can.ok) return can;
  const c = (await contactStore().get(contactId))!;
  const caller = await callerFor(companyOfMlo(actor.mloId));
  if (!caller) return { ok: false, error: "There's no calling number for your company yet (Texting for your company brings one)." };
  if (!(await ready())) return { ok: false, error: `M8 calls start once this version of Command Center is live at ${SITE()}.` };
  const call: AiCall = { id: `ac_${randomBytes(9).toString("base64url")}`, ownerUserId: actor.id, contactId: c.id, contactName: `${c.firstName} ${c.lastName}`.trim() || "Contact", phone: c.phone!, from: caller.from, callSid: null, status: "queued", outcome: "", note: "", turns: [], asked: 0, at: iso(now), endedAt: null };
  await aiCallStore().put(call);
  const placed = await dial({ account: caller.account ?? twilioConfig()!.sid, from: caller.from, to: c.phone!, url: `${SITE()}/api/twilio/aicall?s=${call.id}`, statusCallback: `${SITE()}/api/twilio/aicall/status?s=${call.id}` });
  if (!placed.ok) {
    await aiCallStore().put({ ...call, status: "failed", endedAt: iso(now) });
    return { ok: false, error: placed.error };
  }
  await aiCallStore().put({ ...call, callSid: placed.sid });
  await touchStore().add({ id: `t_${randomBytes(9).toString("base64url")}`, contactId: c.id, ownerUserId: c.ownerUserId, channel: "ai_call", purpose: "service", direction: "out", body: "M8 call: loan update", status: "queued", providerId: placed.sid, note: "AI-call permission on file", at: iso(now), actor: actor.email, phone: c.phone, sender: caller.from, origin: "agent" });
  await accountStore().audit({ at: iso(now), actor: actor.email, action: "gate.send.ai_call", detail: { contactId: c.id } });
  return { ok: true, id: call.id };
}

// ---- What M8 says ----

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const say = (s: string) => `<Say voice="Polly.Joanna">${xml(s)}</Say>`;
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const gather = (id: string, inner: string) => `<Gather input="speech dtmf" numDigits="1" speechTimeout="auto" speechModel="phone_call" language="en-US" hints="loan, appraisal, underwriting, closing, documents, call me back" action="${xml(`${SITE()}/api/twilio/aicall/turn?s=${id}`)}" method="POST">${inner}</Gather>`;
const bye = (m: Mlo | undefined) => say(`I'll let ${m?.firstName ?? "your loan officer"} know we spoke. Goodbye.`);

type Ctx = { call: AiCall; first: string; mlo: Mlo | undefined; company: string; loan: ClientLoan | null };

async function contextFor(id: string, now: Date): Promise<Ctx | null> {
  const call = await aiCallStore().get(id);
  if (!call) return null;
  const [owner, c] = await Promise.all([accountStore().userById(call.ownerUserId), contactStore().get(call.contactId)]);
  if (!owner || !c) return null;
  const mlo = mloById(owner.mloId);
  const loans = await loansForClient(c.id, c.ownerUserId, mlo ?? null, now);
  return { call, first: c.firstName || "there", mlo, company: companyDetails(mlo).short || companyDetails(mlo).name, loan: loans.find((l) => !l.closed) ?? loans[0] ?? null };
}

/** The plain-words status, as their own page says it. */
export function statusLine(loan: ClientLoan | null): string {
  if (!loan) return "I don't have an update on your loan in front of me right now.";
  const waiting = [...loan.waiting, ...(loan.documents.length ? [`a few documents in your secure portal: ${loan.documents.slice(0, 3).join(", ")}`] : [])];
  return `Here's where things stand: ${loan.now}${waiting.length ? ` One thing we need from you: ${waiting[0]}` : ""}`.replace(/\s+/g, " ").trim();
}

const add = (call: AiCall, who: "m8" | "client", text: string, now: Date) => ({ ...call, turns: [...call.turns, { who, text: who === "client" ? redactChatInput(text).text.slice(0, 500) : text, at: iso(now) }].slice(-30) });

/** The first thing said once the call connects. */
export async function startTwiml(id: string, answeredBy: string, now: Date): Promise<string> {
  const x = await contextFor(id, now);
  if (!x) return twiml("<Hangup/>");
  const intro = `Hi, this is M8, an AI assistant calling for ${x.mlo?.name ?? "your loan officer"} at ${x.company}.`;
  if (answeredBy.startsWith("machine") || answeredBy === "fax") {
    // A voicemail can be heard by anyone: no loan details.
    const text = `${intro} I'm calling for ${x.first} with a quick update on their loan. Please call ${x.mlo?.firstName ?? "us"} at ${spoken(x.mlo?.phone || x.call.from)}. To stop these calls, call ${spoken(x.call.from)} and press 9.`;
    await aiCallStore().put({ ...add(x.call, "m8", text, now), status: "voicemail" });
    return twiml(`${say(text)}<Hangup/>`);
  }
  const ask = `${intro} Am I speaking with ${x.call.contactName}?`;
  await aiCallStore().put({ ...add(x.call, "m8", ask, now), status: "verifying", asked: 1 });
  return twiml(`${gather(id, say(ask))}${bye(x.mlo)}<Hangup/>`);
}

const YES = /\b(yes|yeah|yep|yup|speaking|this is (she|he|me|them)|that'?s me|it'?s me|correct|you are|i am|sure|uh[- ]?huh|mm[- ]?hmm)\b/i;
const NO = /\b(no|nope|not (here|home|available|me)|wrong (number|person)|who\??$|he'?s not|she'?s not|they'?re not)\b/i;

/** Seam for the model: one reply and what to do next, or null (then the plain path). */
export type TurnModel = (system: string, convo: string) => Promise<{ say: string; action: string; note: string } | null>;

export const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say", "action", "note"],
  properties: {
    say: { type: "string", description: "What M8 says next: one or two short spoken sentences." },
    action: { type: "string", enum: ["continue", "callback", "message", "end", "stop"] },
    note: { type: "string", description: "For callback or message: what they want, in a few words. Otherwise empty." },
  },
} as const;

export function anthropicTurn(meter: Meter): TurnModel {
  const client = new Anthropic({ apiKey: meter.apiKey, timeout: 8_000, maxRetries: 0 });
  return async (system, convo) => {
    const r = await client.messages.create({
      model: meter.model,
      max_tokens: 400,
      output_config: { effort: "low", format: { type: "json_schema", schema: TURN_SCHEMA } },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: convo }],
    } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming);
    await meter.record(r.usage);
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      const o = JSON.parse(text) as { say?: unknown; action?: unknown; note?: unknown };
      return typeof o.say === "string" && typeof o.action === "string" ? { say: o.say, action: o.action, note: typeof o.note === "string" ? o.note : "" } : null;
    } catch {
      return null;
    }
  };
}

/** The rules M8 follows on a call. Constant text; everything about the client goes in data blocks. */
export function turnSystem(nonce: string, m: { mloName: string; mloFirst: string; company: string }): string {
  return [
    `You are M8, an AI assistant on a phone call for ${m.mloName}, a licensed loan officer at ${m.company}, with one of their clients. The client already knows you're an AI and that a written note of the call goes to ${m.mloFirst}.`,
    "Your only job: tell them where their loan stands, answer from the loan status you're given, and pass anything else to the loan officer.",
    "Rules:",
    "- Use only the facts in the loan status. If it isn't there, you don't know it.",
    "- Never state, estimate or hint at interest rates, APRs, payments, fees, closing costs, cash to close, values, or any number of dollars.",
    "- Never promise or predict an approval, a closing, a date or an outcome, and never give advice about loan products or what they should do.",
    "- Never ask for or repeat a Social Security number, date of birth, account number or password, and never take documents over the phone.",
    `- For anything else (a question you can't answer from the status, a change, a complaint, a new loan, anything about money), say ${m.mloFirst} will call them back, and set action to "callback" with a few words on what they want.`,
    `- If they want to leave a message for ${m.mloFirst}, set action "message" and put the message in note.`,
    '- If they ask to stop calls, set action "stop". If they\'re done or say goodbye, set action "end".',
    "- Otherwise set action \"continue\" and end with a short question such as \"Anything else?\".",
    "- Speak plainly: one or two short sentences, no lists, no links, no spelling out of web addresses.",
    "- Never mention their family, health, age, religion, national origin, disability or any other protected trait.",
    dataRule(nonce),
  ].join("\n");
}

/** One turn: what they said, then M8's answer. */
export async function turnTwiml(id: string, p: Record<string, string>, now: Date, mail: Mailer, model?: TurnModel | null): Promise<string> {
  const x = await contextFor(id, now);
  if (!x) return twiml("<Hangup/>");
  const heard = (p.SpeechResult ?? "").trim();
  const digit = (p.Digits ?? "").trim();
  let call = heard ? add(x.call, "client", heard, now) : x.call;
  const end = async (text: string, patch: Partial<AiCall> = {}) => {
    await aiCallStore().put({ ...add(call, "m8", text, now), ...patch });
    return twiml(`${say(text)}<Hangup/>`);
  };
  const mFirst = x.mlo?.firstName ?? "your loan officer";

  // Stopping always wins, before anything else.
  if (digit === "9" || (heard && (isOptOut(heard) || /\b(stop|don'?t) call(ing)?\b/i.test(heard)))) {
    await optOutPhone(call.phone, call.from, "asked M8 to stop calling", now);
    return end("Okay. You won't get more of these calls or texts. Goodbye.", { status: "done", outcome: "stop" });
  }

  // Is it them?
  if (call.status === "verifying") {
    if (heard && YES.test(heard) && !NO.test(heard)) {
      const text = `Thanks, ${x.first}. I keep a written note of this call for ${mFirst}, and you can say stop calling at any time. ${statusLine(x.loan)} Do you have any questions?`;
      await aiCallStore().put({ ...add(call, "m8", text, now), status: "talking" });
      return twiml(`${gather(id, say(text))}${bye(x.mlo)}<Hangup/>`);
    }
    if ((heard && NO.test(heard)) || call.asked >= 2) return end(`No problem. Please ask ${call.contactName.split(" ")[0]} to call ${mFirst} at ${spoken(x.mlo?.phone || call.from)}. Goodbye.`, { status: "wrong-person" });
    const again = `Sorry, I didn't catch that. Am I speaking with ${call.contactName}?`;
    await aiCallStore().put({ ...add(call, "m8", again, now), asked: call.asked + 1 });
    return twiml(`${gather(id, say(again))}${bye(x.mlo)}<Hangup/>`);
  }

  if (!heard) return end(`I'll let ${mFirst} know we spoke. Goodbye.`, { status: "done" });
  const clientTurns = call.turns.filter((t) => t.who === "client").length;

  // The answer: the model inside the rules, or the plain path.
  let reply: { say: string; action: string; note: string } | null = null;
  if (clientTurns <= MAX_TURNS) {
    const owner = await accountStore().userById(call.ownerUserId);
    const m = model === undefined ? await aiMeter(owner, "calls", now).then((mt) => (mt ? anthropicTurn(mt) : null)).catch(() => null) : model;
    if (m) {
      const nonce = newNonce();
      const convo = [
        dataBlock(nonce, "loan_status", `${statusLine(x.loan)}${x.loan ? ` Steps: ${x.loan.phases.map((ph) => `${ph.label} (${ph.state})`).join(", ")}.` : ""}`, {}),
        ...call.turns.slice(-12).map((t) => (t.who === "client" ? dataBlock(nonce, "client_said", t.text) : `M8 said: ${t.text}`)),
        "Reply to the client's last words.",
      ].join("\n");
      reply = await m(turnSystem(nonce, { mloName: x.mlo?.name ?? "the loan officer", mloFirst: mFirst, company: x.company }), convo).catch(() => null);
    }
  }
  const fallback = { say: `That's a good one for ${mFirst}. I'll have ${mFirst} call you back.`, action: "callback", note: heard.slice(0, 200) };
  if (!reply || !["continue", "callback", "message", "end", "stop"].includes(reply.action) || !checkNote(reply.say).ok || reply.say.length > 400) reply = fallback;
  if (clientTurns > MAX_TURNS) reply = { say: `I'll have ${mFirst} call you to go over the rest.`, action: "callback", note: "wanted to talk more" };

  if (reply.action === "stop") {
    await optOutPhone(call.phone, call.from, "asked M8 to stop calling", now);
    return end("Okay. You won't get more of these calls or texts. Goodbye.", { status: "done", outcome: "stop" });
  }
  if (reply.action === "callback" || reply.action === "message") {
    const note = redactChatInput(reply.note || heard).text.slice(0, 300);
    call = { ...call, outcome: reply.action, note };
    await conciergeStore().putTask({ id: `tk_${randomBytes(8).toString("base64url")}`, ownerUserId: call.ownerUserId, contactId: call.contactId, title: reply.action === "message" ? `Message from ${call.contactName}` : `Call ${call.contactName} back`, why: `On M8's loan-update call: "${note}"`, due: iso(now).slice(0, 10), done: false, createdAt: iso(now), lane: "personal" });
    const owner = await accountStore().userById(call.ownerUserId);
    if (owner?.email) await mail({ to: owner.email, subject: `${call.contactName} ${reply.action === "message" ? "left you a message" : "would like a call back"}`, text: `On M8's loan-update call, ${call.contactName} ${reply.action === "message" ? "left a message" : "asked for a call back"}. It's on your list in Command Center: ${SITE()}/mlo/contacts/${encodeURIComponent(call.contactId)}\n\nMLO Command Center` }).catch(() => false);
    return end(`${reply.say} Thanks, ${x.first}. Goodbye.`.replace(/\s+/g, " "), { status: "done" });
  }
  if (reply.action === "end") return end(`${reply.say}`.trim() || "Thanks. Goodbye.", { status: "done" });
  await aiCallStore().put({ ...add(call, "m8", reply.say, now), status: "talking" });
  return twiml(`${gather(id, say(reply.say))}${bye(x.mlo)}<Hangup/>`);
}

/** Twilio's final word on the call. */
export async function aiCallStatus(id: string, p: Record<string, string>, now: Date): Promise<void> {
  const call = await aiCallStore().get(id);
  if (!call || (p.CallSid && call.callSid && p.CallSid !== call.callSid)) return;
  const st = p.CallStatus ?? "";
  const status = st === "no-answer" ? "no-answer" : st === "busy" ? "busy" : st === "failed" || st === "canceled" ? "failed" : call.status === "verifying" || call.status === "talking" || call.status === "queued" ? "done" : call.status;
  await aiCallStore().put({ ...call, status, endedAt: iso(now) });
  if (call.callSid) await touchStore().setStatus(call.callSid, status === "done" ? (call.outcome ? `talked (${call.outcome})` : "talked") : status);
}
