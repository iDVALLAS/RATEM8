"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { addForm, makeLetter, removeForm, saveFilled, sendForms } from "@/lib/forms/service";

const go = (path: string, ok: boolean, lines: string[]): never => {
  const [p, hash] = path.split("#");
  redirect(`${p}${p.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}${hash ? `#${hash}` : ""}`);
};
const me = async () => (await currentUser()) ?? redirect("/sign-in");
const formsOf = (loanId: string) => `/mlo/pipeline/${encodeURIComponent(loanId)}/forms`;

async function pdfFrom(fd: FormData, field: string): Promise<{ bytes: Uint8Array | null; name: string }> {
  const f = fd.get(field);
  if (!(f instanceof File) || f.size === 0) return { bytes: null, name: "" };
  if (f.size > 4 * 1024 * 1024) return { bytes: new Uint8Array(4 * 1024 * 1024 + 1), name: f.name };
  return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name };
}

/** Drop a form on this loan (loanId) or into the library (null). */
export async function addFormAction(loanId: string | null, fd: FormData): Promise<void> {
  const u = await me();
  const { bytes, name } = await pdfFrom(fd, "doc");
  const r = await addForm(u, { loanId, name: String(fd.get("name") ?? "").trim() || name, kind: String(fd.get("kind") ?? "other"), bytes });
  const back = loanId ? `${formsOf(loanId)}#forms` : "/mlo/loa#forms";
  go(back, r.ok, [r.ok ? `Kept "${r.form.name}"${r.form.fields.length ? `. It has ${r.form.fields.length} fillable fields.` : ". It has no fillable fields, so it's kept as it is."}` : r.error]);
}

export async function removeFormAction(loanId: string | null, id: string): Promise<void> {
  const ok = await removeForm(await me(), id);
  go(loanId ? `${formsOf(loanId)}#forms` : "/mlo/loa#forms", ok, [ok ? "Removed." : "Couldn't remove that."]);
}

export async function makeLetterAction(loanId: string, kind: string, fd: FormData): Promise<void> {
  const r = await makeLetter(await me(), loanId, kind, { title: String(fd.get("title") ?? ""), body: String(fd.get("body") ?? "") });
  if (!r.ok) return go(`${formsOf(loanId)}/letter/${encodeURIComponent(kind)}`, false, [r.error]);
  go(`${formsOf(loanId)}#forms`, true, [`Saved "${r.form.name}" on this loan. Tick it under Send to email it.`]);
}

export async function fillAction(loanId: string, formId: string, fd: FormData): Promise<void> {
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("f:") && typeof v === "string") values[k.slice(2)] = v;
  const r = await saveFilled(await me(), formId, loanId, values);
  if (!r.ok) return go(`${formsOf(loanId)}/fill/${encodeURIComponent(formId)}`, false, [r.error]);
  go(`${formsOf(loanId)}#forms`, true, [`Filled ${r.filled} field${r.filled === 1 ? "" : "s"} and saved "${r.form.name}" on this loan. The borrower's own numbers and signatures are left for them.`]);
}

export async function sendFormsAction(loanId: string, fd: FormData): Promise<void> {
  const to = String(fd.get("to_other") ?? "").trim() || String(fd.get("to") ?? "");
  const r = await sendForms(await me(), loanId, { to, subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? ""), formIds: fd.getAll("form").map(String) });
  go(`${formsOf(loanId)}#send`, r.ok, [r.ok ? `Sent ${r.count} form${r.count === 1 ? "" : "s"}, from ${r.via}.` : r.error]);
}
