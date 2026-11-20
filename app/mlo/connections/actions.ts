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

/** D65: Zapier hooks out of Command Center. */
export async function addHookAction(fd: FormData): Promise<void> {
  const { addHook } = await import("@/lib/zapier/service");
  const r = await addHook(await me(), String(fd.get("event") ?? ""), String(fd.get("url") ?? ""), String(fd.get("label") ?? ""));
  go("zapier", r.ok, [r.ok ? "Connected. Press Send a test to check your Zap sees it." : r.error]);
}

export async function removeHookAction(id: string): Promise<void> {
  const { removeHook } = await import("@/lib/zapier/service");
  await removeHook(await me(), id);
  go("zapier", true, ["Removed."]);
}

export async function testHookAction(event: string): Promise<void> {
  const { emit, EVENTS } = await import("@/lib/zapier/service");
  const u = await me();
  const sample: Record<string, Record<string, unknown>> = {
    call_list: { count: 1, people: [{ firstName: "Test", lastName: "Person", phone: "+12065550100", email: "test@example.com", state: "WA", reason: "A test from Command Center", purpose: "service", contactUrl: "" }] },
    lead_created: { lead: { firstName: "Test", lastName: "Lead", phone: "+12065550100", email: "test@example.com", source: "test" } },
    loan_updated: { loanNumber: "TEST-1", borrower: "Test Person", status: "Processing", purpose: "Purchase", closing: null },
    client_replied: { firstName: "Test", lastName: "Person", phone: "+12065550100", optedOut: false, contactUrl: "" },
  };
  if (!(event in EVENTS)) return go("zapier", false, ["Unknown event."]);
  const r = await emit(u.id, event as keyof typeof EVENTS, { test: true, ...sample[event] });
  go("zapier", r.sent > 0, [r.sent ? `Sent a test to ${r.sent} hook${r.sent === 1 ? "" : "s"}.` : "The hook didn't answer. Check the Zap is on and the address is right."]);
}
