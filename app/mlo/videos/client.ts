/**
 * app/mlo/videos/client.ts — browser helpers for video messages (D55):
 * pulling the sound out of a video for the word check, a still frame for
 * the poster, and sending the sound pieces to /api/cc/videos/check.
 */
import { monoAt16k, splitParts } from "@/lib/videos/audio";

/** The video's sound as 16 kHz pieces, and how many seconds of sound there are. */
export async function soundPieces(file: Blob): Promise<{ parts: Uint8Array[]; seconds: number }> {
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    const samples = monoAt16k(channels, audio.sampleRate);
    return { parts: splitParts(samples), seconds: samples.length / 16_000 };
  } finally {
    ctx.close().catch(() => undefined);
  }
}

/** A still from about one second in, as a JPEG, or null. */
export async function posterFrom(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((ok, bad) => {
      v.onloadeddata = () => ok();
      v.onerror = () => bad(new Error("no frame"));
      setTimeout(() => bad(new Error("timeout")), 8000);
    });
    const at = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(1, v.duration / 2) : 0.5;
    await new Promise<void>((ok) => {
      v.onseeked = () => ok();
      v.currentTime = at;
      setTimeout(ok, 3000);
    });
    const w = Math.min(960, v.videoWidth || 960);
    const h = Math.round(w * ((v.videoHeight || 540) / (v.videoWidth || 960)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(v, 0, 0, w, h);
    return await new Promise<Blob | null>((ok) => canvas.toBlob((b) => ok(b), "image/jpeg", 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** How long a file plays, in seconds (Infinity when the file doesn't say). */
export function durationOf(file: Blob): Promise<number> {
  const url = URL.createObjectURL(file);
  return new Promise<number>((ok) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => ok(v.duration);
    v.onerror = () => ok(NaN);
    v.src = url;
    setTimeout(() => ok(NaN), 8000);
  }).finally(() => URL.revokeObjectURL(url));
}

export type CheckResult = { ok: true; status: string; reason: string } | { ok: false; error: string };

/** Sends each piece of sound for the word check; the last answer says whether it passed. */
export async function runCheck(videoId: string, parts: Uint8Array[], onStep?: (done: number, total: number) => void): Promise<CheckResult> {
  let last: CheckResult = { ok: false, error: "Nothing was checked." };
  for (let i = 0; i < parts.length; i++) {
    let tries = 0;
    for (;;) {
      const res = await fetch(`/api/cc/videos/check?id=${encodeURIComponent(videoId)}&part=${i}&total=${parts.length}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: parts[i] as BodyInit }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; status?: string; reason?: string } | null;
      if (res?.ok && body?.ok) {
        last = { ok: true, status: body.status ?? "checking", reason: body.reason ?? "" };
        break;
      }
      if (tries++ < 1 && (!res || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      return { ok: false, error: body?.error ?? "The word check didn't answer. Try again in a minute." };
    }
    onStep?.(i + 1, parts.length);
  }
  return last;
}

/** The plain media type a file is stored as. */
export const baseType = (t: string) => (t.split(";")[0] || "video/webm").trim();
export const extFor = (t: string) => (baseType(t) === "video/mp4" ? "mp4" : baseType(t) === "video/quicktime" ? "mov" : "webm");
