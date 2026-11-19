"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { confirmEnroll, disableOwn, startEnroll } from "@/lib/accounts/mfa";
import { encodeFlash } from "@/lib/mlo/flash";

const back = (ok: boolean, line: string) => redirect(`/mlo/security?f=${encodeFlash({ ok, lines: [line] })}`);

/** D34: a new setup key (not on until a code proves it). */
export async function startAction(): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await startEnroll(u);
  if ("error" in r) back(false, r.error);
  redirect("/mlo/security#setup");
}

export type ConfirmState = { ok: boolean; error?: string; recovery?: string[] } | null;

/** D34: the first code. Returns the recovery codes to the page, once; they're never stored readable. */
export async function confirmAction(_prev: ConfirmState, fd: FormData): Promise<ConfirmState> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await confirmEnroll(u, String(fd.get("code") ?? ""));
  return r.ok ? { ok: true, recovery: r.recovery } : { ok: false, error: r.error };
}

export async function disableAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await disableOwn(u, String(fd.get("code") ?? ""));
  back(r.ok, r.ok ? "Turned off. Sign-in is the emailed link only." : r.error);
}
