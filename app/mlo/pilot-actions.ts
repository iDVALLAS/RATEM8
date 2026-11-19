"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { setFirstDayHidden, submitReport, triageReport } from "@/lib/pilot/service";

export type ReportState = { ok: boolean; ref?: string; masked?: boolean; emailed?: boolean; error?: string } | null;

/** D44: Report a problem, from any Command Center page. */
export async function reportAction(_prev: ReportState, fd: FormData): Promise<ReportState> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Sign in with your email to send a report." };
  const r = await submitReport(u, { kind: String(fd.get("kind") ?? ""), message: String(fd.get("message") ?? ""), path: String(fd.get("path") ?? ""), width: fd.get("width"), theme: fd.get("theme") });
  return r.ok ? { ok: true, ref: r.ref, masked: r.masked, emailed: r.emailed } : { ok: false, error: r.error };
}

/** D44: hide or show "Your first day" on Home. */
export async function firstDayAction(hidden: boolean): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  await setFirstDayHidden(u, hidden);
  redirect(hidden ? "/mlo" : "/mlo#first-day");
}

/** D44: the owner's status and note on a report; the reporter is emailed. */
export async function triageAction(id: string, fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await triageReport(u, id, String(fd.get("status") ?? ""), String(fd.get("note") ?? ""));
  const f = r.ok ? { ok: true, lines: [r.emailed ? "Saved, and emailed to them." : "Saved."] } : { ok: false, lines: [r.error] };
  redirect(`/mlo/pilot?f=${encodeURIComponent(encodeFlash(f))}#reports`);
}
