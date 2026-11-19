"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { grade, logWeek, practiceCoach, practiceTurn, saveCoachNote, saveNumbers, saveSessionNotes, type CoachResult, type GradeResult, type PracticeReply, type Turn } from "@/lib/academy/service";

async function me() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

export async function gradeAction(sessionId: string, answers: number[]): Promise<GradeResult> {
  return grade(await me(), sessionId, answers);
}

export async function practiceAction(sessionId: string, history: Turn[]): Promise<PracticeReply> {
  return practiceTurn(sessionId, history, { user: await me() });
}

export async function coachAction(sessionId: string, history: Turn[]): Promise<CoachResult> {
  return practiceCoach(sessionId, history, { user: await me() });
}

export async function notesAction(sessionId: string, fd: FormData): Promise<void> {
  const r = await saveSessionNotes(await me(), sessionId, String(fd.get("notes") ?? ""));
  redirect(`/mlo/academy/${sessionId}?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Saved." : r.error] })}#notes`);
}

export async function coachNoteAction(sessionId: string, fd: FormData): Promise<void> {
  const r = await saveCoachNote(await me(), sessionId, String(fd.get("text") ?? ""));
  redirect(`/mlo/academy/${sessionId}?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Coaching note saved for everyone." : r.error] })}#coach`);
}

export async function numbersAction(fd: FormData): Promise<void> {
  const r = await saveNumbers(await me(), { monthlyPurchaseGoal: fd.get("goal"), weeklyConversations: fd.get("conversations"), weeklyMeetings: fd.get("meetings") });
  redirect(`/mlo/academy?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Targets saved." : r.error] })}#numbers`);
}

export async function weekAction(fd: FormData): Promise<void> {
  const r = await logWeek(await me(), { week: String(fd.get("week") ?? ""), conversations: fd.get("conversations"), meetings: fd.get("meetings"), followUps: fd.get("followUps"), introductions: fd.get("introductions") });
  redirect(`/mlo/academy?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Week logged." : r.error] })}#numbers`);
}
