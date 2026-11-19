"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { answerIdea, recordPayment, recordSpend, setMember, setPreference, suggestIdea } from "@/lib/membership/service";
import { COOP_CHANNELS } from "@/lib/membership/store";

const back = (ok: boolean, line: string, hash = "") => redirect(`/mlo/network?f=${encodeFlash({ ok, lines: [line] })}${hash}`);

export async function setMemberAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await setMember(u, String(fd.get("userId") ?? ""), { area: String(fd.get("area") ?? ""), feeDollars: Number(fd.get("fee") ?? NaN), recruitedBy: String(fd.get("recruitedBy") ?? "") || null, joinedOn: String(fd.get("joinedOn") ?? ""), plan: String(fd.get("plan") ?? "") });
  back(r.ok, r.ok ? "Saved." : r.error, "#members");
}

export async function paymentAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await recordPayment(u, String(fd.get("userId") ?? ""), String(fd.get("month") ?? ""));
  if (!r.ok) back(false, r.error, "#members");
  else {
    const p = r.payment;
    const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
    back(true, `Recorded ${p.month}: ${$(p.paidCents)} paid${p.creditUsedCents ? ` after ${$(p.creditUsedCents)} credit` : ""}, ${$(p.coopCents)} to the ${p.area} co-op${p.credit ? `, ${$(p.credit.cents)} credit ${p.credit.status === "held" ? "held for" : "to"} the loan officer who brought them in` : ""}.`, "#members");
  }
}

export async function spendAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await recordSpend(u, { area: String(fd.get("area") ?? ""), month: String(fd.get("month") ?? ""), dollars: Number(fd.get("dollars") ?? NaN), what: String(fd.get("what") ?? ""), channel: String(fd.get("channel") ?? ""), proof: String(fd.get("proof") ?? ""), locationOnly: fd.get("locationOnly") === "yes" });
  back(r.ok, r.ok ? "Spend recorded. Every member in that area can see it." : r.error, "#coop");
}

/** D36: a member's say in their area's split. */
export async function prefAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const split = Object.fromEntries(COOP_CHANNELS.map((c) => [c, Number(fd.get(`pct_${c}`) || 0)]));
  const r = await setPreference(u, split);
  back(r.ok, r.ok ? "Saved. Your area's plan is the average of every member's split." : r.error, "#say");
}

export async function ideaAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const d = String(fd.get("dollars") ?? "").trim();
  const r = await suggestIdea(u, String(fd.get("text") ?? ""), d ? Number(d) : null);
  back(r.ok, r.ok ? "Sent. You'll see the answer here." : r.error, "#say");
}

/** Bound to the idea and the answer (bound values, never name/value buttons). */
export async function answerIdeaAction(ideaId: string, status: "approved" | "declined" | "done", fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await answerIdea(u, ideaId, status, String(fd.get("reply") ?? ""));
  back(r.ok, r.ok ? "Answered." : r.error, "#ideas");
}
