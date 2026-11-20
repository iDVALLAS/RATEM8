"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { resendMail } from "@/lib/pilot/service";
import { advance, approveSetup, companyFor, readInfo, retrySetup, saveInfo, stopSetup } from "@/lib/texting/service";

const go = (path: string, ok: boolean, lines: string[]): never => {
  const [p, hash] = path.split("#");
  redirect(`${p}${p.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}${hash ? `#${hash}` : ""}`);
};
const me = async () => (await currentUser()) ?? redirect("/sign-in");

/** D56: save the company's details, or save and send them on. */
export async function saveTextingAction(submit: boolean, fd: FormData): Promise<void> {
  const u = await me();
  const r = await saveInfo(u, readInfo(fd), submit, fd.get("attest") === "on", new Date(), resendMail);
  if (!r.ok) return go("/mlo/text-setup", false, [r.error]);
  if (r.setup.status === "working") await advance(r.setup.company, new Date(), resendMail);
  go("/mlo/text-setup", true, [!submit ? "Saved. Nothing has been sent yet." : r.setup.status === "review" ? "Sent to the platform owner to approve. You'll get an email as it moves." : "Started. Command Center is registering the company; the steps that wait on the carriers are checked each morning."]);
}

export async function checkTextingAction(company: string, back: string): Promise<void> {
  const u = await me();
  const own = companyFor(u)?.company === company;
  if (!own && u.role !== "owner") return go(back, false, ["That isn't your company."]);
  const s = await advance(company, new Date(), resendMail);
  go(back, !!s && s.status !== "attention", [s ? (s.status === "live" ? "Texting is on." : s.status === "attention" ? s.error : "Checked. Still waiting on the carriers.") : "Nothing to check."]);
}

export async function retryTextingAction(company: string, back: string): Promise<void> {
  const u = await me();
  const ok = await retrySetup(u, company, new Date());
  if (ok) await advance(company, new Date(), resendMail);
  go(back, ok, [ok ? "Sent again." : "Couldn't send it again."]);
}

export async function approveTextingAction(company: string): Promise<void> {
  const u = await me();
  const ok = await approveSetup(u, company, new Date());
  if (ok) await advance(company, new Date(), resendMail);
  go("/mlo/texting#companies", ok, [ok ? "Approved. Registration has started." : "Only the platform owner can approve this."]);
}

export async function stopTextingAction(company: string): Promise<void> {
  const ok = await stopSetup(await me(), company, new Date());
  go("/mlo/texting#companies", ok, [ok ? "Changed." : "Only the platform owner can do that."]);
}

/** After the carriers or Twilio stopped it: save the corrected details and send it again. */
export async function fixAndRetryTextingAction(fd: FormData): Promise<void> {
  const u = await me();
  const r = await saveInfo(u, readInfo(fd), false, true, new Date(), resendMail);
  if (!r.ok) return go("/mlo/text-setup", false, [r.error]);
  const ok = await retrySetup(u, r.setup.company, new Date());
  if (ok) await advance(r.setup.company, new Date(), resendMail);
  go("/mlo/text-setup", ok, [ok ? "Saved and sent again." : "Saved, but it couldn't be sent again."]);
}
