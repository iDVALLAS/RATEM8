"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/accounts/auth";
import { closeMove } from "@/lib/agents/service";
import { teamStore } from "@/lib/agents/store";

/**
 * D85: "Done" on a lead plan step on Home (bound to the step's id). Only the loan officer's own steps from Lead
 * sources (`lead-step:` moves) close here; everything else is closed on AI assistants.
 */
export async function leadStepDoneAction(id: string): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const m = await teamStore().move(id);
  if (m && m.ownerUserId === u.id && m.key.startsWith("lead-step:")) await closeMove(u, id, "done");
  revalidatePath("/mlo");
  redirect("/mlo#lead-steps");
}
