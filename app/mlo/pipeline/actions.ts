"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { createKey } from "@/lib/pipeline/keys";
import { pipelineStore } from "@/lib/pipeline/store";

/** Returns the new key once, to the page that asked (never put in a URL). */
export async function createKeyAction(label: string): Promise<{ key: string } | { error: string }> {
  const me = await currentUser();
  if (!me) return { error: "Sign in again." };
  return { key: await createKey(me.id, label) };
}

export async function deleteKeyAction(fd: FormData): Promise<void> {
  const me = await currentUser();
  if (!me) redirect("/sign-in");
  await pipelineStore().deleteKey(me.id, String(fd.get("hash") ?? ""));
  redirect("/mlo/connections#keys");
}
