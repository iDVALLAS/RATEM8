"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { removeMonthly, setMonthly } from "@/lib/leads/spend";
import { sourceOptionsFor } from "@/lib/leads/sources";
import { LEADS } from "@/lib/content/cc-pages";

const back = (ok: boolean, line: string): never => redirect(`/mlo/leads?f=${encodeFlash({ ok, lines: [line] })}#monthly`);

async function me() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

/** D83: set a source's monthly amount (the source is picked or named under "Other…"). */
export async function saveMonthlyAction(fd: FormData): Promise<void> {
  const u = await me();
  const picked = String(fd.get("source") ?? "");
  // A picked source keeps the name it was seen with; "Other…" takes what was typed.
  const name = picked === "other" ? String(fd.get("sourceOther") ?? "") : (await sourceOptionsFor(u.id)).find((o) => o.key === picked)?.label ?? picked;
  const r = await setMonthly(u, name, Number(String(fd.get("dollars") ?? "").replace(/[$,\s]/g, "")) || 0);
  revalidatePath("/mlo/expenses");
  back(r.ok, r.ok ? LEADS.monthly.saved(r.label, r.drafts) : LEADS.monthly.errors[r.error]);
}

/** D83: bound to the source's key. */
export async function removeMonthlyAction(key: string): Promise<void> {
  await removeMonthly(await me(), key);
  back(true, LEADS.monthly.removed);
}
