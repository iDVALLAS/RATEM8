"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { addReceipt, removeEntry, saveEntry, saveProfile, tellM8, type TellResult } from "@/lib/expenses/service";

async function me() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

const back = (ok: boolean, line: string, hash = "") => redirect(`/mlo/expenses?f=${encodeFlash({ ok, lines: [line] })}${hash}`);

/** Tell M8 (typed or dictated). Returns to the client component; the page refreshes. */
export async function tellAction(text: string): Promise<TellResult> {
  const r = await tellM8(await me(), text);
  revalidatePath("/mlo/expenses");
  return r;
}

export async function receiptAction(fd: FormData): Promise<TellResult> {
  const u = await me();
  const f = fd.get("receipt");
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: "Pick a photo or PDF of the receipt." };
  const r = await addReceipt(u, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  revalidatePath("/mlo/expenses");
  return r;
}

const input = (fd: FormData) => ({
  kind: String(fd.get("kind") ?? "expense"),
  date: String(fd.get("date") ?? ""),
  dollars: Number(fd.get("dollars") || 0),
  miles: Number(fd.get("miles") || 0),
  vendor: String(fd.get("vendor") ?? ""),
  category: String(fd.get("category") ?? "other"),
  businessPct: Number(fd.get("businessPct") || 100),
  purpose: String(fd.get("purpose") ?? ""),
  recipient: String(fd.get("recipient") ?? ""),
});

/** Bound to the entry id (null for a new one). */
export async function saveEntryAction(entryId: string | null, fd: FormData): Promise<void> {
  const r = await saveEntry(await me(), entryId, input(fd));
  back(r.ok, r.ok ? "Saved." : r.error, r.ok ? "#entries" : "#drafts");
}

export async function removeEntryAction(entryId: string): Promise<void> {
  await removeEntry(await me(), entryId);
  back(true, "Removed.", "#entries");
}

export async function profileAction(year: number, fd: FormData): Promise<void> {
  const r = await saveProfile(await me(), year, Number(fd.get("sqft") || 0), String(fd.get("notes") ?? ""));
  redirect(`/mlo/expenses?year=${year}&f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Saved." : r.error] })}#year`);
}
