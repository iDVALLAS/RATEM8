"use server";

import { redirect } from "next/navigation";
import { currentUser, forgetDevices } from "@/lib/accounts/auth";
import { confirmEnroll, disableOwn, startEnroll } from "@/lib/accounts/mfa";
import { removePasskey } from "@/lib/accounts/passkeys";
import { FACE_ID } from "@/lib/content/face-id";
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

/** D89: forget every device this person ticked "Remember this device for 30 days" on. */
export async function forgetDevicesAction(): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const n = await forgetDevices(u);
  back(true, n ? `Forgot ${n} remembered ${n === 1 ? "device" : "devices"}. Each one asks for your phone code next time.` : "No devices were remembered.");
}

/** D94: removes one of your Face ID devices (bound to its row id). */
export async function removePasskeyAction(id: string): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const gone = await removePasskey(u, String(id ?? ""));
  redirect(`/mlo/security?f=${encodeFlash({ ok: gone, lines: [gone ? FACE_ID.removed : FACE_ID.removedNone] })}#face-id`);
}

export async function disableAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await disableOwn(u, String(fd.get("code") ?? ""));
  back(r.ok, r.ok ? "Turned off. Sign-in is the emailed link only." : r.error);
}
