"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { RECIPES } from "@/lib/automations/recipes";
import { runDaily, saveAutomations, setPartnerUpdates } from "@/lib/automations/engine";

const me = async () => (await currentUser()) ?? redirect("/sign-in");

export async function saveAutomationsAction(fd: FormData): Promise<void> {
  const u = await me();
  await saveAutomations(u, RECIPES.filter((r) => fd.get(r.id) === "on").map((r) => r.id));
  redirect(`/mlo/automations?f=${encodeFlash({ ok: true, lines: ["Saved. Loan updates draft as your loans move; the rest run each morning."] })}`);
}

export async function runNowAction(): Promise<void> {
  const u = await me();
  const r = await runDaily(u);
  redirect(`/mlo/automations?f=${encodeFlash({ ok: true, lines: [`Checked your book: ${r.drafted} draft${r.drafted === 1 ? "" : "s"} and ${r.reminders} reminder${r.reminders === 1 ? "" : "s"} for your Concierge desk.`, ...r.skipped.slice(0, 4).map((x) => `Skipped: ${x}`)] })}#recent`);
}

export async function partnerUpdatesAction(choice: "yes" | "no", fd: FormData): Promise<void> {
  const u = await me();
  const contactId = String(fd.get("contactId") ?? "");
  const allowed = choice === "yes";
  const r = await setPartnerUpdates(u, contactId, { allowed, agentContactId: String(fd.get("agentId") ?? "") || null, proof: String(fd.get("proof") ?? "") });
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? (allowed ? "Saved: their agent can get loan updates." : "Stopped: their agent won't get loan updates.") : r.error] })}#partner`);
}
