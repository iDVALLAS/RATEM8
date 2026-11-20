"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { disconnectMailbox, sendTestToSelf } from "@/lib/mail/service";

const go = (ok: boolean, line: string): never => redirect(`/mlo/email?f=${encodeURIComponent(encodeFlash({ ok, lines: [line] }))}`);

/** D52: a test email to your own mailbox. */
export async function testMailAction(): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const r = await sendTestToSelf(u);
  go(r.ok, r.ok ? `Sent a test to ${r.from}. Look in that inbox, and in Sent.` : r.error);
}

/** D52: stop sending from this mailbox and remove the saved connection. */
export async function disconnectMailAction(): Promise<void> {
  const u = (await currentUser()) ?? redirect("/sign-in");
  const ok = await disconnectMailbox(u);
  go(ok, ok ? "Disconnected. The saved connection was deleted." : "Nothing was connected.");
}
