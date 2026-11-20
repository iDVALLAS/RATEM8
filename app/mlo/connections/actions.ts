"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { removeConnection, saveConnection, testConnection } from "@/lib/connect/service";

const go = (system: string, ok: boolean, lines: string[]): never => redirect(`/mlo/connections?f=${encodeURIComponent(encodeFlash({ ok, lines }))}#${encodeURIComponent(system)}`);
const me = async () => (await currentUser()) ?? redirect("/sign-in");

/** D63: save the credentials a vendor issued (sealed; secrets are never shown again). */
export async function saveConnectionAction(system: string, fd: FormData): Promise<void> {
  const input = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const r = await saveConnection(await me(), system, input);
  go(system, r.ok, [r.ok ? "Saved. Secrets are encrypted and never shown again." : r.error]);
}

export async function testConnectionAction(system: string): Promise<void> {
  const r = await testConnection(await me(), system);
  go(system, r.ok, [r.ok ? r.note : r.error]);
}

export async function removeConnectionAction(system: string): Promise<void> {
  await removeConnection(await me(), system);
  go(system, true, ["Removed."]);
}
