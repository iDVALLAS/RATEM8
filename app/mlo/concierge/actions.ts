"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { sweep } from "@/lib/concierge/agent";
import { approve, ask, closeTask, dismiss, keepMemory, saveSettings } from "@/lib/concierge/desk";
import { conciergeStore } from "@/lib/concierge/store";

const back = (ok: boolean, lines: string[], hash = "") => redirect(`/mlo/concierge?f=${encodeFlash({ ok, lines })}${hash}`);
const me = async () => (await currentUser()) ?? redirect("/sign-in");

export async function settingsAction(fd: FormData): Promise<void> {
  const u = await me();
  await saveSettings(u, { enabled: fd.get("enabled") === "on", memory: fd.get("memory") === "on", tasks: fd.get("tasks") === "on", digest: fd.get("digest") === "on", voice: String(fd.get("voice") ?? "") });
  back(true, ["Saved."]);
}

export async function sweepAction(): Promise<void> {
  const u = await me();
  const r = await sweep(u);
  if (r.mode === "off") back(false, ["Turn the Concierge on first."]);
  back(true, [`Looked at ${r.people} ${r.people === 1 ? "person" : "people"}: ${r.proposals} draft${r.proposals === 1 ? "" : "s"}, ${r.tasks} reminder${r.tasks === 1 ? "" : "s"}, ${r.remembered} note${r.remembered === 1 ? "" : "s"} to keep or forget${r.personal ? `, ${r.personal} to answer personally` : ""}${r.mode === "template" ? " (simple templates: add the Anthropic key in Vercel for written drafts)" : ""}.`, ...r.refused.slice(0, 5).map((x) => `Held back: ${x}`)]);
}

export async function approveAction(fd: FormData): Promise<void> {
  const u = await me();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const r = await approve(u, String(fd.get("id") ?? ""), fd.has("body") ? String(fd.get("body")) : null, `${origin}/api/twilio/status`);
  back(r.ok, [r.ok ? "Sent." : r.error], "#drafts");
}

export async function dismissAction(fd: FormData): Promise<void> {
  const u = await me();
  await dismiss(u, String(fd.get("id") ?? ""));
  back(true, ["Dismissed."], "#drafts");
}

export async function taskDoneAction(fd: FormData): Promise<void> {
  const u = await me();
  await closeTask(u, String(fd.get("id") ?? ""));
  back(true, ["Done."], "#reminders");
}

export async function forgetAction(fd: FormData): Promise<void> {
  const u = await me();
  const contactId = String(fd.get("contactId") ?? "");
  await conciergeStore().deleteMemory(u.id, String(fd.get("id") ?? ""));
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: true, lines: ["Forgotten."] })}#memory`);
}

/** D8.1: keep a remembered need (from a contact's page, or the desk when there's no contact). */
export async function keepAction(fd: FormData): Promise<void> {
  const u = await me();
  const contactId = String(fd.get("contactId") ?? "");
  await keepMemory(u, String(fd.get("id") ?? ""));
  if (fd.get("from") === "desk") back(true, ["Kept."], "#memory");
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: true, lines: ["Kept."] })}#memory`);
}

export async function forgetFromDeskAction(fd: FormData): Promise<void> {
  const u = await me();
  await conciergeStore().deleteMemory(u.id, String(fd.get("id") ?? ""));
  back(true, ["Forgotten."], "#memory");
}

export async function askAction(question: string): Promise<string> {
  const u = await currentUser();
  if (!u) return "Sign in again.";
  return ask(u, question);
}
