/**
 * lib/loa/autopilot.ts — Full-auto for the Loan Officer Assistant (D71).
 * SERVER-ONLY (the planner itself is pure).
 *
 *  - `plan(ctx)` is pure: from the file, the loan, the journey, the loan type,
 *    the switches and the time, the jobs that are due, each with the mode it
 *    runs in and, when a Full-auto job has to ask instead, the reason.
 *  - `runLoaAutopilot` claims each job once (automationStore().claim), then:
 *    Full-auto messages wait in the queue ("queued", with `sendAfter`);
 *    LO-Auth messages to escrow, title and insurance become drafts in the
 *    approval queue; LO-Auth messages to the client become Concierge
 *    proposals; reminders become tasks for the loan officer.
 *  - `sendQueued` sends what's due: in the tick, the morning run, and when
 *    the loan officer opens Command Center. Every send is checked again first
 *    and drops to LO-Auth (with the reason shown) when anything changed.
 *
 * Full-auto sends only when the recipient is confirmed, the message is the
 * unedited fixed template with nothing left to fill in, it holds no SSN,
 * birth date, account number, link or wire wording, there are no
 * attachments, the loan isn't paused or held, and (for the client and their
 * agent) the contact rules and the message check allow it. Messages to
 * contacts still go only through sendText and the gate. Caps: a daily number
 * per loan officer (15 by default), 3 a day to one address, once per loan per
 * job plus its follow-ups. CC_LOA_AUTO="false" turns every Full-auto into
 * LO-Auth. The log ("What your LOA did") and the audit never hold the message
 * or the address.
 */
import { createHash, randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { hasApplicationUrl, mloById } from "@/lib/config";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { automationStore } from "@/lib/automations/store";
import { RECIPES, stageOf } from "@/lib/automations/recipes";
import { conciergeStore } from "@/lib/concierge/store";
import { checkDraft, foreignContact } from "@/lib/concierge/guard";
import { reviewMessage } from "@/lib/agents/compliance";
import { docRequestBody } from "@/lib/journey/docs";
import { emptyJourney, journeyStore, type Journey } from "@/lib/journey/store";
import { pipelineStore, type Loan } from "@/lib/pipeline/store";
import { gateFor, sendText, type SendOutcome } from "@/lib/messaging/service";
import { redactChatInput } from "@/lib/m8/redact";
import { SSN_VALUE } from "@/lib/forms/catalog";
import { signatureFor } from "@/lib/profile/signature";
import { AUTO_ACTION, AUTO_WHY, loaAutoWords } from "@/lib/content/loa";
import { addBusinessDays, daysUntil, isDate, isWeekday } from "./dates";
import { capByKey, capRow, effectiveMode, loaAutoOn, purposeKind, type CapKey, type LoanCtx, type Mode, type Purpose, type SwitchSettings } from "./autonomy";
import { emptyFile, loaStore, type AutoEntry, type Draft, type LoaFile, type PartyRole } from "./store";
import { afterSent, autonomyOf, draftText, emailConfirmed, PARTY_LABELS, realPartySender, recompute, type PartySender } from "./service";

type Env = Record<string, string | undefined>;
const iso = (d: Date) => d.toISOString();
const rid = (p: string) => `${p}_${randomBytes(6).toString("base64url")}`;
export const pacificDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

/** Who sent a message the autopilot sent on its own (on the draft; never shown as a person). */
export const AUTO_BY = "LOA (Full-auto)";
/** The morning run (vercel.json "/api/cc/concierge/sweep" at 15:17 UTC; Hobby fires it within that hour). */
export const MORNING_RUN_UTC_HOUR = 15;
/** At most this many messages to one address in a day. */
export const PER_RECIPIENT_DAY = 3;
/** Follow-ups after the first message: escrow's fees once, the borrower's conditions twice. */
const MAX_FOLLOW_UPS: Partial<Record<CapKey, number>> = { escrow_fees: 1, borrower_conditions: 2 };

// ---- Send times ----

/** The next morning run at or after now (the start of that hour, so an early cron still finds it due). */
export function nextMorningRun(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), MORNING_RUN_UTC_HOUR, 0, 0));
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** When a Full-auto message may go: with the next morning run, or after the undo window. */
export function sendAfterFor(when: "morning" | "soon", now: Date, undoMinutes: number): string {
  return iso(when === "soon" ? new Date(now.getTime() + Math.max(1, undoMinutes) * 60_000) : nextMorningRun(now));
}

const clock = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(d);
const weekday = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" }).format(d);

/** "with tomorrow morning's run" / "at 10:17 AM PT": the real expected send time, for a flash. */
export function whenShort(d: Pick<Draft, "sendAfter" | "when">, now: Date): string {
  const at = new Date(d.sendAfter ?? now.toISOString());
  if (d.when === "soon") return at.getTime() <= now.getTime() ? "the next time Command Center runs" : `at ${clock(at)} PT`;
  const days = daysUntil(pacificDay(at), pacificDay(now));
  return days <= 0 ? "with this morning's run" : days === 1 ? "with tomorrow morning's run" : `with ${weekday(at)} morning's run`;
}

/** The line under a queued message. */
export function whenLong(d: Pick<Draft, "sendAfter" | "when">, now: Date): string {
  const at = new Date(d.sendAfter ?? now.toISOString());
  if (d.when === "soon") {
    if (at.getTime() <= now.getTime()) return "Goes out the next time Command Center runs: when you open a page, or the next scheduled run.";
    return `Goes out at ${clock(at)} PT, or when you next open Command Center.`;
  }
  return `Goes out ${whenShort(d, now)}.`;
}

// ---- The safety checks ----

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
const WIRE = /\bwir(e|es|ed|ing)\b|\brouting\s+(number|no\b)|\baccount\s+(number|no\b)|\bbank\s+account\b|\baba\b|\bswift\b/i;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const PHONE = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

/** An SSN, birth date or account number. ISO dates and phone numbers are taken out first (the chat redactor is deliberately broad). */
export function sensitive(text: string): boolean {
  if (SSN_VALUE.test(text)) return true;
  return redactChatInput(text.replace(ISO_DATE, " ").replace(PHONE, " ")).kinds.length > 0;
}

/** A fingerprint of the message as planned; anything edited no longer matches. */
export const fingerprint = (m: { to: string; toEmail: string; contactId?: string | null; subject: string; body: string }) => createHash("sha256").update(`${m.to}|${m.toEmail}|${m.contactId ?? ""}|${m.subject}|${m.body}`).digest("hex").slice(0, 24);

const isParty = (to: string): to is PartyRole => to in PARTY_LABELS;
const who = (to: string) => (isParty(to) ? PARTY_LABELS[to].replace(/ officer$/, "") : to === "agent" ? "The agent" : "The client");

export type Msg = { to: Draft["to"]; toEmail: string; contactId?: string | null; subject: string; body: string; fixed?: string };

/**
 * Why a Full-auto message can't go on its own, or null. Pure. `agentOk` is
 * the client's say-so for their agent (partnerUpdates) as it stands now.
 */
export function blockReason(m: Msg, file: LoaFile, o: { agentOk: boolean }): string | null {
  const text = `${m.subject}\n${m.body}`;
  if (m.fixed && m.fixed !== fingerprint(m)) return AUTO_WHY.edited;
  if (isParty(m.to)) {
    const p = file.parties.find((x) => x.role === m.to);
    if (!p?.email) return AUTO_WHY.noEmail(who(m.to).toLowerCase());
    if (!emailConfirmed(p)) return AUTO_WHY.unconfirmed(who(m.to));
    if (p.email.toLowerCase() !== m.toEmail.toLowerCase()) return AUTO_WHY.changed(who(m.to));
  }
  if (text.includes("[")) return AUTO_WHY.placeholder;
  if (sensitive(text)) return AUTO_WHY.sensitive;
  if (isParty(m.to)) {
    if (URL_RE.test(text)) return AUTO_WHY.link;
  } else {
    const fc = foreignContact(m.body);
    if (fc) return AUTO_WHY.foreign(fc);
  }
  if (WIRE.test(text)) return AUTO_WHY.wire;
  if (m.to === "agent") {
    if (!o.agentOk) return AUTO_WHY.agentOk;
    const r = reviewMessage(m.body, m.subject, "agent");
    if (!r.ok) return AUTO_WHY.review(r.reason);
  }
  if (m.to === "client") {
    const r = reviewMessage(m.body, m.subject, "client");
    if (!r.ok) return AUTO_WHY.review(r.reason);
  }
  if (file.hold) return AUTO_WHY.hold;
  if (file.paused) return AUTO_WHY.paused;
  return null;
}

/** A planned message that no longer has a job to do (the fees came in, title was read, the items are in). */
export function moot(d: Pick<Draft, "kind" | "fixed">, f: LoaFile, j: Journey | null): boolean {
  if (!d.fixed) return false; // only the autopilot's own; a draft the loan officer asked for stays
  switch (d.kind) {
    case "escrow_fees": return !!f.escrowFees || !!f.checks.escrow_fees?.done;
    case "open_title": return !!f.title || !!f.checks.title_opened?.done;
    case "payoffs": return !(f.title?.items ?? []).some((x) => x.payoff && x.status === "open");
    case "insurance": return !!f.checks.insurance?.done;
    case "borrower_conditions": return !!j && !j.docs.some((x) => x.phase === "final" && (x.status === "needed" || x.status === "requested"));
    default: return false;
  }
}

// ---- The planner ----

export type Trigger = "read" | "loan_change" | "sweep" | "answer" | "open";
type Person = { id: string; firstName: string; lastName: string };

export type PlanCtx = {
  file: LoaFile;
  loan: Loan;
  journey: Journey;
  purpose: Purpose | null;
  settings: SwitchSettings;
  now: Date;
  env?: Env;
  trigger: Trigger;
  /** The loan officer's first name, for sign-offs. */
  me: string;
  /** The borrower's name, for emails to escrow and title. */
  borrower: string;
  client: Person | null;
  /** The client's agent, only when the client said they may be kept updated (partnerUpdates). */
  agent: Person | null;
  /** The Automations recipes that are on (the client and agent updates share their switch). */
  recipes: string[];
  previousMilestone?: string | null;
  /** The loan officer's secure portal link, for the borrower's document requests. */
  portal: string | null;
  /** Letters from the forms library, read ahead (planning stays pure). */
  letters?: Partial<Record<"open_escrow" | "insurance", { subject: string; body: string }>>;
  sendWhen?: "morning" | "soon";
};

export type Action = {
  cap: CapKey;
  /** "skip": a stage update this loan has Off, claimed so the Automations engine leaves it alone too. */
  kind: "draft" | "send" | "text" | "task" | "skip";
  mode: Exclude<Mode, "off">;
  key: string;
  to: Draft["to"] | "lo";
  toEmail: string;
  toName: string;
  contactId: string | null;
  subject: string;
  body: string;
  draftKind: Draft["kind"] | null;
  /** Why a job the switches set to Full-auto asks the loan officer instead. */
  reason: string | null;
  wanted: Mode;
  followUp: number;
  /** The Automations recipe key this stage update shares (so it never goes twice). */
  recipeKey?: string;
  /** For borrower conditions: how many items it asks for. */
  count?: number;
};

const WIRE_PARAGRAPH = /\n*Wire instructions:[^\n]*(\n(?!\n)[^\n]*)*/;

export function plan(ctx: PlanCtx): Action[] {
  const { loan, journey: j, purpose, now, settings, env } = ctx;
  const f = recompute(ctx.file, loan, j, now);
  if (!purpose || loan.closed || loan.dead || f.paused) return [];
  const lctx: LoanCtx = { file: f, purpose, agentOk: !!ctx.agent };
  const out: Action[] = [];
  const today = pacificDay(now);
  const live = (d: Draft) => d.status !== "discarded" && d.status !== "stopped";
  const has = (kind: Draft["kind"]) => f.drafts.some((d) => d.kind === kind && live(d));
  const started = purpose === "purchase" ? !!f.contract : isDate(loan.keyDates.application);
  const opts = { purpose, leSent: !!j.dates.leSentOn, borrower: ctx.borrower };

  /** The mode it runs in, the mode the switches asked for, and why they differ. */
  const modeOf = (cap: CapKey) => {
    const c = capByKey(cap);
    const r = capRow(c, lctx, settings, now, env);
    const wanted = r.applies ? effectiveMode(c, purpose, settings, { ...f, hold: null }, now, { env: {} }) : "off";
    const why = wanted === "auto" && r.mode === "approve" ? (f.hold ? AUTO_WHY.hold : !loaAutoOn(env) ? AUTO_WHY.killed : null) : null;
    return { r, c, wanted, why };
  };
  const keyOf = (cap: CapKey, ...rest: (string | number)[]) => [`loa:${cap}:${loan.id}`, ...rest.filter((x) => x !== 0 && x !== "")].join(":");

  /** A Full-auto job drops to LO-Auth when any safety check fails. */
  const settle = (a: Action, agentOk: boolean): Action => {
    if (a.mode !== "auto" || a.kind === "task" || a.kind === "skip") return a;
    const why = blockReason({ ...a, to: a.to as Draft["to"] }, f, { agentOk });
    if (!why) return a;
    // An SSN or account number never sits in a draft either.
    const body = why === AUTO_WHY.sensitive ? redactChatInput(a.body).text : a.body;
    return { ...a, mode: "approve", kind: a.kind === "send" ? "draft" : a.kind, reason: why, body };
  };

  // Emails to escrow, title and the insurance agent.
  const email = (cap: CapKey, kind: Draft["kind"], t: { role: PartyRole; subject: string; body: string } | null, followUp = 0) => {
    if (!t) return;
    const { r, c, wanted, why } = modeOf(cap);
    if (!r.applies || r.mode === "off") return;
    const p = f.parties.find((x) => x.role === t.role);
    // No address: the job waits, and "What the contract didn't answer" asks for it.
    if (!p?.email) return;
    if (r.mode === "auto" && r.waits) {
      // Owner decision 5: a Full-auto job missing a fact waits. An email read from a document is there but
      // unconfirmed: that one is drafted for the loan officer's OK instead (confirming it lets it go on its own).
      const extra = c.needs?.(lctx, r.mode) ?? null;
      const onlyUnconfirmed = !extra && r.missing.every((k) => k.endsWith("_email") && !!f.parties.find((x) => `${x.role}_email` === k)?.email);
      if (!onlyUnconfirmed) return;
    }
    const auto = r.mode === "auto";
    const body = auto && kind === "open_escrow" ? t.body.replace(WIRE_PARAGRAPH, "") : t.body;
    const a: Action = { cap, kind: auto ? "send" : "draft", mode: auto ? "auto" : "approve", key: keyOf(cap, followUp), to: t.role, toEmail: p.email, toName: p.name, contactId: null, subject: t.subject, body, draftKind: kind, reason: why, wanted, followUp };
    out.push(settle(a, !!ctx.agent));
  };

  // Escrow's fee estimate, with one follow-up until the fees are in.
  if (started && !f.escrowFees && !f.checks.escrow_fees?.done) {
    const sent = f.drafts.filter((d) => d.kind === "escrow_fees" && d.status === "sent" && d.sentAt).sort((a, b) => a.sentAt!.localeCompare(b.sentAt!));
    const waiting = f.drafts.some((d) => d.kind === "escrow_fees" && (d.status === "draft" || d.status === "queued"));
    if (!has("escrow_fees")) email("escrow_fees", "escrow_fees", draftText(f, "escrow_fees", ctx.me, opts));
    else if (sent.length && !waiting && sent.length <= (MAX_FOLLOW_UPS.escrow_fees ?? 0)) {
      const last = pacificDay(new Date(sent[sent.length - 1].sentAt!));
      if (addBusinessDays(last, 2, isWeekday) <= today) email("escrow_fees", "escrow_fees", draftText(f, "escrow_fees", ctx.me, { ...opts, followUp: sent.length }), sent.length);
    }
  }
  // Open escrow (the Open escrow letter) and order title.
  if (started && !has("open_escrow") && ctx.letters?.open_escrow) email("open_escrow", "open_escrow", { role: "escrow", ...ctx.letters.open_escrow });
  if (started && !f.title && !f.checks.title_opened?.done && !has("open_title")) email("order_title", "open_title", draftText(f, "open_title", ctx.me, opts));
  // Payoffs, to escrow only, once the title commitment shows them.
  if ((f.title?.items ?? []).some((x) => x.payoff && x.status === "open") && !has("payoffs")) email("payoffs", "payoffs", draftText(f, "payoffs", ctx.me, opts));
  // The insurance binder (the letter leaves the lender's mortgagee clause to fill in, so it asks you until that's on file).
  if (started && !f.checks.insurance?.done && !has("insurance") && ctx.letters?.insurance) email("insurance", "insurance", { role: "insurance", ...ctx.letters.insurance });

  // The borrower's conditions: a fixed text with a count and the portal link, then up to two follow-ups.
  if (f.approvalReceivedAt && ctx.client && ctx.portal) {
    const { r, wanted, why } = modeOf("borrower_conditions");
    const docs = j.docs.filter((d) => d.phase === "final");
    const needed = docs.filter((d) => d.status === "needed").length;
    const open = needed + docs.filter((d) => d.status === "requested").length;
    const asks = (f.auto ?? []).filter((e) => e.cap === "borrower_conditions" && (e.status === "queued" || e.status === "held"));
    const last = asks.length ? pacificDay(new Date(asks[asks.length - 1].at)) : null;
    const n = asks.length;
    const due = n === 0 ? needed > 0 : open > 0 && n <= (MAX_FOLLOW_UPS.borrower_conditions ?? 0) && !!last && addBusinessDays(last, 2, isWeekday) <= today;
    if (r.applies && r.mode !== "off" && due) {
      const body = docRequestBody(ctx.client.firstName, n === 0 ? needed : open, "final", ctx.portal, ctx.me);
      const d = checkDraft(body, { names: [ctx.client.firstName, ctx.client.lastName, ctx.me] });
      if (d.ok) {
        const auto = r.mode === "auto";
        out.push(settle({ cap: "borrower_conditions", kind: "text", mode: auto ? "auto" : "approve", key: keyOf("borrower_conditions", n), to: "client", toEmail: "", toName: ctx.client.firstName, contactId: ctx.client.id, subject: "", body: d.text, draftKind: "borrower_conditions", reason: why, wanted, followUp: n, count: n === 0 ? needed : open }, !!ctx.agent));
      }
    }
  }

  // Status updates to the client and the agent, when the loan moves to a new stage.
  if (ctx.trigger === "loan_change") {
    const stage = stageOf(loan.milestone);
    if (stage && stage !== stageOf(ctx.previousMilestone ?? null)) {
      const go = (cap: "client_updates" | "agent_updates", recipeId: string, person: Person | null, client: Person | null) => {
        const recipe = RECIPES.find((x) => x.id === recipeId);
        if (!recipe?.body || !ctx.recipes.includes(recipeId) || !person) return;
        const { r, wanted, why } = modeOf(cap);
        const recipeKey = `${recipeId}:${loan.id}`;
        const base = { cap, key: keyOf(cap, stage), to: (cap === "client_updates" ? "client" : "agent") as Draft["to"], toEmail: "", toName: person.firstName, contactId: person.id, subject: "", draftKind: (cap === "client_updates" ? "client_update" : "agent_update") as Draft["kind"], wanted, followUp: 0, recipeKey };
        // Off on this loan (its own switch, or paused): claimed, so the Automations engine doesn't draft it either.
        if (!r.applies || r.mode === "off") return void out.push({ ...base, kind: "skip", mode: "approve", body: "", reason: null });
        // LO-Auth stage updates stay with the Automations engine (a Concierge proposal), as before.
        if (r.mode !== "auto") return;
        const d = checkDraft(recipe.body({ first: person.firstName, me: ctx.me, client: client?.firstName ?? "" }), { names: [person.firstName, person.lastName, client?.firstName, ctx.me] });
        if (!d.ok) return;
        out.push(settle({ ...base, kind: "text", mode: "auto", body: d.text, reason: why }, !!ctx.agent));
      };
      go("client_updates", `borrower_${stage}`, ctx.client, ctx.client);
      if (ctx.agent) go("agent_updates", `agent_${stage}`, ctx.agent, ctx.client);
    }
  }

  // Reminders to the loan officer only.
  const task = (cap: CapKey, key: string, title: string, why: string) => {
    const { r, wanted } = modeOf(cap);
    if (!r.applies || r.mode === "off") return;
    out.push({ cap, kind: "task", mode: r.mode === "auto" ? "auto" : "approve", key: keyOf(cap, key), to: "lo", toEmail: "", toName: "", contactId: null, subject: title, body: why, draftKind: null, reason: null, wanted, followUp: 0 });
  };
  for (const d of f.deadlines) {
    if (d.done || d.key === "voe") continue;
    if (d.source === "contract" && purpose !== "purchase") continue;
    const n = daysUntil(d.date, today);
    if (n >= 0 && n <= 3) task("deadline_reminders", `${d.key}:${d.date}`, `${AUTO_ACTION.deadline_reminders}: ${d.label}`, n === 0 ? "Today." : `In ${n} day${n === 1 ? "" : "s"} (${d.date}).`);
  }
  const voe = f.deadlines.find((d) => d.key === "voe");
  if (voe && !voe.done && daysUntil(voe.date, today) <= 0) task("voe_reminder", voe.date, AUTO_ACTION.voe_reminder, `It opened ${voe.date}. Re-verify employment before closing.`);
  if (j.dates.intentToProceedOn && j.steps["14A"]?.status !== "done" && !loan.keyDates.appraisal) task("appraisal_reminder", "", AUTO_ACTION.appraisal_reminder, `They said they intend to proceed on ${j.dates.intentToProceedOn}.`);

  // Never a disclosure, a lock, wires or anything the borrower signs: those have no switch.
  return out;
}

// ---- Running it ----

export type RunOut = { lines: string[]; queued: number; drafted: number; proposals: number; tasks: number };
const none = (): RunOut => ({ lines: [], queued: 0, drafted: 0, proposals: 0, tasks: 0 });

const entry = (cap: CapKey, mode: Mode, action: string, toRole: string, status: AutoEntry["status"], reason: string | null, now: Date, ref: string | null = null): AutoEntry => ({ at: iso(now), cap, mode, action, toRole, status, reason, ref });
const withLog = (f: LoaFile, more: AutoEntry[]): LoaFile => (more.length ? { ...f, auto: [...(f.auto ?? []), ...more].slice(-100) } : f);
const actionWords = (cap: CapKey, followUp = 0) => (followUp && AUTO_ACTION[`${cap}_follow`]) || AUTO_ACTION[cap] || capByKey(cap).label;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The client's agent, when the client said the agent may be kept updated. */
async function agentOf(client: Contact | null): Promise<Contact | null> {
  const p = client?.partnerUpdates;
  if (!client || !p?.allowed || !p.agentContactId) return null;
  const a = await contactStore().get(p.agentContactId).catch(() => null);
  return a && a.kind === "agent" && a.ownerUserId === client.ownerUserId && !a.locked ? a : null;
}

const person = (c: Contact | null): Person | null => (c ? { id: c.id, firstName: c.firstName, lastName: c.lastName } : null);

/** Everything the planner needs for one loan (read once). */
export async function contextFor(owner: User, loan: Loan, trigger: Trigger, now: Date, previousMilestone: string | null = null): Promise<{ ctx: PlanCtx; undoMinutes: number }> {
  const [file0, j0, a, auto] = await Promise.all([loaStore().file(loan.id), journeyStore().get(loan.id), autonomyOf(owner.id), automationStore().settings(owner.id).catch(() => ({ enabled: [] as string[] }))]);
  const file = file0 ?? emptyFile(loan.id, loan.ownerUserId);
  const journey = j0 ?? emptyJourney(loan.id, loan.ownerUserId);
  const c0 = loan.contactId ? await contactStore().get(loan.contactId).catch(() => null) : null;
  const client = c0 && c0.kind === "contact" && c0.ownerUserId === owner.id && !c0.locked ? c0 : null;
  const agent = await agentOf(client);
  const purpose = purposeKind(loan, file);
  const m = mloById(owner.mloId);
  const me = m?.firstName ?? (owner.name || "").split(" ")[0] ?? "";
  const portal = m && hasApplicationUrl(m) ? m.applicationUrl.trim() : null;
  const started = purpose === "purchase" ? !!file.contract : purpose === "refi" && isDate(loan.keyDates.application);
  let letters: PlanCtx["letters"];
  if (started && trigger !== "loan_change") {
    // The forms library imports the LOA service, so it's loaded here, not at the top.
    const { letterDraft } = await import("@/lib/forms/service");
    const [oe, ins] = await Promise.all([letterDraft(owner, loan.id, "escrow_open", now).catch(() => null), letterDraft(owner, loan.id, "insurance_request", now).catch(() => null)]);
    letters = { open_escrow: oe ? { subject: oe.title, body: oe.body } : undefined, insurance: ins ? { subject: ins.title, body: ins.body } : undefined };
  }
  const borrower = client ? `${client.firstName} ${client.lastName}`.trim() || loan.borrowerName : loan.borrowerName;
  return {
    ctx: { file, loan, journey, purpose, settings: { modes: a.modes, pausedUntil: a.pausedUntil }, now, trigger, me, borrower, client: person(client), agent: person(agent), recipes: auto.enabled, previousMilestone, portal, letters, sendWhen: a.sendWhen },
    undoMinutes: a.undoMinutes,
  };
}

/** Proposals to the client go to the Concierge desk, with the gate's answer, like every other LO-Auth text. */
async function propose(owner: User, contactId: string, body: string, why: string, now: Date): Promise<boolean> {
  const c = await contactStore().get(contactId).catch(() => null);
  if (!c) return false;
  const g = await gateFor(owner, c, "text", "service", now).catch(() => null);
  await conciergeStore().putProposal({ id: rid("p"), ownerUserId: owner.id, contactId, kind: "text", purpose: "service", body, why, source: "automation", status: "pending", gate: { allowed: !!g?.allowed, reason: g?.reasons[0] ?? null }, createdAt: iso(now), decidedAt: null, decidedBy: null });
  return true;
}

/** Marks the borrower's final-approval items as requested (the same as the Request documents button). */
async function markRequested(loanId: string, now: Date) {
  const j = await journeyStore().get(loanId);
  if (!j) return;
  let n = 0;
  for (const d of j.docs) if (d.phase === "final" && d.status === "needed") (d.status = "requested"), (d.at = iso(now)), n++;
  if (n) await journeyStore().put({ ...j, updatedAt: iso(now) });
}

/**
 * Plans and carries out the LOA's jobs on one loan. Runs after a document is
 * read, when the loan system updates the loan, in the morning run, and when
 * a question is answered. Each job is claimed once, so running it twice does
 * nothing new.
 */
export async function runLoaAutopilot(loan: Loan, trigger: Trigger, now = new Date(), opts: { previousMilestone?: string | null; env?: Env } = {}): Promise<RunOut> {
  const out = none();
  const owner = await accountStore().userById(loan.ownerUserId).catch(() => null);
  if (!owner || owner.status !== "active" || loan.closed || loan.dead) return out;
  const { ctx, undoMinutes } = await contextFor(owner, loan, trigger, now, opts.previousMilestone ?? null);
  ctx.env = opts.env;
  let f = ctx.file;
  const log: AutoEntry[] = [];
  const when = ctx.sendWhen ?? "morning";
  const audit = accountStore();
  const start = f;

  // Planned messages with nothing left to ask for are put away (the fees came in, title was read).
  for (const d of f.drafts) {
    if ((d.status !== "draft" && d.status !== "queued") || !moot(d, f, ctx.journey)) continue;
    f = { ...f, drafts: f.drafts.map((x) => (x.id === d.id ? { ...x, status: d.status === "queued" ? ("stopped" as const) : ("discarded" as const) } : x)) };
    if (d.status === "queued" && d.cap) log.push(entry(d.cap, "auto", actionWords(d.cap, d.followUp), d.to, "stopped", AUTO_WHY.moot, now, d.id));
  }
  // A Full-auto job that had to ask (an unconfirmed email, a hold) goes on its own once that's settled.
  if (ctx.purpose) {
    for (const d of f.drafts) {
      if (d.status !== "draft" || d.wanted !== "auto" || !d.cap || d.channel === "text") continue;
      if (effectiveMode(capByKey(d.cap), ctx.purpose, ctx.settings, f, now, { env: opts.env }) !== "auto") continue;
      if (blockReason(d, f, { agentOk: !!ctx.agent })) continue;
      const sendAfter = sendAfterFor(when, now, undoMinutes);
      f = { ...f, drafts: f.drafts.map((x) => (x.id === d.id ? { ...x, status: "queued", mode: "auto", autoReason: null, when, sendAfter } : x)) };
      log.push(entry(d.cap, "auto", actionWords(d.cap, d.followUp), d.to, "queued", null, now, d.id));
      out.queued++;
      out.lines.push(`${actionWords(d.cap, d.followUp)}. It goes out ${whenShort({ sendAfter, when }, now)} unless you stop it.`);
    }
  }

  for (const a of plan({ ...ctx, file: f })) {
    const claimed = await automationStore().claim({ key: a.key, ownerUserId: owner.id, recipeId: `loa.${a.cap}`, contactId: a.contactId, loanId: loan.id, outcome: a.kind === "skip" ? "off" : a.mode, at: iso(now) });
    if (!claimed) continue;
    // A stage update shares the Automations recipe's key: whichever runs first, it happens once.
    if (a.recipeKey && !(await automationStore().claim({ key: a.recipeKey, ownerUserId: owner.id, recipeId: a.recipeKey.split(":")[0], contactId: a.contactId, loanId: loan.id, outcome: a.kind === "skip" ? "loa-off" : "loa", at: iso(now) }))) continue;
    const words = actionWords(a.cap, a.followUp);
    if (a.kind === "skip") continue;
    if (a.kind === "task") {
      if (loan.contactId) await conciergeStore().putTask({ id: rid("k"), ownerUserId: owner.id, contactId: loan.contactId, title: `${loan.borrowerName}: ${a.subject}`.slice(0, 160), why: a.body, due: pacificDay(now), done: false, createdAt: iso(now) });
      log.push(entry(a.cap, a.mode, a.subject, "lo", "done", null, now));
      out.tasks++;
      continue;
    }
    const base: Draft = { id: rid("dr"), to: a.to as Draft["to"], toName: a.toName, toEmail: a.toEmail, subject: a.subject, body: a.body, kind: a.draftKind ?? "other", status: "draft", createdAt: iso(now), sentAt: null, cap: a.cap, mode: a.mode, sendAfter: null, approvedBy: null, autoReason: a.reason, wanted: a.wanted, channel: a.kind === "text" ? "text" : "email", contactId: a.contactId, followUp: a.followUp };
    base.fixed = fingerprint(base);
    if (a.mode === "auto") {
      const sendAfter = sendAfterFor(when, now, undoMinutes);
      f = { ...f, drafts: [{ ...base, status: "queued" as const, when, sendAfter }, ...f.drafts].slice(0, 40) };
      log.push(entry(a.cap, "auto", words, a.to, "queued", null, now, base.id));
      out.queued++;
      out.lines.push(`${words}. It goes out ${whenShort({ sendAfter, when }, now)} unless you stop it.`);
      continue;
    }
    if (a.wanted === "auto" && a.reason) await audit.audit({ at: iso(now), actor: "loa", action: "loa.auto.hold", detail: { loanId: loan.id, cap: a.cap, toRole: a.to } });
    if (a.kind === "text") {
      // LO-Auth messages to the client go to the Concierge desk, through the same contact rules.
      if (!(await propose(owner, a.contactId!, a.body, `Your LOA: ${lc(capByKey(a.cap).label)}${a.reason ? ` (asks you because ${a.reason})` : ""}`, now))) continue;
      if (a.cap === "borrower_conditions") await markRequested(loan.id, now);
      log.push(entry(a.cap, "approve", words, a.to, "held", a.reason, now));
      out.proposals++;
      out.lines.push(`Ready on your Concierge desk: ${lc(capByKey(a.cap).label)}${a.reason ? ` (it asks you because ${a.reason})` : ""}.`);
      continue;
    }
    f = { ...f, drafts: [base, ...f.drafts].slice(0, 40) };
    log.push(entry(a.cap, "approve", words, a.to, "held", a.reason, now, base.id));
    out.drafted++;
    out.lines.push(`Ready for your OK: ${lc(capByKey(a.cap).label)}${a.reason ? ` (it asks you because ${a.reason})` : ""}.`);
  }
  if (log.length || f !== start) await loaStore().putFile({ ...withLog(f, log), updatedAt: iso(now) });
  return out;
}

/** The morning run for one loan officer: every open loan, then whatever is due. */
export async function loaMorning(owner: User, now = new Date(), deps: SendDeps = {}): Promise<{ planned: number; sent: number }> {
  const loans = (await pipelineStore().list(owner.id).catch(() => [])).filter((l) => !l.closed && !l.dead).slice(0, 300);
  let planned = 0;
  for (const l of loans) {
    const r = await runLoaAutopilot(l, "sweep", now).catch(() => none());
    planned += r.queued + r.drafted + r.proposals + r.tasks;
  }
  const s = await sendQueued(owner, now, deps);
  return { planned, sent: s.sent };
}

// ---- Sending what's due ----

export type TextSender = (user: User, contactId: string, body: string, now: Date) => Promise<SendOutcome>;
export type SendDeps = { send?: PartySender; text?: TextSender; env?: Env };
const realText: TextSender = (user, contactId, body, now) => sendText(user, contactId, body, "service", null, now, { origin: "agent" });

/** Sent on its own today (Pacific), across this loan officer's loans. */
function sentToday(files: LoaFile[], now: Date) {
  const day = pacificDay(now);
  const out: Draft[] = [];
  for (const f of files) for (const d of f.drafts) if (d.status === "sent" && d.approvedBy === AUTO_BY && d.sentAt && pacificDay(new Date(d.sentAt)) === day) out.push(d);
  return out;
}
const toKey = (d: Pick<Draft, "toEmail" | "contactId">) => (d.contactId ? `c:${d.contactId}` : `e:${d.toEmail.toLowerCase()}`);

/**
 * Sends this loan officer's Full-auto messages that are due. Each is checked
 * again (switch still Full-auto, loan not paused or held, recipient still the
 * confirmed one, the fixed words unchanged, the contact rules) and drops to
 * LO-Auth with the reason when anything changed. Over a cap, it waits for
 * the next morning run and says so.
 */
export async function sendQueued(user: User, now = new Date(), deps: SendDeps = {}): Promise<{ sent: number; held: number; failed: number }> {
  const res = { sent: 0, held: 0, failed: 0 };
  if (user.status !== "active") return res;
  const files = await loaStore().filesFor(user.id);
  if (!files.some((f) => f.drafts.some((d) => d.status === "queued" && d.sendAfter && Date.parse(d.sendAfter) <= now.getTime()))) return res;
  const [a, loans] = await Promise.all([autonomyOf(user.id), pipelineStore().list(user.id)]);
  const settings: SwitchSettings = { modes: a.modes, pausedUntil: a.pausedUntil };
  const send = deps.send ?? realPartySender;
  const text = deps.text ?? realText;
  const done = sentToday(files, now);
  let count = done.length;
  const per = new Map<string, number>();
  for (const d of done) per.set(toKey(d), (per.get(toKey(d)) ?? 0) + 1);
  const audit = accountStore();
  const day = pacificDay(now);

  for (const file of files) {
    const due = file.drafts.filter((d) => d.status === "queued" && d.sendAfter && Date.parse(d.sendAfter) <= now.getTime()).sort((x, y) => x.sendAfter!.localeCompare(y.sendAfter!));
    if (!due.length) continue;
    let f = file;
    const log: AutoEntry[] = [];
    const loan = loans.find((l) => l.id === f.loanId);
    const set = (id: string, patch: Partial<Draft>) => void (f = { ...f, drafts: f.drafts.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
    const client = loan?.contactId ? await contactStore().get(loan.contactId).catch(() => null) : null;
    const agentOk = !!(await agentOf(client));
    const journey = await journeyStore().get(f.loanId).catch(() => null);

    for (const d of due) {
      const cap = d.cap ?? "escrow_fees";
      const words = actionWords(cap, d.followUp);
      /** Drops to LO-Auth: a draft in the approval queue, or (for the client or agent) a Concierge proposal. */
      const drop = async (reason: string, status: AutoEntry["status"] = "held") => {
        if (d.channel === "text" && d.contactId) {
          await propose(user, d.contactId, d.body, `Your LOA: ${lc(capByKey(cap).label)} (asks you because ${reason})`, now);
          set(d.id, { status: "held", mode: "approve", autoReason: reason });
        } else set(d.id, { status: "draft", mode: "approve", autoReason: reason, wanted: "auto" });
        log.push(entry(cap, "approve", words, d.to, status, reason, now, d.id));
        await audit.audit({ at: iso(now), actor: "loa", action: "loa.auto.hold", detail: { loanId: f.loanId, cap, toRole: d.to } });
        res[status === "failed" ? "failed" : "held"]++;
      };
      if (!loan || loan.closed || loan.dead || moot(d, f, journey)) {
        const why = !loan || loan.closed || loan.dead ? AUTO_WHY.closed : AUTO_WHY.moot;
        set(d.id, { status: "stopped", autoReason: why });
        log.push(entry(cap, "auto", words, d.to, "stopped", why, now, d.id));
        continue;
      }
      const purpose = purposeKind(loan, f);
      if (effectiveMode(capByKey(cap), purpose, settings, f, now, { env: deps.env }) !== "auto") {
        await drop(f.paused ? AUTO_WHY.paused : f.hold ? AUTO_WHY.hold : !loaAutoOn(deps.env) ? AUTO_WHY.killed : AUTO_WHY.switched);
        continue;
      }
      const why = blockReason(d, f, { agentOk });
      if (why) {
        await drop(why);
        continue;
      }
      // Caps: over them it waits for the next morning run, and says so once a day.
      const over = count >= a.dailyAutoSends ? AUTO_WHY.overDay(a.dailyAutoSends) : (per.get(toKey(d)) ?? 0) >= PER_RECIPIENT_DAY ? AUTO_WHY.overPerson : null;
      if (over) {
        set(d.id, { sendAfter: iso(nextMorningRun(now)), when: "morning" });
        const said = (f.auto ?? []).some((e) => e.ref === d.id && e.status === "held" && pacificDay(new Date(e.at)) === day);
        if (!said) {
          log.push(entry(cap, "auto", words, d.to, "held", over, now, d.id));
          await audit.audit({ at: iso(now), actor: "loa", action: "loa.auto.hold", detail: { loanId: f.loanId, cap, toRole: d.to } });
        }
        res.held++;
        continue;
      }
      // One sender at a time: the tick, the morning run and a page view can overlap.
      if (!(await automationStore().claim({ key: `loa-send:${d.id}`, ownerUserId: user.id, recipeId: `loa.${cap}`, contactId: d.contactId ?? null, loanId: f.loanId, outcome: "send", at: iso(now) }))) continue;
      let r: { ok: boolean; error?: string };
      if (d.channel === "text" && d.contactId) {
        const c = await contactStore().get(d.contactId).catch(() => null);
        const g = c ? await gateFor(user, c, "text", "service", now).catch(() => null) : null;
        if (!c || !g?.allowed) {
          await drop(AUTO_WHY.gate(g?.reasons[0] ?? "no such contact"));
          continue;
        }
        const t = await text(user, d.contactId, d.body, now);
        r = t.ok ? { ok: true } : { ok: false, error: t.error };
      } else {
        const sig = await signatureFor(user).catch(() => "");
        r = await send(user, d.toEmail, d.subject, sig ? `${d.body}\n\n${sig}` : d.body).catch(() => ({ ok: false, via: "", error: "the mail service didn't answer" }));
      }
      if (!r.ok) {
        await drop(AUTO_WHY.failed(r.error ?? "unknown"), "failed");
        continue;
      }
      set(d.id, { status: "sent", sentAt: iso(now), approvedBy: AUTO_BY, autoReason: null });
      f = afterSent(f, d, AUTO_BY, now);
      if (cap === "borrower_conditions") await markRequested(f.loanId, now);
      log.push(entry(cap, "auto", words, d.to, "sent", null, now, d.id));
      await audit.audit({ at: iso(now), actor: "loa", action: "loa.auto.send", detail: { loanId: f.loanId, cap, toRole: d.to } });
      count++;
      per.set(toKey(d), (per.get(toKey(d)) ?? 0) + 1);
      res.sent++;
    }
    if (loan) f = recompute(f, loan, journey ?? emptyJourney(f.loanId, f.ownerUserId), now);
    await loaStore().putFile({ ...withLog(f, log), updatedAt: iso(now) });
  }
  return res;
}

const lastRun = new Map<string, number>();
/**
 * When a loan officer opens any Command Center page: their own due messages,
 * at most once a minute per server, after the page has been sent.
 */
export async function sendQueuedOnOpen(user: User, now = new Date()): Promise<void> {
  if (user.role === "assistant" || user.status !== "active") return;
  const t = lastRun.get(user.id) ?? 0;
  if (now.getTime() - t < 60_000) return;
  lastRun.set(user.id, now.getTime());
  await sendQueued(user, now).catch(() => null);
}

// ---- The loan officer's controls ----

type Ok = { ok: true; line: string } | { ok: false; error: string };

async function own(user: User, loanId: string) {
  const { fileFor } = await import("./service");
  return fileFor(user, loanId);
}

/** Stop: a queued message won't be sent. Anyone who can see the loan may stop one. */
export async function stopQueued(user: User, loanId: string, draftId: string, now = new Date()): Promise<Ok> {
  const ctx = await own(user, loanId);
  const d = ctx?.file.drafts.find((x) => x.id === draftId);
  if (!ctx || !d || d.status !== "queued") return { ok: false, error: loaAutoWords.flash.notQueued };
  const f = { ...ctx.file, drafts: ctx.file.drafts.map((x) => (x.id === draftId ? { ...x, status: "stopped" as const } : x)) };
  await loaStore().putFile({ ...withLog(f, [entry(d.cap ?? "escrow_fees", "auto", actionWords(d.cap ?? "escrow_fees", d.followUp), d.to, "stopped", null, now, d.id)]), updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.auto.stop", detail: { loanId, cap: d.cap ?? null, toRole: d.to } });
  return { ok: true, line: loaAutoWords.flash.stopped };
}

/** "Send in 15 minutes": the undo window instead of the morning run. */
export async function sendSoon(user: User, loanId: string, draftId: string, now = new Date()): Promise<Ok> {
  const ctx = await own(user, loanId);
  const d = ctx?.file.drafts.find((x) => x.id === draftId);
  if (!ctx || !d || d.status !== "queued") return { ok: false, error: loaAutoWords.flash.notQueued };
  const a = await autonomyOf(ctx.loan.ownerUserId);
  const sendAfter = sendAfterFor("soon", now, a.undoMinutes);
  await loaStore().putFile({ ...ctx.file, drafts: ctx.file.drafts.map((x) => (x.id === draftId ? { ...x, when: "soon" as const, sendAfter } : x)), updatedAt: iso(now) });
  return { ok: true, line: loaAutoWords.flash.soon(whenLong({ sendAfter, when: "soon" }, now).replace(/\.$/, "")) };
}

/** After an email went: a correction to the same address, for the loan officer to check and send. */
export async function draftCorrection(user: User, loanId: string, draftId: string, now = new Date()): Promise<Ok> {
  const ctx = await own(user, loanId);
  const d = ctx?.file.drafts.find((x) => x.id === draftId);
  if (!ctx || !d || d.status !== "sent") return { ok: false, error: "That message hasn't gone out." };
  if (d.channel === "text" || !isParty(d.to)) return { ok: false, error: loaAutoWords.textCorrection };
  const m = mloById(user.mloId);
  const me = m?.firstName ?? (user.name || "").split(" ")[0] ?? "";
  const hi = d.toName ? `Hi ${d.toName.split(" ")[0]},` : "Hello,";
  const c: Draft = { id: rid("dr"), to: d.to, toName: d.toName, toEmail: d.toEmail, subject: `Correction: ${d.subject}`.slice(0, 120), body: `${hi}\n\nA correction to my earlier email, "${d.subject}": [write the correction here]\n\nThank you,\n${me}`, kind: "other", status: "draft", createdAt: iso(now), sentAt: null, cap: d.cap, mode: "approve", sendAfter: null, approvedBy: null, channel: "email" };
  await loaStore().putFile({ ...ctx.file, drafts: [c, ...ctx.file.drafts].slice(0, 40), updatedAt: iso(now) });
  return { ok: true, line: loaAutoWords.flash.correction };
}

/** The officer setting: Full-auto messages with the next morning run, or after the undo window. Only the loan officer. */
export async function setSendWhen(user: User, when: "morning" | "soon", now = new Date()): Promise<Ok> {
  if (user.role === "assistant" || user.status !== "active") return { ok: false, error: "Only the loan officer can change this." };
  if (when !== "morning" && when !== "soon") return { ok: false, error: "Pick when." };
  const a = await loaStore().autonomy(user.id);
  await loaStore().putAutonomy({ ...a, sendWhen: when, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "loa.autonomy", detail: { keys: "sendWhen", count: 1 } });
  return { ok: true, line: loaAutoWords.flash.when(when === "morning") };
}

/** Everything queued across the book a user works (for /mlo/loa#needs). */
export async function queuedFor(owner: string): Promise<{ loanId: string; borrower: string; draft: Draft }[]> {
  const loans = (await pipelineStore().list(owner).catch(() => [])).filter((l) => !l.closed && !l.dead);
  const files = await loaStore().filesFor(owner).catch(() => []);
  const out: { loanId: string; borrower: string; draft: Draft }[] = [];
  for (const f of files) {
    const l = loans.find((x) => x.id === f.loanId);
    if (!l) continue;
    for (const d of f.drafts) if (d.status === "queued") out.push({ loanId: l.id, borrower: l.borrowerName, draft: d });
  }
  return out.sort((x, y) => (x.draft.sendAfter ?? "").localeCompare(y.draft.sendAfter ?? ""));
}

/** D71: the morning email's line. Counts only. Empty when there's nothing to say. */
export async function loaDigestLine(user: User, now = new Date()): Promise<string> {
  const files = await loaStore().filesFor(user.id).catch(() => []);
  const since = now.getTime() - 86_400_000;
  let sent = 0;
  let waiting = 0;
  let queued = 0;
  for (const f of files) {
    sent += (f.auto ?? []).filter((e) => e.status === "sent" && Date.parse(e.at) >= since).length;
    waiting += f.drafts.filter((d) => d.status === "draft").length;
    queued += f.drafts.filter((d) => d.status === "queued").length;
  }
  return sent || waiting || queued ? loaAutoWords.morningLine(sent, waiting, queued) : "";
}
