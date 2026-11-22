"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { aiCreateCampaign, createCampaign, deleteCampaign, enrollFrom, parseSource, saveCampaign, setCampaignStatus, stopEnrollment } from "@/lib/campaigns/service";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";

const me = async () => (await currentUser()) ?? redirect("/sign-in");
const go = (target: string, ok: boolean, line: string) => {
  const [path, hash] = target.split("#");
  return redirect(`${path}${path.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines: [line] }))}${hash ? `#${hash}` : ""}`);
};

/** D51: start from a starter campaign (or blank). */
export async function newCampaignAction(starter: string | null): Promise<void> {
  const c = await createCampaign(await me(), starter ? { starter } : {});
  go(`/mlo/campaigns/${c.id}`, true, "Here's your campaign. Read each step, then turn it on.");
}

/** D51: "Describe what you want" — the AI drafts it. */
export async function aiCampaignAction(fd: FormData): Promise<void> {
  const r = await aiCreateCampaign(await me(), String(fd.get("goal") ?? ""));
  if (!r.ok) go("/mlo/campaigns?new=1", false, r.error);
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

/** D78: "Add people from: [a saved list | a tag | an import | a relationship]" (one select; checked on the server). */
export async function enrollFromAction(id: string, fd: FormData): Promise<void> {
  const src = parseSource(String(fd.get("from") ?? ""));
  if (!src) go(`/mlo/campaigns/${id}#people`, false, lc.pickSource);
  const r = await enrollFrom(await me(), id, src!);
  go(`/mlo/campaigns/${id}#people`, !!r && r.added > 0, r ? lc.enrolled(r) : "Couldn't add them.");
}

/** D51: everyone of one kind (kept for old links; D78 goes through the same gate check). */
export async function enrollGroupAction(id: string, fd: FormData): Promise<void> {
  const rel = String(fd.get("group") ?? "");
  const r = ["past_client", "lead", "sphere", "agent", "other"].includes(rel) ? await enrollFrom(await me(), id, { type: "rel", rel }) : null;
  go(`/mlo/campaigns/${id}#people`, !!r && r.added > 0, r ? lc.enrolled(r) : "Pick who to add.");
}

/** D75: everyone from one import into a campaign (bound: `enrollImportAction.bind(null, campaignId, importId)`); D78: through the gate check. */
export async function enrollImportAction(id: string, importId: string): Promise<void> {
  const ok = /^imp_[A-Za-z0-9_-]{6,40}$/.test(String(importId));
  const r = ok ? await enrollFrom(await me(), id, { type: "import", id: String(importId) }) : null;
  go(`/mlo/campaigns/${id}#people`, !!r && r.added > 0, r ? lc.enrolled(r) : "Couldn't add them.");
}

export async function stopEnrollmentAction(campaignId: string, enrollmentId: string): Promise<void> {
  const ok = await stopEnrollment(await me(), enrollmentId);
  go(`/mlo/campaigns/${campaignId}#people`, ok, ok ? "Taken out of the campaign." : "Couldn't take them out.");
}
