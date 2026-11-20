"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { setFirstDayHidden, submitReport, triageReport } from "@/lib/pilot/service";
import { sendPilotInvites } from "@/lib/pilot/invite";
import { requestOrigin } from "@/lib/mail/origin";
import { headers } from "next/headers";

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

/** D61: invite loan officers to the pilot by email; each gets their own sign-up link. */
export async function pilotInviteAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await sendPilotInvites(u, String(fd.get("people") ?? ""), requestOrigin(await headers()));
  const go = (ok: boolean, lines: string[]): never => redirect(`/mlo/pilot?f=${encodeURIComponent(encodeFlash({ ok, lines }))}#invite`);
  if (!r.ok) return go(false, [r.error]);
  const sent = r.results.filter((x) => x.ok).length;
  go(sent > 0, [
    sent ? `Invited ${sent} ${sent === 1 ? "person" : "people"}. When they sign up, they show at the top of Sign-ups marked Invited; check their NMLS record and approve.` : "Nobody was invited.",
    ...r.results.filter((x) => !x.ok).map((x) => `${x.email}: ${x.note}`),
    ...(r.bad.length ? [`Skipped (no email address): ${r.bad.slice(0, 5).join("; ")}`] : []),
  ]);
}
