"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { readRows } from "@/lib/automations/rows";
import { runDaily, saveAutomations, setPartnerUpdates } from "@/lib/automations/engine";

const me = async () => (await currentUser()) ?? redirect("/sign-in");

/**
 * D76: each automation is Off, LO-Auth or (borrower and agent updates only)
 * Full-auto. Which ones are on is saved here; Full-auto vs LO-Auth for the
 * borrower and agent updates is the LOA's shared switch, saved through the
 * LOA (both loan types), only when it changed.
 */
export async function saveAutomationsAction(fd: FormData): Promise<void> {
  const u = await me();
  const { enabled, shared } = readRows((id) => fd.get(id));
  await saveAutomations(u, enabled);
  const lines = ["Saved. Loan updates go out as your loans move; the rest run each morning."];
  const { autonomyOf, saveAutonomy } = await import("@/lib/loa/service");
  const { capByKey, officerMode, canChangeSwitches } = await import("@/lib/loa/autonomy");
  const a = await autonomyOf(u.id).catch(() => null);
  const input: { purchase: Record<string, string>; refi: Record<string, string> } = { purchase: {}, refi: {} };
  for (const [cap, want] of Object.entries(shared) as [("client_updates" | "agent_updates"), "auto" | "approve"][]) {
    const c = capByKey(cap);
    const now = a ? (["purchase", "refi"] as const).filter((t) => c.applies[t]).map((t) => officerMode(c, t, a.modes)) : [];
    if (now.length && now.every((m) => m === want)) continue;
    for (const t of ["purchase", "refi"] as const) if (c.applies[t]) input[t][cap] = want;
  }
  if (Object.keys(input.purchase).length || Object.keys(input.refi).length) {
    if (!canChangeSwitches(u, u.id)) lines.push("Full-auto stays as the loan officer set it.");
    else {
      const r = await saveAutonomy(u, input);
      if (!r.ok) lines.push(r.error);
    }
  }
  redirect(`/mlo/automations?f=${encodeFlash({ ok: true, lines })}`);
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
