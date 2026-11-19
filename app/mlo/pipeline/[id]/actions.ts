"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { DATE_FIELDS, draftStepMessage, markStep, setDate, setLock, type DateField } from "@/lib/journey/engine";
import { addDocs, readFindings, requestDocs, setDocStatus } from "@/lib/journey/docs";
import type { DocItem, StepState } from "@/lib/journey/store";

const me = async () => (await currentUser()) ?? redirect("/sign-in");
const back = (loanId: string, ok: boolean, line: string, hash = "") => redirect(`/mlo/pipeline/${encodeURIComponent(loanId)}?f=${encodeFlash({ ok, lines: [line] })}${hash}`);

export async function stepAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  const key = String(fd.get("key") ?? "");
  const status = String(fd.get("status") ?? "done") as StepState["status"];
  const r = await markStep(u, loanId, key, ["todo", "done", "na"].includes(status) ? status : "done", String(fd.get("note") ?? ""));
  back(loanId, r.ok, r.ok ? `Step ${key}: ${status === "done" ? "done" : status === "na" ? "doesn't apply" : "reopened"}.` : r.error, `#s-${key}`);
}

export async function messageAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  const key = String(fd.get("key") ?? "");
  const r = await draftStepMessage(u, loanId, key);
  back(loanId, r.ok, r.ok ? `Drafted on your Concierge desk${r.gateOk ? "." : `, but it can't go out yet: ${r.reason}`}` : r.error, `#s-${key}`);
}

export async function datesAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  for (const f of DATE_FIELDS) if (fd.has(f)) await setDate(u, loanId, f as DateField, String(fd.get(f) ?? ""));
  back(loanId, true, "Dates saved.", "#clocks");
}

export async function lockAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  const r = await setLock(u, loanId, fd.get("decision") === "lock" ? "lock" : "float");
  back(loanId, r.ok, r.ok ? "Recorded." : r.error, "#s-13");
}

export async function findingsAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  const file = fd.get("pdf");
  const pdf = file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null;
  const r = await readFindings(u, loanId, { pdf, text: String(fd.get("text") ?? "") });
  back(loanId, r.ok, r.ok ? `Read the ${r.system} findings: ${r.added} document${r.added === 1 ? "" : "s"} added. The findings themselves weren't kept.` : r.error, "#docs");
}

export async function addDocsAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  const phase = fd.get("phase") === "final" ? "final" : "initial";
  const lines = String(fd.get("lines") ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const n = await addDocs(u, loanId, lines.map((name) => ({ name, why: "Added by hand", phase })));
  back(loanId, true, `${n} added.`, "#docs");
}

export async function docStatusAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  await setDocStatus(u, loanId, String(fd.get("docId") ?? ""), String(fd.get("status") ?? "needed") as DocItem["status"]);
  back(loanId, true, "Updated.", "#docs");
}

export async function requestDocsAction(fd: FormData): Promise<void> {
  const u = await me();
  const loanId = String(fd.get("loanId") ?? "");
  const r = await requestDocs(u, loanId, fd.get("phase") === "final" ? "final" : "initial");
  back(loanId, r.ok, r.ok ? `Drafted the request for ${r.count} item${r.count === 1 ? "" : "s"} on your Concierge desk. Post the same list in your loan system's borrower portal.` : r.error, "#docs");
}
