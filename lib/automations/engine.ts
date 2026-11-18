/**
 * lib/automations/engine.ts — runs the recipes (D10). SERVER-ONLY.
 *
 *  - onLoanChange: called by the loan-system sync when a loan's stage
 *    changes. Each recipe fires once per loan.
 *  - runDaily: called by the morning run, for "N days after closing" and
 *    "new contact" recipes. Each fires once per person.
 * Everything lands in the Concierge desk as a draft (source "automation")
 * or as a reminder. Nothing is sent from here.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { summarize } from "@/lib/contacts/service";
import { gateFor } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";
import type { Loan } from "@/lib/pipeline/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { conciergeStore } from "@/lib/concierge/store";
import { checkDraft } from "@/lib/concierge/guard";
import { laneFor } from "@/lib/concierge/agent";
import { RECIPES, stageOf, type Recipe } from "./recipes";
import { automationStore } from "./store";

const DAY = 86_400_000;
const id = (p: string) => `${p}_${randomBytes(9).toString("base64url")}`;
const firstName = (u: User) => (u.name || "").trim().split(/\s+/)[0] ?? "";

export type RunResult = { drafted: number; reminders: number; skipped: string[] };

/** Is anyone telling us not to contact this person? */
async function stopped(c: Contact): Promise<boolean> {
  const s = summarize(await contactStore().consents(c.id));
  return Object.values(s).some((p) => p.service.evidence === "revoked" || p.marketing.evidence === "revoked") || (!!c.phone && (await touchStore().optedOut(c.phone)));
}

/** The client's agent, when the client has said the agent may be kept updated. */
export async function agentFor(borrower: Contact): Promise<Contact | null> {
  const p = borrower.partnerUpdates;
  if (!p?.allowed || !p.agentContactId) return null;
  const a = await contactStore().get(p.agentContactId);
  return a && a.kind === "agent" && a.ownerUserId === borrower.ownerUserId && !a.locked ? a : null;
}

async function apply(user: User, recipe: Recipe, to: Contact, client: Contact, key: string, loanId: string | null, now: Date, out: RunResult): Promise<void> {
  const label = `${recipe.label}: ${to.firstName || "someone"}`;
  if (to.locked) return void out.skipped.push(`${label} (on hold)`);
  if (await stopped(to)) return void out.skipped.push(`${label} (said stop)`);
  if (recipe.purpose === "marketing") {
    const lane = await laneFor(user, to, now);
    if (lane.kind !== "work") return void out.skipped.push(`${label} (${lane.kind === "skip" ? lane.why : "answer them personally first"})`);
  }
  const at = now.toISOString();
  if (recipe.task) {
    if (!(await automationStore().claim({ key, ownerUserId: user.id, recipeId: recipe.id, contactId: to.id, loanId, outcome: "reminder", at }))) return;
    await conciergeStore().putTask({ id: id("k"), ownerUserId: user.id, contactId: to.id, title: recipe.task({ first: to.firstName, client: client.firstName }), why: recipe.description, due: at.slice(0, 10), done: false, createdAt: at });
    out.reminders++;
    return;
  }
  if (!recipe.body) return;
  const d = checkDraft(recipe.body({ first: to.firstName, me: firstName(user), client: client.firstName }), { names: [to.firstName, to.lastName, client.firstName, firstName(user)], places: [to.city] });
  if (!d.ok) return void out.skipped.push(`${label} (the draft didn't pass the checks: ${d.reason})`);
  if (!(await automationStore().claim({ key, ownerUserId: user.id, recipeId: recipe.id, contactId: to.id, loanId, outcome: "drafted", at }))) return;
  // An older stage update still waiting is out of date now.
  for (const p of await conciergeStore().proposals(user.id, "pending")) if (p.contactId === to.id && p.source === "automation") await conciergeStore().putProposal({ ...p, status: "stale" });
  const gate = await gateFor(user, to, "text", recipe.purpose, now);
  await conciergeStore().putProposal({ id: id("p"), ownerUserId: user.id, contactId: to.id, kind: "text", purpose: recipe.purpose, body: d.text, why: recipe.label, source: "automation", status: "pending", gate: { allowed: gate.allowed, reason: gate.reasons[0] ?? null }, createdAt: at, decidedAt: null, decidedBy: null });
  out.drafted++;
}

/** A loan moved to a new stage in the loan officer's loan system. */
export async function onLoanChange(loan: Loan, previousMilestone: string | null, now = new Date()): Promise<RunResult> {
  const out: RunResult = { drafted: 0, reminders: 0, skipped: [] };
  const stage = stageOf(loan.milestone);
  if (!stage || stage === stageOf(previousMilestone) || loan.dead || !loan.contactId) return out;
  const settings = await automationStore().settings(loan.ownerUserId);
  const recipes = RECIPES.filter((r) => settings.enabled.includes(r.id) && r.trigger.kind === "stage" && r.trigger.stage === stage);
  if (!recipes.length) return out;
  const [user, borrower] = await Promise.all([accountStore().userById(loan.ownerUserId), contactStore().get(loan.contactId)]);
  if (!user || user.status !== "active" || !borrower || borrower.ownerUserId !== user.id) return out;
  for (const r of recipes) {
    if (r.to === "borrower") await apply(user, r, borrower, borrower, `${r.id}:${loan.id}`, loan.id, now, out);
    else {
      const a = await agentFor(borrower);
      if (!a) out.skipped.push(`${r.label} (${borrower.partnerUpdates?.allowed ? "pick their agent on the client's page" : "the client hasn't said their agent may be updated"})`);
      else await apply(user, r, a, borrower, `${r.id}:${loan.id}`, loan.id, now, out);
    }
  }
  if (out.drafted || out.reminders) await accountStore().audit({ at: now.toISOString(), actor: "automations", action: "automations.stage", detail: { owner: user.id, loanId: loan.id, stage, drafted: out.drafted, reminders: out.reminders } });
  return out;
}

/** The morning pass: after-closing check-ins and new contacts. */
export async function runDaily(user: User, now = new Date()): Promise<RunResult> {
  const out: RunResult = { drafted: 0, reminders: 0, skipped: [] };
  const settings = await automationStore().settings(user.id);
  const recipes = RECIPES.filter((r) => settings.enabled.includes(r.id) && r.trigger.kind !== "stage");
  if (!recipes.length) return out;
  const { contacts } = await contactStore().list({ ownerUserId: user.id, kind: "contact", limit: 2000 });
  const loans = await pipelineStore().list(user.id);
  const closedOn = (c: Contact) => c.loan?.closedOn ?? loans.find((l) => l.contactId === c.id && l.closed)?.keyDates.closing ?? null;
  const consents = await contactStore().consentsFor(contacts.map((c) => c.id));
  for (const r of recipes) {
    for (const c of contacts) {
      if (r.trigger.kind === "closed_days") {
        const on = closedOn(c);
        if (!on) continue;
        const days = (now.getTime() - Date.parse(`${on.slice(0, 10)}T12:00:00Z`)) / DAY;
        // A one-week window, so a missed morning still catches it; the key makes it once per person.
        if (days < r.trigger.days || days > r.trigger.days + 7) continue;
        await apply(user, r, c, c, `${r.id}:${c.id}`, null, now, out);
      } else if (r.trigger.kind === "new_contact") {
        if (now.getTime() - Date.parse(c.createdAt) > 3 * DAY) continue;
        const s = summarize(consents.filter((e) => e.contactId === c.id));
        if (Object.values(s).some((p) => p.service.granted || p.marketing.granted || p.service.evidence === "revoked" || p.marketing.evidence === "revoked")) continue;
        await apply(user, r, c, c, `${r.id}:${c.id}`, null, now, out);
      }
    }
  }
  if (out.drafted || out.reminders) await accountStore().audit({ at: now.toISOString(), actor: "automations", action: "automations.daily", detail: { owner: user.id, drafted: out.drafted, reminders: out.reminders } });
  return out;
}

export async function saveAutomations(actor: User, enabled: string[], now = new Date()): Promise<void> {
  const valid = enabled.filter((x) => RECIPES.some((r) => r.id === x));
  await automationStore().putSettings({ ownerUserId: actor.id, enabled: [...new Set(valid)], updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "automations.settings", detail: { enabled: valid.length } });
}

/**
 * The client's say-so for their agent to hear how the loan is going (GLBA:
 * the loan officer records the client's direction, how they gave it, and
 * which agent). Revocable any time.
 */
export async function setPartnerUpdates(actor: User, contactId: string, input: { allowed: boolean; agentContactId: string | null; proof: string }, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || c.ownerUserId !== actor.id || c.kind !== "contact") return { ok: false, error: "No such client." };
  if (input.allowed) {
    const a = input.agentContactId ? await store.get(input.agentContactId) : null;
    if (!a || a.kind !== "agent" || a.ownerUserId !== actor.id) return { ok: false, error: "Pick their agent from your agents." };
    if (input.proof.trim().length < 4) return { ok: false, error: "Say how they told you (for example, \"said yes by text, Nov 18\")." };
  }
  await store.put({ ...c, partnerUpdates: { allowed: input.allowed, agentContactId: input.allowed ? input.agentContactId : null, proof: input.proof.trim().slice(0, 300), at: now.toISOString(), by: actor.email }, updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: input.allowed ? "partner_updates.allow" : "partner_updates.revoke", detail: { contactId } });
  return { ok: true };
}
