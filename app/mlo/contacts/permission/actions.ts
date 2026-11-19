"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { recordBulkConsent } from "@/lib/contacts/bulk-consent";
import { recordRndBulk } from "@/lib/messaging/service";

export async function bulkConsentAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const on = (k: string) => fd.get(k) === "on";
  const since = Number(fd.get("since"));
  const r = await recordBulkConsent(u, {
    channels: [...(on("text") ? (["text"] as const) : []), ...(on("ai_call") ? (["ai_call"] as const) : [])],
    purposes: [...(on("service") ? (["service"] as const) : []), ...(on("marketing") ? (["marketing"] as const) : [])],
    evidence: fd.get("evidence") === "web_form" ? "web_form" : "written",
    proof: String(fd.get("proof") ?? ""),
    confirms: { namesUs: on("namesUs"), canProduce: on("canProduce"), coversAiVoice: on("coversAiVoice") },
    sinceYear: since >= 1990 && since <= 2100 ? since : null,
  });
  const line = r.ok ? `Recorded for ${r.people} past ${r.people === 1 ? "client" : "clients"}. Their pages show it under Permission, with where the proof is.` : r.error;
  redirect(`/mlo/contacts/permission?f=${encodeFlash({ ok: r.ok, lines: [line] })}`);
}

export async function rndBulkAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await recordRndBulk(u, String(fd.get("rows") ?? ""), String(fd.get("source") ?? ""));
  redirect(`/mlo/contacts/permission?f=${encodeFlash({ ok: r.updated > 0, lines: [`Reassigned-number results recorded for ${r.updated} ${r.updated === 1 ? "contact" : "contacts"}${r.skipped ? `; ${r.skipped} line${r.skipped === 1 ? "" : "s"} skipped (not yours, or not phone, date, answer)` : ""}.`] })}#rnd`);
}
