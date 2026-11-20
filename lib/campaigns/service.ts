/**
 * lib/campaigns/service.ts — campaigns: build, enroll, run (D51).
 * SERVER-ONLY.
 *
 * A campaign is a list of steps (a text, an email, or a task for the loan
 * officer), each after "wait N days" from the step before. It runs on its
 * own (the owner's choice, 2026-11-20), but every text and email still
 * goes through the same contact rules as a hand-sent one (permission,
 * do-not-call, quiet hours in their time zone, caps, state rules, the
 * wording guard):
 *  - quiet hours: the step waits and tries again when the window opens
 *  - anything else (no permission for that channel, no address): the step
 *    is skipped with the reason logged, and the campaign moves on
 *  - a reply ends "follow up" campaigns; STOP ends every campaign
 * The campaign's own sending days and hours narrow the rules further.
 * CC_CAMPAIGNS="false" stops all of it at once.
 */
import { randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { aiCall, aiOffReason, type Meter } from "@/lib/ai/meter";
import { cleanData, dataRule, newNonce } from "@/lib/concierge/data";
import { conciergeStore } from "@/lib/concierge/store";
import { canSee, scopeOf } from "@/lib/contacts/service";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { incr } from "@/lib/m8/kv";
import { sendEmail } from "@/lib/messaging/email";
import { sendText, type SendOutcome } from "@/lib/messaging/service";
import { STATE_ZONES } from "@/lib/send-gate/rules";
import { fill, variablesOf } from "@/lib/templates/library";
import { checkTemplate, myValues } from "@/lib/templates/service";
import { CAMPAIGN_FIELDS, STARTERS, type Starter } from "./library";
import { campaignStore, CHANNELS, type Campaign, type Enrollment, type Step } from "./store";

export const MAX_STEPS = 20;
export const DAILY_CAP = 300;
export const RUN_LIMIT = 400;
export const campaignsOn = () => process.env.CC_CAMPAIGNS?.trim() !== "false";

const id = (p: string) => `${p}_${randomBytes(9).toString("base64url")}`;
const DAY = 86_400_000;
const iso = (d: Date | number) => new Date(d).toISOString();

// ---- Checks ----

export function checkStep(s: Step): string | null {
  if (!(CHANNELS as readonly string[]).includes(s.channel)) return "Pick text, email or task.";
  if (!Number.isInteger(s.waitDays) || s.waitDays < 0 || s.waitDays > 365) return "The wait is a whole number of days, 0 to 365.";
  const body = s.body.trim();
  if (!body) return "Write the message.";
  const max = s.channel === "text" ? 480 : s.channel === "email" ? 4000 : 300;
  if (body.length > max) return `Keep it under ${max} characters.`;
  const unknown = [...variablesOf(body), ...variablesOf(s.subject)].filter((v) => !(CAMPAIGN_FIELDS as readonly string[]).includes(v));
  if (unknown.length) return `{${unknown[0]}} isn't a field campaigns can fill in. Use ${CAMPAIGN_FIELDS.map((f) => `{${f}}`).join(", ")}.`;
  if (s.channel === "email") {
    if (!s.subject.trim()) return "Emails need a subject.";
    if (s.subject.length > 120) return "Keep the subject under 120 characters.";
  }
  if (s.channel !== "task") {
    const t = checkTemplate(body, s.channel === "email" ? s.subject : "");
    if (!t.ok) return `It ${t.reason}.`;
  }
  return null;
}

export function checkCampaign(c: Pick<Campaign, "name" | "steps" | "days" | "hours">): string | null {
  if (c.name.trim().length < 2 || c.name.length > 80) return "Give it a name (up to 80 characters).";
  if (!c.steps.length) return "Add at least one step.";
  if (c.steps.length > MAX_STEPS) return `Up to ${MAX_STEPS} steps.`;
  if (!c.days.length || c.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Pick at least one sending day.";
  if (!(c.hours.start >= 6 && c.hours.end <= 22 && c.hours.start < c.hours.end)) return "Sending hours must be a range between 6 AM and 10 PM.";
  for (const [i, s] of c.steps.entries()) {
    const e = checkStep(s);
    if (e) return `Step ${i + 1}: ${e}`;
  }
  return null;
}

// ---- Building ----

const fromStarterSteps = (st: Starter): Step[] => st.steps.map((s) => ({ id: id("st"), channel: s.channel, waitDays: s.waitDays, subject: s.subject ?? "", body: s.body }));

function blank(owner: User, now: Date, over: Partial<Campaign>): Campaign {
  return { id: id("cmp"), ownerUserId: owner.id, name: "New campaign", kind: "followup", purpose: "marketing", trigger: "manual", days: [1, 2, 3, 4, 5], hours: { start: 9, end: 18 }, steps: [], status: "draft", createdAt: iso(now), updatedAt: iso(now), origin: "blank", ...over };
}

export async function createCampaign(owner: User, from: { starter?: string } = {}, now = new Date()): Promise<Campaign> {
  const st = from.starter ? STARTERS.find((s) => s.id === from.starter) : undefined;
  const c = st
    ? blank(owner, now, { name: st.name, kind: st.kind, purpose: st.purpose, trigger: st.trigger, steps: fromStarterSteps(st), origin: `starter:${st.id}` })
    : blank(owner, now, { steps: [{ id: id("st"), channel: "text", waitDays: 0, subject: "", body: "Hi {first}, it's {myFirst} with {company}. " }] });
  await campaignStore().putCampaign(c);
  return c;
}

const mine = async (owner: User, campaignId: string) => {
  const c = await campaignStore().getCampaign(campaignId);
  return c && c.ownerUserId === owner.id && owner.status === "active" ? c : null;
};

export const CampaignEdit = z.object({
  name: z.string().trim().max(80),
  kind: z.enum(["followup", "nurture"]),
  purpose: z.enum(["service", "marketing"]),
  trigger: z.enum(["manual", "new_lead"]),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  hours: z.object({ start: z.number().int(), end: z.number().int() }),
  steps: z.array(z.object({ id: z.string().max(40).optional(), channel: z.enum(CHANNELS), waitDays: z.number().int(), subject: z.string().max(200).default(""), body: z.string().max(4000) })).max(MAX_STEPS),
});
export type CampaignEditInput = z.input<typeof CampaignEdit>;

/** Saves edits. An active campaign that no longer passes the checks is refused (it keeps running as it was). */
export async function saveCampaign(owner: User, campaignId: string, raw: unknown, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await mine(owner, campaignId);
  if (!c) return { ok: false, error: "No such campaign." };
  const p = CampaignEdit.safeParse(raw);
  if (!p.success) return { ok: false, error: "Check the form and try again." };
  const next: Campaign = { ...c, ...p.data, days: [...new Set(p.data.days)].sort(), steps: p.data.steps.map((s) => ({ id: s.id && /^st_[\w-]+$/.test(s.id) ? s.id : id("st"), channel: s.channel, waitDays: s.waitDays, subject: s.channel === "email" ? s.subject.trim() : "", body: s.body.trim() })), updatedAt: iso(now) };
  const err = checkCampaign(next);
  if (err && c.status === "active") return { ok: false, error: `${err} (It's still running as it was.)` };
  await campaignStore().putCampaign(next);
  return err ? { ok: false, error: `Saved as a draft. Before it can run: ${err}` } : { ok: true };
}

export async function setCampaignStatus(owner: User, campaignId: string, status: "active" | "paused", now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await mine(owner, campaignId);
  if (!c) return { ok: false, error: "No such campaign." };
  if (status === "active") {
    const err = checkCampaign(c);
    if (err) return { ok: false, error: err };
    if (!campaignsOn()) return { ok: false, error: "Campaigns are switched off for the whole platform right now (CC_CAMPAIGNS)." };
  }
  await campaignStore().putCampaign({ ...c, status, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: owner.email, action: `campaign.${status}`, detail: { campaignId } });
  return { ok: true };
}

export async function deleteCampaign(owner: User, campaignId: string): Promise<boolean> {
  const c = await mine(owner, campaignId);
  if (!c) return false;
  await campaignStore().deleteCampaign(c.id);
  return true;
}

// ---- People ----

function newEnrollment(c: Campaign, contactId: string, now: Date): Enrollment {
  return { id: id("en"), campaignId: c.id, ownerUserId: c.ownerUserId, contactId, status: "active", stepIndex: 0, nextAt: iso(now.getTime() + (c.steps[0]?.waitDays ?? 0) * DAY), startedAt: iso(now), endedAt: null, reason: "", log: [] };
}

/** Adds people from the loan officer's own book. Someone already in this campaign isn't added twice. */
export async function enroll(owner: User, campaignId: string, contactIds: string[], now = new Date()): Promise<{ added: number; skipped: number; ids: string[] } | null> {
  const c = await mine(owner, campaignId);
  if (!c) return null;
  const store = campaignStore();
  const already = new Set((await store.enrollments(c.id)).filter((e) => e.status === "active").map((e) => e.contactId));
  let added = 0, skipped = 0;
  const ids: string[] = [];
  for (const cid of [...new Set(contactIds)].slice(0, 5000)) {
    const contact = await contactStore().get(cid);
    if (!contact || !canSee(owner, contact) || contact.ownerUserId !== c.ownerUserId || already.has(cid)) {
      skipped++;
      continue;
    }
    const e = newEnrollment(c, cid, now);
    await store.putEnrollment(e);
    already.add(cid);
    ids.push(e.id);
    added++;
  }
  if (added) await accountStore().audit({ at: iso(now), actor: owner.email, action: "campaign.enroll", detail: { campaignId: c.id, added } });
  return { added, skipped, ids };
}

/** Adds everyone of one kind (past clients, leads, sphere, agents) from their book. */
export async function enrollGroup(owner: User, campaignId: string, relationship: string, now = new Date()) {
  const kind = relationship === "agent" ? "agent" : "contact";
  const { contacts } = await contactStore().list({ ownerUserId: scopeOf(owner) ?? owner.id, kind, relationship: relationship === "agent" ? undefined : relationship, limit: 5000 });
  return enroll(owner, campaignId, contacts.filter((x) => x.ownerUserId === owner.id).map((x) => x.id), now);
}

export async function stopEnrollment(owner: User, enrollmentId: string, now = new Date()): Promise<boolean> {
  const e = await campaignStore().getEnrollment(enrollmentId);
  if (!e || e.ownerUserId !== owner.id || e.status !== "active") return false;
  await campaignStore().putEnrollment({ ...e, status: "stopped", endedAt: iso(now), reason: "You took them out." });
  return true;
}

/** A reply ends "follow up" campaigns; STOP (or any opt-out) ends all of them. */
export async function onContactReply(contactId: string, optedOut: boolean, now = new Date()): Promise<number> {
  const store = campaignStore();
  let n = 0;
  for (const e of await store.activeForContact(contactId)) {
    const c = await store.getCampaign(e.campaignId);
    if (!optedOut && c && c.kind === "nurture") continue;
    await store.putEnrollment({ ...e, status: "stopped", endedAt: iso(now), reason: optedOut ? "They asked to stop." : "They replied." });
    n++;
  }
  return n;
}

// ---- Running ----

export type Senders = {
  text: (actor: User, contactId: string, body: string, purpose: Campaign["purpose"], now: Date) => Promise<SendOutcome>;
  email: (actor: User, contactId: string, subject: string, body: string, purpose: Campaign["purpose"], now: Date) => Promise<SendOutcome>;
};
export const realSenders: Senders = {
  text: (a, c, b, p, now) => sendText(a, c, b, p, null, now, { origin: "campaign" }),
  email: (a, c, s, b, p, now) => sendEmail(a, c, s, b, p, now, undefined, { origin: "campaign" }),
};

const zoneOf = (c: Contact) => (c.state && STATE_ZONES[c.state]?.[0]) || "America/Los_Angeles";
function local(tz: string, d: Date): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false }).formatToParts(d);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
  return { day: wd, hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24 };
}
export const inSendWindow = (c: Pick<Campaign, "days" | "hours">, tz: string, d: Date) => {
  const l = local(tz, d);
  return c.days.includes(l.day) && l.hour >= c.hours.start && l.hour < c.hours.end;
};
/** The first top of an hour at or after `from` inside the campaign's days and hours (in their time zone). */
export function nextSendTime(c: Pick<Campaign, "days" | "hours">, tz: string, from: Date): Date {
  if (inSendWindow(c, tz, from)) return from;
  const t = new Date(from);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    t.setTime(t.getTime() + 3_600_000);
    if (inSendWindow(c, tz, t)) return new Date(t.getTime() + 60_000);
  }
  return new Date(from.getTime() + DAY);
}

export type RunCounts = { ran: number; sent: number; skipped: number; tasks: number; waiting: number; done: number };

/** Runs one enrollment's due steps (several when the next step waits 0 days). */
export async function runEnrollment(e0: Enrollment, now = new Date(), senders: Senders = realSenders, counts: RunCounts = { ran: 0, sent: 0, skipped: 0, tasks: 0, waiting: 0, done: 0 }): Promise<RunCounts> {
  const store = campaignStore();
  let e = e0;
  const stop = async (reason: string, status: Enrollment["status"] = "stopped") => {
    await store.putEnrollment({ ...e, status, endedAt: iso(now), reason });
    if (status === "done") counts.done++;
  };
  for (let guard = 0; guard < 6 && e.status === "active" && e.nextAt <= iso(now); guard++) {
    const c = await store.getCampaign(e.campaignId);
    if (!c) return (await stop("The campaign was deleted."), counts);
    if (c.status !== "active") {
      // Paused: look again tomorrow; nothing is lost.
      await store.putEnrollment({ ...e, nextAt: iso(now.getTime() + DAY) });
      return counts;
    }
    const owner = await accountStore().userById(c.ownerUserId);
    if (!owner || owner.status !== "active") return (await stop("The loan officer's account is turned off."), counts);
    const contact = await contactStore().get(e.contactId);
    if (!contact || contact.ownerUserId !== c.ownerUserId) return (await stop("They're no longer in your book."), counts);
    const step = c.steps[e.stepIndex];
    if (!step) return (await stop("Finished.", "done"), counts);
    const tz = zoneOf(contact);
    if (step.channel !== "task" && !inSendWindow(c, tz, now)) {
      await store.putEnrollment({ ...e, nextAt: iso(nextSendTime(c, tz, now)) });
      counts.waiting++;
      return counts;
    }
    if (step.channel !== "task" && (await incr(`cc:campaign:${c.ownerUserId}:${iso(now).slice(0, 10)}`, 26 * 3600)) > DAILY_CAP) {
      await store.putEnrollment({ ...e, nextAt: iso(now.getTime() + 3 * 3_600_000) });
      counts.waiting++;
      return counts;
    }
    counts.ran++;
    const values = { ...myValues(owner), first: contact.firstName ?? "" };
    const body = fill(step.body, values);
    const subject = fill(step.subject, values);
    const missing = /\[(first|myFirst|myName|myPhone|company|bookingLink)\]/.exec(`${subject} ${body}`);
    let log: Enrollment["log"][number];
    if (missing) {
      log = { stepId: step.id, at: iso(now), outcome: "skipped", note: `Skipped: no ${missing[1] === "first" ? "first name" : missing[1]} on file to fill in.` };
      counts.skipped++;
    } else if (step.channel === "task") {
      await conciergeStore().putTask({ id: id("tk"), ownerUserId: c.ownerUserId, contactId: contact.id, title: body.slice(0, 200), why: `From your "${c.name}" campaign.`, due: iso(now).slice(0, 10), done: false, createdAt: iso(now), lane: "personal" });
      log = { stepId: step.id, at: iso(now), outcome: "task", note: "Added to your reminders." };
      counts.tasks++;
    } else {
      const r = step.channel === "text" ? (contact.phone ? await senders.text(owner, contact.id, body, c.purpose, now) : { ok: false as const, error: "No phone number on file." }) : contact.email ? await senders.email(owner, contact.id, subject, body, c.purpose, now) : { ok: false as const, error: "No email address on file." };
      if (!r.ok && r.retryAt && Date.parse(r.retryAt) > now.getTime()) {
        // Quiet hours (or a cap that clears later): try this same step again then.
        await store.putEnrollment({ ...e, nextAt: r.retryAt });
        counts.waiting++;
        return counts;
      }
      if (r.ok) {
        log = { stepId: step.id, at: iso(now), outcome: "sent", note: step.channel === "text" ? "Text sent." : "Email sent." };
        counts.sent++;
      } else {
        log = { stepId: step.id, at: iso(now), outcome: "skipped", note: `Skipped: ${(r.reasons?.[0] ?? r.error).slice(0, 200)}` };
        counts.skipped++;
      }
    }
    const nextIndex = e.stepIndex + 1;
    const next = c.steps[nextIndex];
    e = { ...e, stepIndex: nextIndex, log: [...e.log, log].slice(-60), nextAt: iso(now.getTime() + (next?.waitDays ?? 0) * DAY) };
    if (!next) {
      e = { ...e, status: "done", endedAt: iso(now), reason: "Finished." };
      counts.done++;
    }
    await store.putEnrollment(e);
  }
  return counts;
}

/** The scheduled run: every due step, oldest first. */
export async function runDue(now = new Date(), opts: { limit?: number; senders?: Senders } = {}): Promise<RunCounts> {
  const counts: RunCounts = { ran: 0, sent: 0, skipped: 0, tasks: 0, waiting: 0, done: 0 };
  if (!campaignsOn()) return counts;
  for (const e of await campaignStore().due(iso(now), opts.limit ?? RUN_LIMIT)) {
    try {
      await runEnrollment(e, now, opts.senders, counts);
    } catch {
      // One bad enrollment never stops the run; it's retried next time.
    }
  }
  return counts;
}

/** D51: a new lead goes into every active "new lead" campaign, and steps due now run at once. */
export async function onNewLead(owner: User, contactId: string, now = new Date(), senders: Senders = realSenders): Promise<number> {
  if (!campaignsOn()) return 0;
  let n = 0;
  for (const c of await campaignStore().activeByTrigger(owner.id, "new_lead")) {
    const r = await enroll(owner, c.id, [contactId], now);
    for (const eid of r?.ids ?? []) {
      const e = await campaignStore().getEnrollment(eid);
      if (e) await runEnrollment(e, now, senders).catch(() => null);
      n++;
    }
  }
  return n;
}

// ---- The AI campaign writer ----

const AI_SYSTEM = `You write follow-up campaigns for a licensed mortgage loan officer in the United States. A campaign is a short sequence of steps: a text message, an email, or a task (a reminder for the loan officer to do something, such as call).

Rules for every message:
- Honest, warm, specific, short. No pressure, urgency or scarcity. No promises about approval, rates, costs, timing or savings. Never mention interest rates, APRs, percentages, payments, or dollar amounts.
- Never describe who a home or loan is for (families, couples, age, religion, disability, national origin, and similar). Describe the help the loan officer offers.
- Don't invent facts about the person, the market or the loan officer. Only use these fields, written exactly with braces: {first} (their first name), {myFirst}, {myName}, {myPhone}, {company}, {bookingLink}.
- The first text in the campaign says who is writing: "it's {myFirst} with {company}". Texts are under 320 characters. Emails are plain text, under 1200 characters, signed {myName}.
- Nothing of value is offered for referrals (RESPA). Don't ask people to review or vouch for the loan officer.
- 3 to 8 steps. waitDays is the number of days after the previous step (0 means the same time as the previous step; the first step usually 0).
- kind: "followup" stops when they reply (for leads and people you're trying to reach); "nurture" keeps going (for past clients and partners).
- purpose: "service" only when it's about a loan they already have in process with this loan officer; otherwise "marketing".`;

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    kind: { type: "string", enum: ["followup", "nurture"] },
    purpose: { type: "string", enum: ["service", "marketing"] },
    steps: { type: "array", items: { type: "object", additionalProperties: false, properties: { channel: { type: "string", enum: ["text", "email", "task"] }, waitDays: { type: "integer" }, subject: { type: "string" }, body: { type: "string" } }, required: ["channel", "waitDays", "subject", "body"] } },
  },
  required: ["name", "kind", "purpose", "steps"],
};
const AiOut = z.object({ name: z.string(), kind: z.enum(["followup", "nurture"]), purpose: z.enum(["service", "marketing"]), steps: z.array(z.object({ channel: z.enum(CHANNELS), waitDays: z.number().int(), subject: z.string(), body: z.string() })) });

export type CampaignCall = (system: string, schema: object, userText: string) => Promise<{ json: string | null; stop: string | null }>;
function apiCall(meter: Meter): CampaignCall {
  const client = new Anthropic({ apiKey: meter.apiKey });
  return async (system, schema, userText) => {
    const r = await client.messages.create({
      model: meter.model,
      max_tokens: 4000,
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming);
    await meter.record(r.usage);
    return { json: r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") || null, stop: r.stop_reason };
  };
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z']{4,}/g) ?? []);
function closestStarter(goal: string): Starter {
  const w = words(goal);
  let best = STARTERS[0], n = -1;
  for (const s of STARTERS) {
    const k = [...words(`${s.name} ${s.summary}`)].filter((x) => w.has(x)).length;
    if (k > n) [best, n] = [s, k];
  }
  return best;
}

/** "Describe your goal": the AI drafts a campaign (a draft, never started on its own). */
export async function aiCreateCampaign(owner: User, goal: string, now = new Date(), opts: { call?: CampaignCall | null } = {}): Promise<{ ok: true; campaign: Campaign; by: "ai" | "starter"; note: string } | { ok: false; error: string }> {
  const g = goal.trim().slice(0, 800);
  if (g.length < 8) return { ok: false, error: "Say in a sentence who it's for and what you want to happen." };
  const call = opts.call !== undefined ? opts.call : await aiCall(owner, "campaigns", apiCall);
  if (call) {
    const nonce = newNonce();
    try {
      const r = await call(AI_SYSTEM, AI_SCHEMA, `${dataRule(nonce)}\nThe loan officer's goal: <data-${nonce} kind="goal">${cleanData(g, 800)}</data-${nonce}>`);
      const p = r.stop !== "refusal" && r.json ? AiOut.safeParse(JSON.parse(r.json)) : null;
      if (p?.success) {
        const steps: Step[] = p.data.steps.slice(0, 8).map((s) => ({ id: id("st"), channel: s.channel, waitDays: Math.max(0, Math.min(365, s.waitDays)), subject: s.channel === "email" ? s.subject.slice(0, 120) : "", body: s.body.slice(0, s.channel === "email" ? 4000 : 480) })).filter((s) => !checkStep(s));
        if (steps.length >= 2) {
          const c = blank(owner, now, { name: p.data.name.slice(0, 80) || "New campaign", kind: p.data.kind, purpose: p.data.purpose, steps, origin: "ai" });
          await campaignStore().putCampaign(c);
          const dropped = p.data.steps.length - steps.length;
          return { ok: true, campaign: c, by: "ai", note: dropped > 0 ? `M8 wrote it; ${dropped} step${dropped === 1 ? "" : "s"} didn't pass the wording checks and ${dropped === 1 ? "was" : "were"} left out. Read every step before you turn it on.` : "M8 wrote it. Read every step before you turn it on." };
        }
      }
    } catch {
      // fall through to the closest starter
    }
  }
  const st = closestStarter(g);
  const c = await createCampaign(owner, { starter: st.id }, now);
  return { ok: true, campaign: c, by: "starter", note: call ? `M8 couldn't write that one within the rules, so this starts from "${st.name}". Edit it to fit.` : `Writing campaigns needs the AI, and ${await aiOffReason(owner)}. This starts from "${st.name}" instead.` };
}

// ---- Summaries for the pages ----

export type CampaignSummary = { campaign: Campaign; active: number; done: number; stopped: number; sent: number; skipped: number };
export async function summaries(owner: User): Promise<CampaignSummary[]> {
  const out: CampaignSummary[] = [];
  for (const c of await campaignStore().campaigns(owner.id)) {
    const es = await campaignStore().enrollments(c.id);
    const logs = es.flatMap((e) => e.log);
    out.push({ campaign: c, active: es.filter((e) => e.status === "active").length, done: es.filter((e) => e.status === "done").length, stopped: es.filter((e) => e.status === "stopped").length, sent: logs.filter((l) => l.outcome === "sent").length, skipped: logs.filter((l) => l.outcome === "skipped").length });
  }
  return out;
}
