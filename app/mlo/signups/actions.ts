"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { approveSignUp, declineSignUp, updateOwnLinks } from "@/lib/registry/service";

const back = (ok: boolean, line: string, to = "/mlo/signups") => redirect(`${to}?f=${encodeURIComponent(encodeFlash({ ok, lines: [line] }))}`);

/** D45: approve after checking the NMLS record. */
export async function approveAction(id: string, fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const r = await approveSignUp(u, id, fd.get("checked") === "on", origin);
  back(r.ok, r.ok ? (r.emailed ? "Approved. Their sign-in link is on its way." : "Approved. Email isn't connected, so send them to /sign-in.") : r.error);
}

export async function declineAction(id: string, fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await declineSignUp(u, id, String(fd.get("note") ?? ""));
  back(r.ok, r.ok ? "Declined, and they've been emailed." : r.error);
}

/** D45: a signed-up loan officer updates their own links (Getting started). */
export async function linksAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await updateOwnLinks(u, { calendly: String(fd.get("calendly") ?? ""), applicationUrl: String(fd.get("applicationUrl") ?? ""), phone: String(fd.get("phone") ?? "") });
  back(r.ok, r.ok ? "Saved. New messages use these." : r.error, "/mlo/welcome");
}
