"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { buildScript, logOutcome, practiceScript } from "@/lib/scripts/generate";
import type { Goal } from "@/lib/scripts/signals";
import { cleanState } from "@/lib/contacts/normalize";

const me = async () => (await currentUser()) ?? redirect("/sign-in");
const flash = (ok: boolean, lines: string[]) => encodeFlash({ ok, lines });

/** Builds a script for one contact, then goes back to where it was asked from. */
export async function buildScriptAction(fd: FormData): Promise<void> {
  const u = await me();
  const contactId = String(fd.get("contactId") ?? "");
  const from = String(fd.get("from") ?? "contact");
  const r = await buildScript(u, { contactId, goal: String(fd.get("goal") ?? "auto") as Goal, ask: String(fd.get("ask") ?? "") });
  const lines = r.ok ? [`Script ready: ${r.saved.script.title}.`, ...(r.note ? [r.note] : [])] : [r.error];
  if (from === "scripts") redirect(`/mlo/scripts?f=${flash(r.ok, lines)}${r.ok ? `&id=${r.saved.id}#script` : ""}`);
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${flash(r.ok, lines)}${r.ok ? `&script=${r.saved.id}` : ""}#script`);
}

export async function practiceScriptAction(fd: FormData): Promise<void> {
  const u = await me();
  const r = await practiceScript(u, { situation: String(fd.get("situation") ?? ""), goal: String(fd.get("goal") ?? "check_in") as Goal, state: cleanState(String(fd.get("state") ?? "")) });
  const lines = r.ok ? [`Practice script ready: ${r.saved.script.title}.`, ...(r.note ? [r.note] : [])] : [r.error];
  redirect(`/mlo/scripts?f=${flash(r.ok, lines)}${r.ok ? `&id=${r.saved.id}` : ""}#script`);
}

export async function outcomeAction(fd: FormData): Promise<void> {
  const u = await me();
  const id = String(fd.get("id") ?? "");
  const helpful = fd.get("helpful") === "yes" ? true : fd.get("helpful") === "no" ? false : null;
  const r = await logOutcome(u, id, { result: String(fd.get("result") ?? ""), helpful, note: String(fd.get("note") ?? "") });
  const back = String(fd.get("back") ?? "/mlo/scripts");
  const safe = back.startsWith("/mlo/") ? back : "/mlo/scripts";
  const sep = safe.includes("?") ? "&" : "?";
  redirect(`${safe}${sep}f=${flash(r.ok, [r.ok ? "Logged. Thanks: this helps the scripts get better." : r.error])}#script`);
}
