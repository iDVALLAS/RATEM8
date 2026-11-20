"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { startAiCall } from "@/lib/aicalls/service";

/** D58: have M8 call this client with a loan update. */
export async function aiCallAction(contactId: string): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await startAiCall(u, contactId, new Date());
  redirect(`/mlo/contacts/${encodeURIComponent(contactId)}?f=${encodeURIComponent(encodeFlash({ ok: r.ok, lines: [r.ok ? "M8 is calling. It checks it's them before saying anything about the loan; the note of the call will show here." : r.error] }))}#m8-calls`);
}
