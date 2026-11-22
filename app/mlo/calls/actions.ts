"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { CALL_RESULT_LABELS, logCall, type CallResult } from "@/lib/calls/session";
import { ruleFromParams, ruleQuery } from "@/lib/contacts/filter";

/** D78: the session's list (`list=<id>` or `from=filter&…`), rebuilt from known keys only. */
function sessionQs(back: string): string {
  const p = new URLSearchParams(String(back ?? "").slice(0, 2000));
  const list = p.get("list") ?? "";
  if (/^(d-[a-z]+|lst_[A-Za-z0-9_-]{6,40})$/.test(list)) return `list=${list}&`;
  if (p.get("from") === "filter") {
    const qs = ruleQuery(ruleFromParams(p));
    return qs ? `from=filter&${qs}&` : "";
  }
  return "";
}

export async function logCallAction(result: string, back: string, fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const purpose = fd.get("purpose") === "service" ? "service" : "marketing";
  const r = await logCall(u, String(fd.get("contactId") ?? ""), result, String(fd.get("note") ?? ""), purpose);
  redirect(`/mlo/calls?${sessionQs(back)}f=${encodeFlash({ ok: r.ok, lines: [r.ok ? `Logged: ${CALL_RESULT_LABELS[result as CallResult]}.` : r.error] })}#next`);
}

/** D65: today's allowed call list to the loan officer's power dialer, through their Zapier hook. */
export async function sendToDialerAction(): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const { sendCallList } = await import("@/lib/zapier/service");
  const r = await sendCallList(u);
  const lines = r.ok ? [`Sent ${r.sent} ${r.sent === 1 ? "person" : "people"} to your dialer.${r.heldBack ? ` ${r.heldBack} stayed here: their state needs written permission for dialers; call them from this page.` : ""} Results come back to each contact when your dialer's results Zap is on.`] : [r.error];
  redirect(`/mlo/calls?f=${encodeFlash({ ok: r.ok, lines })}`);
}

/** D76: "Add their state" from a "Not now" row. Bound to the contact; the state comes from the picker. */
export async function setStateAction(contactId: string, back: string, fd: FormData): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const { setContactState } = await import("@/lib/contacts/service");
  const { CALL_FIX } = await import("@/lib/content/cc-pages");
  const r = await setContactState(u, contactId, String(fd.get("state") ?? ""));
  redirect(`/mlo/calls?${sessionQs(back)}f=${encodeFlash({ ok: r.ok, lines: [r.ok ? CALL_FIX.stateSaved : r.error] })}#blocked`);
}
