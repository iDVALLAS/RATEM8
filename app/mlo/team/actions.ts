"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, inviteUser, updateUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";

const back = (ok: boolean, line: string) => redirect(`/mlo/team?f=${encodeFlash({ ok, lines: [line] })}`);

/** D1: add a person to Command Center. */
export async function inviteAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const mloId = String(fd.get("mloId") ?? "");
  const res = await inviteUser(actor, { email: String(fd.get("email") ?? ""), name: String(fd.get("name") ?? ""), role: String(fd.get("role") ?? ""), mloId: mloId || null }, origin);
  if (!res.ok) back(false, res.error);
  else back(true, res.emailed ? "Added. They've been emailed a sign-in link." : "Added, but the sign-in email didn't send. They can request a link at /sign-in.");
}

/** D1: change a role, or disable or re-enable an account. */
export async function updateAction(fd: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor) redirect("/sign-in");
  const status = String(fd.get("status") ?? "");
  const res = await updateUser(actor, String(fd.get("userId") ?? ""), {
    role: fd.get("role") ? String(fd.get("role")) : undefined,
    status: status === "active" || status === "disabled" ? status : undefined,
  });
  back(res.ok, res.ok ? "Saved." : res.error);
}
