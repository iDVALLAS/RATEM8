/**
 * lib/journey/engine.ts — the Loan Journey (D17). SERVER-ONLY.
 *
 * A loan's journey is the owner's 30 steps (steps.ts), with:
 *  - steps the loan system's stages check off on their own (the furthest
 *    stage the loan has reached checks every earlier automatic step)
 *  - steps the team marks done, or "doesn't apply"
 *  - the dates the federal clocks need (timing.ts)
 *  - the lock-or-float decision, confirmed by the loan officer
 *  - borrower messages drafted onto the Concierge desk for approval
 * Nothing is sent from here.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { bookOf } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { gateFor } from "@/lib/messaging/service";
import { pipelineStore, type Loan } from "@/lib/pipeline/store";
import { conciergeStore } from "@/lib/concierge/store";
import { checkDraft } from "@/lib/concierge/guard";
import { laneFor } from "@/lib/concierge/agent";
import { STAGES, stageOf, type Stage } from "@/lib/automations/recipes";
import { hasApplicationUrl, mloById } from "@/lib/config";
import { STEPS, stepByKey, type Step } from "./steps";
import { clocks, type Clock } from "./timing";
import { emptyJourney, journeyStore, type Journey, type StepState } from "./store";

const id = (p: string) => `${p}_${randomBytes(9).toString("base64url")}`;
const pacific = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
const firstName = (u: User) => (u.name || "").trim().split(/\s+/)[0] ?? "";

/** The loan, if this user works its book. */
export async function loanFor(user: User, loanId: string): Promise<Loan | null> {
  const loans = await pipelineStore().list(bookOf(user));
  return loans.find((l) => l.id === loanId) ?? null;
}

/** The furthest of our stages the loan has reached, from its history. */
export function furthestStage(loan: Loan): Stage | null {
  let best = -1;
  for (const h of [...loan.history, { milestone: loan.milestone, at: loan.milestoneAt }]) {
    const s = stageOf(h.milestone);
    if (s) best = Math.max(best, STAGES.indexOf(s));
  }
  return best >= 0 ? STAGES[best] : null;
}

const stageDate = (loan: Loan, stage: Stage) => loan.history.find((h) => stageOf(h.milestone) === stage)?.at.slice(0, 10) ?? null;

export type JourneyView = {
  journey: Journey;
  steps: (Step & { state: StepState | null })[];
  current: Step | null;
  done: number;
  total: number;
  clocks: Clock[];
  applicationOn: string | null;
};

/** The journey as it stands: stored states, plus what the loan system has checked off. */
export async function view(loan: Loan, now = new Date()): Promise<JourneyView> {
  const j = (await journeyStore().get(loan.id)) ?? emptyJourney(loan.id, loan.ownerUserId);
  const far = furthestStage(loan);
  const reached = far ? STAGES.indexOf(far) : -1;
  const steps = STEPS.map((s) => {
    const stored = j.steps[s.key] ?? null;
    if (stored) return { ...s, state: stored };
    if (s.autoStage && STAGES.indexOf(s.autoStage) <= reached) return { ...s, state: { status: "done" as const, at: stageDate(loan, s.autoStage) ?? loan.milestoneAt.slice(0, 10), by: "your loan system", auto: true } };
    return { ...s, state: null };
  });
  const applicationOn = loan.keyDates.application ?? stageDate(loan, "application");
  const leSentOn = j.dates.leSentOn ?? stageDate(loan, "disclosures");
  const signingOn = j.dates.signingOn ?? loan.keyDates.closing;
  const open = steps.filter((s) => !s.state || s.state.status === "todo");
  return {
    journey: j,
    steps,
    current: open[0] ?? null,
    done: steps.length - open.length,
    total: steps.length,
    clocks: loan.closed || loan.dead ? [] : clocks({ today: pacific(now), applicationOn, leSentOn, intentToProceedOn: j.dates.intentToProceedOn, cdSentOn: j.dates.cdSentOn, signingOn, voeOn: j.dates.voeOn }),
    applicationOn,
  };
}

async function save(user: User, loan: Loan, change: (j: Journey) => void, now: Date, action: string, detail: Record<string, string | number | boolean | null>): Promise<void> {
  const j = (await journeyStore().get(loan.id)) ?? emptyJourney(loan.id, loan.ownerUserId);
  change(j);
  j.updatedAt = now.toISOString();
  await journeyStore().put(j);
  await accountStore().audit({ at: now.toISOString(), actor: user.email, action, detail: { loanId: loan.id, ...detail } });
}

export async function markStep(user: User, loanId: string, key: string, status: StepState["status"], note = "", now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const loan = await loanFor(user, loanId);
  const step = stepByKey(key);
  if (!loan || !step) return { ok: false, error: "No such loan or step." };
  if (step.confirm && status === "done" && user.role === "assistant") return { ok: false, error: "The loan officer confirms this step." };
  await save(user, loan, (j) => {
    j.steps[key] = { status, at: pacific(now), by: user.email, ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}) };
  }, now, "journey.step", { step: key, status });
  return { ok: true };
}

export const DATE_FIELDS = ["leSentOn", "intentToProceedOn", "cdSentOn", "signingOn", "voeOn"] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export async function setDate(user: User, loanId: string, field: DateField, value: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const loan = await loanFor(user, loanId);
  if (!loan || !(DATE_FIELDS as readonly string[]).includes(field)) return { ok: false, error: "No such loan." };
  const v = value.trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "Use a date." };
  await save(user, loan, (j) => {
    j.dates[field] = v || null;
  }, now, "journey.date", { field, set: !!v });
  return { ok: true };
}

/** Step 13: only the loan officer (not an assistant) confirms lock or float. */
export async function setLock(user: User, loanId: string, decision: "lock" | "float", now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (user.role === "assistant") return { ok: false, error: "The loan officer confirms lock or float." };
  const loan = await loanFor(user, loanId);
  if (!loan) return { ok: false, error: "No such loan." };
  await save(user, loan, (j) => {
    j.lock = { decision, by: user.email, at: now.toISOString() };
    j.steps["13"] = { status: "done", at: pacific(now), by: user.email, note: decision === "lock" ? "Locked" : "Floating" };
  }, now, "journey.lock", { decision });
  return { ok: true };
}

/** Drafts a step's borrower message onto the Concierge desk. */
export async function draftStepMessage(user: User, loanId: string, key: string, now = new Date()): Promise<{ ok: true; gateOk: boolean; reason: string | null } | { ok: false; error: string }> {
  const loan = await loanFor(user, loanId);
  const step = stepByKey(key);
  if (!loan || !step?.message) return { ok: false, error: "This step has no borrower message." };
  if (!loan.contactId) return { ok: false, error: "This loan isn't linked to a contact yet (the loan system didn't send a phone or email)." };
  const c = await contactStore().get(loan.contactId);
  if (!c) return { ok: false, error: "The borrower's contact is gone." };
  const j = (await journeyStore().get(loan.id)) ?? emptyJourney(loan.id, loan.ownerUserId);
  if (step.guard === "intent_to_proceed" && !j.dates.intentToProceedOn) return { ok: false, error: "Record that they received the Loan Estimate and said they intend to proceed (step 14B) before asking for the appraisal fee." };
  const lane = await laneFor(user, c, now);
  if (lane.kind === "skip") return { ok: false, error: `Can't draft: ${lane.why}.` };
  const mlo = mloById(user.mloId);
  const portal = mlo && hasApplicationUrl(mlo) ? mlo.applicationUrl.trim() : null;
  const me = firstName(user);
  const d = checkDraft(step.message({ first: c.firstName, me, portal }), { names: [c.firstName, c.lastName, me], places: [c.city] });
  if (!d.ok) return { ok: false, error: `The message didn't pass the checks: ${d.reason}.` };
  for (const p of await conciergeStore().proposals(loan.ownerUserId, "pending")) if (p.contactId === c.id && p.source === "automation") await conciergeStore().putProposal({ ...p, status: "stale" });
  const g = await gateFor(user, c, "text", "service", now);
  await conciergeStore().putProposal({ id: id("p"), ownerUserId: loan.ownerUserId, contactId: c.id, kind: "text", purpose: "service", body: d.text, why: `Loan journey step ${step.key}: ${step.title}`, source: "automation", status: "pending", gate: { allowed: g.allowed, reason: g.reasons[0] ?? null }, createdAt: now.toISOString(), decidedAt: null, decidedBy: null });
  await accountStore().audit({ at: now.toISOString(), actor: user.email, action: "journey.message", detail: { loanId: loan.id, step: key } });
  return { ok: true, gateOk: g.allowed, reason: g.reasons[0] ?? null };
}
