"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { CALL_RESULT_LABELS, logCall, type CallResult } from "@/lib/calls/session";

export async function logCallAction(result: string, fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const purpose = fd.get("purpose") === "service" ? "service" : "marketing";
  const r = await logCall(u, String(fd.get("contactId") ?? ""), result, String(fd.get("note") ?? ""), purpose);
  redirect(`/mlo/calls?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? `Logged: ${CALL_RESULT_LABELS[result as CallResult]}.` : r.error] })}#next`);
}

/** D65: today's allowed call list to the loan officer's power dialer, through their Zapier hook. */
export async function sendToDialerAction(): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const { sendCallList } = await import("@/lib/zapier/service");
  const r = await sendCallList(u);
  const lines = r.ok ? [`Sent ${r.sent} ${r.sent === 1 ? "person" : "people"} to your dialer.${r.heldBack ? ` ${r.heldBack} stayed here: their state needs written permission for dialers; call them from this page.` : ""} Results come back to each contact when your dialer's results Zap is on.`] : [r.error];
  redirect(`/mlo/calls?f=${encodeFlash({ ok: r.ok, lines })}`);
}
