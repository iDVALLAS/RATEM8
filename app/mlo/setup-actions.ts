"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { MANUAL_IDS, setupStore } from "@/lib/setup/checklist";

/** D24: mark a step that happens outside Command Center as done (or not). */
export async function setupMarkAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const id = String(fd.get("id") ?? "");
  if ((MANUAL_IDS as readonly string[]).includes(id)) await setupStore().setMark(u.id, id, fd.get("done") === "yes");
  redirect("/mlo#setup");
}
