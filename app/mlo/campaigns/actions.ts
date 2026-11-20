"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { aiCreateCampaign, createCampaign, deleteCampaign, enrollGroup, saveCampaign, setCampaignStatus, stopEnrollment } from "@/lib/campaigns/service";

const me = async () => (await currentUser()) ?? redirect("/sign-in");
const go = (path: string, ok: boolean, line: string) => redirect(`${path}?f=${encodeURIComponent(encodeFlash({ ok, lines: [line] }))}`);

/** D51: start from a starter campaign (or blank). */
export async function newCampaignAction(starter: string | null): Promise<void> {
  const c = await createCampaign(await me(), starter ? { starter } : {});
  go(`/mlo/campaigns/${c.id}`, true, "Here's your campaign. Read each step, then turn it on.");
}

/** D51: "Describe what you want" — the AI drafts it. */
export async function aiCampaignAction(fd: FormData): Promise<void> {
  const r = await aiCreateCampaign(await me(), String(fd.get("goal") ?? ""));
  if (!r.ok) go("/mlo/campaigns", false, r.error);
  else go(`/mlo/campaigns/${r.campaign.id}`, r.by === "ai", r.note);
}

export async function saveCampaignAction(id: string, fd: FormData): Promise<void> {
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(fd.get("data") ?? "null"));
  } catch {
    raw = null;
  }
  const r = await saveCampaign(await me(), id, raw);
  go(`/mlo/campaigns/${id}`, r.ok, r.ok ? "Saved." : r.error);
}

export async function campaignStatusAction(id: string, status: "active" | "paused"): Promise<void> {
  const r = await setCampaignStatus(await me(), id, status);
  go(`/mlo/campaigns/${id}`, r.ok, r.ok ? (status === "active" ? "It's on. Steps go out on schedule, each one through your contact rules." : "Paused. Nobody gets anything until you turn it back on.") : r.error);
}

export async function deleteCampaignAction(id: string): Promise<void> {
  const ok = await deleteCampaign(await me(), id);
  go("/mlo/campaigns", ok, ok ? "Campaign deleted." : "Couldn't delete it.");
}

export async function enrollGroupAction(id: string, fd: FormData): Promise<void> {
  const rel = String(fd.get("group") ?? "");
  if (!["past_client", "lead", "sphere", "agent", "other"].includes(rel)) go(`/mlo/campaigns/${id}`, false, "Pick who to add.");
  const r = await enrollGroup(await me(), id, rel);
  go(`/mlo/campaigns/${id}#people`, !!r, r ? `Added ${r.added} ${r.added === 1 ? "person" : "people"}${r.skipped ? ` (${r.skipped} already in it or not in your book)` : ""}.` : "Couldn't add them.");
}

export async function stopEnrollmentAction(campaignId: string, enrollmentId: string): Promise<void> {
  const ok = await stopEnrollment(await me(), enrollmentId);
  go(`/mlo/campaigns/${campaignId}#people`, ok, ok ? "Taken out of the campaign." : "Couldn't take them out.");
}
