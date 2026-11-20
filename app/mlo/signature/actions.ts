"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { saveSignature } from "@/lib/profile/signature";

/** D49: save (or clear) the email signature. */
export async function saveSignatureAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await saveSignature(u, String(fd.get("signature") ?? ""));
  const f = r.ok ? { ok: true, lines: [r.text ? "Saved. It goes under every email you send from here." : "Signature removed."] } : { ok: false, lines: [r.error] };
  redirect(`/mlo/signature?f=${encodeURIComponent(encodeFlash(f))}`);
}
