"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashIp } from "@/lib/m8/limits";
import { confirmSignUp, formToInput, submitSignUp } from "@/lib/registry/service";

async function originAndIp(): Promise<{ origin: string; ip: string }> {
  const h = await headers();
  return { origin: `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`, ip: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown" };
}

/** D45: the sign-up form. */
export async function signUpAction(fd: FormData): Promise<{ ok: boolean; error?: string; invited?: boolean }> {
  // A field people can't see: a bot filling everything in is quietly dropped.
  if (String(fd.get("website") ?? "")) return { ok: true };
  const { origin, ip } = await originAndIp();
  const r = await submitSignUp(formToInput(fd), origin, await hashIp(ip), Date.now(), undefined, String(fd.get("invite") ?? "") || null);
  return r.ok ? { ok: true, invited: !!r.invited } : { ok: false, error: r.error };
}

/** D45: the confirm button (a button, so link scanners can't confirm for them). */
export async function confirmAction(token: string): Promise<void> {
  const { origin } = await originAndIp();
  const r = await confirmSignUp(token, origin);
  redirect(r.ok ? "/sign-up/confirm?done=1" : `/sign-up/confirm?err=${encodeURIComponent(r.error)}`);
}
