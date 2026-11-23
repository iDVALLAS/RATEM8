"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { removeMonthly, setMonthly } from "@/lib/leads/spend";
import { sourceOptionsFor } from "@/lib/leads/sources";
import { LEADS } from "@/lib/content/cc-pages";
import { DEFAULT_PERIOD, isScorePeriod, scoreUsd } from "@/lib/leads/scorecard";
import { setLeadTarget } from "@/lib/profile/prefs";
import { closeMove } from "@/lib/agents/service";
import { teamStore } from "@/lib/agents/store";

const back = (ok: boolean, line: string): never => redirect(`/mlo/leads?f=${encodeFlash({ ok, lines: [line] })}#monthly`);

async function me() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

/** D83: set a source's monthly amount (the source is picked or named under "Other…"). */
export async function saveMonthlyAction(fd: FormData): Promise<void> {
  const u = await me();
  const picked = String(fd.get("source") ?? "");
  // A picked source keeps the name it was seen with; "Other…" takes what was typed.
  const name = picked === "other" ? String(fd.get("sourceOther") ?? "") : (await sourceOptionsFor(u.id)).find((o) => o.key === picked)?.label ?? picked;
  const r = await setMonthly(u, name, Number(String(fd.get("dollars") ?? "").replace(/[$,\s]/g, "")) || 0);
  revalidatePath("/mlo/expenses");
  back(r.ok, r.ok ? LEADS.monthly.saved(r.label, r.drafts) : LEADS.monthly.errors[r.error]);
}

/** D83: bound to the source's key. */
export async function removeMonthlyAction(key: string): Promise<void> {
  await removeMonthly(await me(), key);
  back(true, LEADS.monthly.removed);
}

// ---- D84: the scorecard ----

const scoreUrl = (period: string, flash?: { ok: boolean; line: string }) => {
  const p = isScorePeriod(period) ? period : DEFAULT_PERIOD;
  const q = new URLSearchParams();
  if (p !== DEFAULT_PERIOD) q.set("period", p);
  if (flash) q.set("f", encodeFlash({ ok: flash.ok, lines: [flash.line] }));
  const qs = q.toString();
  return `/mlo/leads${qs ? `?${qs}` : ""}#scorecard`;
};

/** D84: the period switch (bound to the period; no value-carrying buttons). */
export async function scorePeriodAction(period: string): Promise<void> {
  await me();
  redirect(scoreUrl(period));
}

/** D84: the target cost per loan (bound to the period shown, so the page comes back on it). */
export async function saveTargetAction(period: string, fd: FormData): Promise<void> {
  const u = await me();
  const t = LEADS.score.real.target;
  const r = await setLeadTarget(u, Number(String(fd.get("target") ?? "").replace(/[$,\s]/g, "")) || 0);
  revalidatePath("/mlo/leads");
  redirect(scoreUrl(period, r.ok ? { ok: true, line: t.saved(scoreUsd(r.cents)) } : { ok: false, line: t.errors[r.error] }));
}

/** D84: "Not now" on the Business Manager's lead-source move (bound to its id; only the loan officer's own). */
export async function dismissLeadMoveAction(period: string, id: string): Promise<void> {
  const u = await me();
  const m = await teamStore().move(id);
  const ok = !!m && m.ownerUserId === u.id && m.key.startsWith("lead-source:") && (await closeMove(u, id, "dismissed"));
  revalidatePath("/mlo/leads");
  redirect(scoreUrl(period, ok ? { ok: true, line: LEADS.score.real.move.dismissed } : { ok: false, line: LEADS.score.real.move.gone }));
}
