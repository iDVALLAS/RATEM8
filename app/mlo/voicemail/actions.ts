"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { MAX_VM_BYTES } from "@/lib/voicemail/audio";
import { addVoicemail, deleteVoicemail, dropVoicemail } from "@/lib/voicemail/service";

const go = (path: string, ok: boolean, lines: string[]): never => {
  const [p, hash] = path.split("#");
  redirect(`${p}${p.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}${hash ? `#${hash}` : ""}`);
};
const me = async () => (await currentUser()) ?? redirect("/sign-in");

/** D57: the recorder sends the finished 8 kHz WAV here; it's checked, then saved. */
export async function saveVoicemailAction(fd: FormData): Promise<void> {
  const u = await me();
  const f = fd.get("audio");
  if (!(f instanceof Blob) || f.size > MAX_VM_BYTES) return go("/mlo/voicemail", false, ["Keep voicemails under 55 seconds."]);
  const r = await addVoicemail(u, String(fd.get("title") ?? ""), new Uint8Array(await f.arrayBuffer()), new Date());
  go("/mlo/voicemail", r.ok, [r.ok ? `Saved and checked: "${r.voicemail.title}". It's ready to leave for people.` : r.error]);
}

export async function deleteVoicemailAction(id: string): Promise<void> {
  const ok = await deleteVoicemail(await me(), id, new Date());
  go("/mlo/voicemail", ok, [ok ? "Deleted." : "Couldn't delete that."]);
}

/** Leave a voicemail for one person (contact page) or several (this page). */
export async function dropAction(fd: FormData): Promise<void> {
  const u = await me();
  const ids = fd.getAll("contactIds").map(String).filter(Boolean);
  const back = String(fd.get("back") ?? "") === "contact" && ids[0] ? `/mlo/contacts/${encodeURIComponent(ids[0])}#voicemail` : "/mlo/voicemail#leave";
  const r = await dropVoicemail(u, { voicemailId: String(fd.get("voicemailId") ?? ""), contactIds: ids, purpose: fd.get("purpose") === "marketing" ? "marketing" : "service" }, new Date());
  if (!r.ok) return go(back, false, [r.error]);
  const sent = r.results.filter((x) => x.ok);
  const held = r.results.filter((x) => !x.ok);
  go(back, sent.length > 0, [
    sent.length ? `Calling ${sent.length} ${sent.length === 1 ? "person" : "people"}. Each call waits for the voicemail beep before playing your message; you'll see below how each one went.` : "Nothing was sent.",
    ...held.slice(0, 8).map((x) => `${x.name}: ${x.reason}`),
    ...(held.length > 8 ? [`And ${held.length - 8} more held by your contact rules.`] : []),
  ]);
}
