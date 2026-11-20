"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { requestOrigin } from "@/lib/mail/origin";
import { deleteVideo, realSenders, registerVideo, renameVideo, sendVideo } from "@/lib/videos/service";

const go = (path: string, ok: boolean, lines: string[]): never => {
  const [p, hash] = path.split("#");
  redirect(`${p}${p.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}${hash ? `#${hash}` : ""}`);
};
const me = async () => (await currentUser()) ?? redirect("/sign-in");

/** D55: called by the recorder after the file is in Blob. Returns the new video's id for the word check. */
export async function registerVideoAction(input: { url: string; posterUrl: string | null; title: string; durationSec: number }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Sign in again, then try once more." };
  const r = await registerVideo(u, { url: String(input?.url ?? ""), posterUrl: input?.posterUrl ? String(input.posterUrl) : null, title: String(input?.title ?? ""), durationSec: Number(input?.durationSec) });
  return r.ok ? { ok: true, id: r.video.id } : r;
}

export async function renameVideoAction(id: string, fd: FormData): Promise<void> {
  const ok = await renameVideo(await me(), id, String(fd.get("title") ?? ""));
  go("/mlo/videos", ok, [ok ? "Renamed." : "Couldn't rename that."]);
}

export async function deleteVideoAction(id: string): Promise<void> {
  const ok = await deleteVideo(await me(), id);
  go("/mlo/videos", ok, [ok ? "Deleted. Anyone who opens its link now sees that it's no longer available." : "Couldn't delete that."]);
}

/** Send one person their own link, by text or email, through your contact rules. */
export async function sendVideoAction(fd: FormData): Promise<void> {
  const u = await me();
  const contactId = String(fd.get("contactId") ?? "");
  const back = String(fd.get("back") ?? "") === "videos" ? "/mlo/videos#send" : `/mlo/contacts/${encodeURIComponent(contactId)}#video`;
  const origin = requestOrigin(await headers());
  const r = await sendVideo(
    u,
    { contactId, videoId: String(fd.get("videoId") ?? ""), channel: fd.get("channel") === "email" ? "email" : "text", purpose: fd.get("purpose") === "marketing" ? "marketing" : "service", note: String(fd.get("note") ?? "") },
    new Date(),
    realSenders(`${origin}/api/twilio/status`),
  );
  if (r.ok) return go(back, true, ["Sent. You'll see here when they watch it, and get an email the first time."]);
  go(back, false, [r.error, ...("retryAt" in r && r.retryAt ? [`Their window opens ${new Date(r.retryAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" })} Pacific.`] : [])]);
}
