"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { recordBulkConsent } from "@/lib/contacts/bulk-consent";
import { checkLines, recordDncBulk, recordRndBulk } from "@/lib/messaging/service";
import { importPeople } from "@/lib/contacts/imports";
import { importCheckCopy as kc } from "@/lib/content/import-check";
import { checkScope, scopePeople } from "@/lib/contacts/scope";

const IMP = /^imp_[A-Za-z0-9_-]{6,40}$/;

/** D75: phone type (Twilio Lookup) for one import's people, up to 100 per tap (bound: `lineCheckImportAction.bind(null, importId)`). */
export async function lineCheckImportAction(importId: string): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const id = IMP.test(String(importId)) ? String(importId) : "";
  const r = id ? await checkLines(u, await importPeople(u, id)) : null;
  redirect(`/mlo/contacts/permission?${id ? `import=${id}&` : ""}f=${encodeFlash({ ok: !!r && r.checked > 0, lines: [r ? kc.lineDone(r) : kc.noTwilio] })}#lines`);
}

/** D78: phone type for the people picked on Contacts or a list, up to 100 per tap (bound: `lineCheckScopeAction.bind(null, scope)`). */
export async function lineCheckScopeAction(scope: string): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const sc = checkScope(new URLSearchParams(String(scope).slice(0, 20_000)));
  const r = sc ? await checkLines(u, await scopePeople(u, sc)) : null;
  redirect(`/mlo/contacts/permission?${sc ? `${sc}&` : ""}f=${encodeFlash({ ok: !!r && r.checked > 0, lines: [r ? kc.lineDone(r) : kc.noTwilio] })}#lines`);
}

export async function bulkConsentAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const on = (k: string) => fd.get(k) === "on";
  const since = Number(fd.get("since"));
  // D93: from an import (or people picked on Contacts), only those people; each one checked with canSee.
  const imp = String(fd.get("import") ?? "");
  const sc = checkScope(new URLSearchParams(String(fd.get("scope") ?? "").slice(0, 20_000)));
  const people = IMP.test(imp) ? await importPeople(u, imp) : sc ? await scopePeople(u, sc) : null;
  const back = IMP.test(imp) ? `import=${imp}&` : sc ? `${sc}&` : "";
  const r = await recordBulkConsent(u, {
    channels: [...(on("text") ? (["text"] as const) : []), ...(on("ai_call") ? (["ai_call"] as const) : [])],
    purposes: [...(on("service") ? (["service"] as const) : []), ...(on("marketing") ? (["marketing"] as const) : [])],
    evidence: fd.get("evidence") === "web_form" ? "web_form" : "written",
    proof: String(fd.get("proof") ?? ""),
    confirms: { namesUs: on("namesUs"), canProduce: on("canProduce"), coversAiVoice: on("coversAiVoice") },
    sinceYear: since >= 1990 && since <= 2100 ? since : null,
    onlyIds: people ? new Set(people.map((c) => c.id)) : null,
  });
  const line = r.ok ? `Recorded for ${r.people} past ${r.people === 1 ? "client" : "clients"}. Their pages show it under Permission, with where the proof is.` : r.error;
  redirect(`/mlo/contacts/permission?${back}f=${encodeFlash({ ok: r.ok, lines: [line] })}#record`);
}

export async function rndBulkAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await recordRndBulk(u, String(fd.get("rows") ?? ""), String(fd.get("source") ?? ""));
  redirect(`/mlo/contacts/permission?f=${encodeFlash({ ok: r.updated > 0, lines: [`Reassigned-number results recorded for ${r.updated} ${r.updated === 1 ? "contact" : "contacts"}${r.skipped ? `; ${r.skipped} line${r.skipped === 1 ? "" : "s"} skipped (not yours, or not phone, date, answer)` : ""}.`] })}#rnd`);
}

export async function dncBulkAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await recordDncBulk(u, String(fd.get("rows") ?? ""), String(fd.get("source") ?? ""));
  const imp = String(fd.get("import") ?? "");
  const sc = checkScope(new URLSearchParams(String(fd.get("scope") ?? "").slice(0, 20_000)));
  redirect(`/mlo/contacts/permission?${IMP.test(imp) ? `import=${imp}&` : sc ? `${sc}&` : ""}f=${encodeFlash({ ok: r.updated > 0, lines: [`Do-not-call results recorded for ${r.updated} ${r.updated === 1 ? "contact" : "contacts"}${r.skipped ? `; ${r.skipped} line${r.skipped === 1 ? "" : "s"} skipped (not yours, or not phone and yes/no)` : ""}.`] })}#dnc`);
}
