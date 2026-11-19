"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientForget, clientOptIn, clientStop, type ClientAction } from "@/lib/clientpage/service";
import { hashIp } from "@/lib/m8/limits";
import { incr } from "@/lib/m8/kv";
import { ensureRegistry } from "@/lib/registry/cache";

/** 20 actions a minute per IP: plenty for a person, little for a script. */
async function limited(): Promise<boolean> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return (await incr(`cc:my:${await hashIp(ip)}:${Math.floor(Date.now() / 60_000)}`, 90)) > 20;
}

const back = (token: string, r: ClientAction) => redirect(`/my/${encodeURIComponent(token)}?m=${encodeURIComponent(r.ok ? r.message : r.error)}&ok=${r.ok ? 1 : 0}`);

export async function stopAction(token: string, scope: "phone" | "email"): Promise<void> {
  await ensureRegistry();
  if (await limited()) back(token, { ok: false, error: "Too many tries. Wait a minute and try again." });
  back(token, await clientStop(token, scope === "email" ? "email" : "phone"));
}

export async function optInAction(token: string, fd: FormData): Promise<void> {
  await ensureRegistry();
  if (await limited()) back(token, { ok: false, error: "Too many tries. Wait a minute and try again." });
  const purposes = [...(fd.get("service") === "on" ? (["service"] as const) : []), ...(fd.get("marketing") === "on" ? (["marketing"] as const) : [])];
  back(token, await clientOptIn(token, purposes, fd.get("agree") === "on"));
}

export async function forgetNoteAction(token: string, noteId: string): Promise<void> {
  await ensureRegistry();
  if (await limited()) back(token, { ok: false, error: "Too many tries. Wait a minute and try again." });
  back(token, await clientForget(token, noteId));
}
