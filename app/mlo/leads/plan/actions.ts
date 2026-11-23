"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { setLeadTarget } from "@/lib/profile/prefs";
import { cleanBudget } from "@/lib/leads/plan";
import { savePlan } from "@/lib/leads/plan-service";
import { scoreUsd } from "@/lib/leads/scorecard";
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { LEADS } from "@/lib/content/cc-pages";

/**
 * D86: the budget planner's actions. Each preset, the target and Save are bound to their value
 * (`action.bind(null, dollars)`), never a value-carrying button. Nothing here spends money, signs up for a vendor
 * or contacts anyone: the planner only saves the plan and adds its steps to Today.
 */

async function me() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

const planUrl = (dollars: number | null, flash?: { ok: boolean; line: string }, hash = "") => {
  const q = new URLSearchParams();
  if (dollars !== null) q.set("budget", String(dollars));
  if (flash) q.set("f", encodeFlash({ ok: flash.ok, lines: [flash.line] }));
  const qs = q.toString();
  return `/mlo/leads/plan${qs ? `?${qs}` : ""}${hash}`;
};

/** A preset ($750, $1,500, $3,000 a month), bound to its amount. */
export async function pickBudgetAction(dollars: number): Promise<void> {
  await me();
  redirect(planUrl(cleanBudget(dollars), undefined, "#split"));
}

/** Your own amount a month. */
export async function customBudgetAction(fd: FormData): Promise<void> {
  await me();
  const d = cleanBudget(String(fd.get("dollars") ?? "").replace(/[$,\s]/g, ""));
  redirect(d === null ? planUrl(null, { ok: false, line: LEAD_PLAN.budget.errors.range }) : planUrl(d, undefined, "#split"));
}

/** The target cost per loan (the scorecard's own setting), bound to the budget on screen. */
export async function planTargetAction(dollars: number, fd: FormData): Promise<void> {
  const u = await me();
  const r = await setLeadTarget(u, Number(String(fd.get("target") ?? "").replace(/[$,\s]/g, "")) || 0);
  revalidatePath("/mlo/leads");
  const line = r.ok ? LEAD_PLAN.budget.targetSaved(scoreUsd(r.cents)) : LEADS.score.real.target.errors[r.error];
  redirect(planUrl(cleanBudget(dollars), { ok: r.ok, line }, "#budget"));
}

/** "Save as my 90-day plan", bound to the budget on screen. Then Lead sources shows the plan card. */
export async function savePlanAction(dollars: number): Promise<void> {
  const u = await me();
  const r = await savePlan(u, dollars);
  revalidatePath("/mlo/leads");
  revalidatePath("/mlo");
  if (!r.ok) redirect(planUrl(cleanBudget(dollars), { ok: false, line: LEAD_PLAN.save.errors[r.error] }));
  const line = r.kind === "new" ? LEAD_PLAN.save.saved : r.kind === "changed" ? LEAD_PLAN.save.changed : LEAD_PLAN.save.restarted;
  redirect(`/mlo/leads?f=${encodeFlash({ ok: true, lines: [line] })}#plan`);
}
