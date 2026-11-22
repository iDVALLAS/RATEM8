"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { accountStore } from "@/lib/accounts/store";
import { encodeFlash } from "@/lib/mlo/flash";
import { savePrefs } from "@/lib/profile/prefs";
import { settingsCopy as sc } from "@/lib/content/inbox";

/** D79: your time zone and new-lead alerts. Only your own settings, ever. */
export async function saveSettingsAction(fd: FormData): Promise<void> {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const r = await savePrefs(u, { timeZone: fd.get("timeZone"), leadAlert: fd.get("leadAlert"), alertFrom: fd.get("alertFrom"), alertTo: fd.get("alertTo"), alertPhone: fd.get("alertPhone") });
  if (r.ok) await accountStore().audit({ at: new Date().toISOString(), actor: u.email, action: "settings.save", detail: { leadAlert: r.values.leadAlert, timeZone: r.values.timeZone } });
  redirect(`/mlo/settings?f=${encodeFlash(r.ok ? { ok: true, lines: [sc.saved] } : { ok: false, lines: Object.values(r.errors).filter((x): x is string => !!x) })}`);
}
