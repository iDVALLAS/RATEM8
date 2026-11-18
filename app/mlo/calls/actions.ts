"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { CALL_RESULT_LABELS, logCall, type CallResult } from "@/lib/calls/session";

export async function logCallAction(fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const result = String(fd.get("result") ?? "");
  const purpose = fd.get("purpose") === "service" ? "service" : "marketing";
  const r = await logCall(u, String(fd.get("contactId") ?? ""), result, String(fd.get("note") ?? ""), purpose);
  redirect(`/mlo/calls?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? `Logged: ${CALL_RESULT_LABELS[result as CallResult]}.` : r.error] })}#next`);
}
