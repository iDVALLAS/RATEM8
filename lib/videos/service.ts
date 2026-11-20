/**
 * lib/videos/service.ts — video messages (D55). SERVER-ONLY.
 *
 * A loan officer records a short video in Command Center (or uploads one),
 * up to two minutes. Before it can be sent:
 *  - What it says is turned into words (lib/videos/transcribe.ts) and gets
 *    the same checks as every text and email: no rates, no promises, no
 *    dollar figures, nothing about who a home is for, no one else's links
 *    or numbers. A video that doesn't pass is held, with the reason and
 *    where, and can't be sent. The words become its captions.
 *  - It goes out by text or email through the send gate (sendText /
 *    sendEmail), so quiet hours, permission, caps and STOP all apply.
 * Each person gets their own watch link (/v/<token>), so the loan officer
 * sees who watched and when. Deleting a video removes the file, and every
 * link to it says it's no longer available.
 */
import { randomBytes } from "node:crypto";
import { del as blobDel, head as blobHead } from "@vercel/blob";
import { accountStore, type User } from "@/lib/accounts/store";
import { CONFIG, mloById } from "@/lib/config";
import { companyDetails } from "@/lib/accounts/company";
import { canSee } from "@/lib/contacts/service";
import { contactStore, type Purpose } from "@/lib/contacts/store";
import { checkDraft } from "@/lib/concierge/guard";
import { incr } from "@/lib/m8/kv";
import { sendText, type SendOutcome } from "@/lib/messaging/service";
import { sendEmail } from "@/lib/messaging/email";
import { FAIR_HOUSING, myValues } from "@/lib/templates/service";
import { checkTemplate } from "@/lib/templates/service";
import { fill, variablesOf } from "@/lib/templates/library";
import { DURATION_SLACK, MAX_PARTS, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, PART_BYTES, POSTER_TYPE, VIDEO_TYPES } from "./audio";
import { transcribeOn, transcribePart } from "./transcribe";
import { videoStore, type Cue, type Video, type VideoSend } from "./store";

const iso = (d: Date) => d.toISOString();
const rid = (p: string, n = 9) => `${p}${randomBytes(n).toString("base64url")}`;
const env = (k: string) => process.env[k]?.trim() || undefined;

/** On with a Vercel Blob store (BLOB_READ_WRITE_TOKEN); CC_VIDEOS="false" turns it off. */
export const videosOn = () => !!env("BLOB_READ_WRITE_TOKEN") && env("CC_VIDEOS") !== "false";
export { transcribeOn };

/** Seconds of sound checked per day across the platform (CC_VIDEO_CHECK_DAILY_SECONDS overrides). */
export function dailyCheckCap(): number {
  const n = Number(env("CC_VIDEO_CHECK_DAILY_SECONDS"));
  return Number.isInteger(n) && n > 0 ? n : 14_400;
}

export const NOTE_MAX = 300;
export const TITLE_MAX = 80;
export const DEFAULT_NOTE = "Hi {first}, I made you a quick video.";

/** Where each loan officer's files go in Blob. */
export const prefixFor = (userId: string) => `videos/${userId.replace(/[^A-Za-z0-9_-]/g, "")}/`;

// ---- Uploading (the browser sends the file straight to Blob) ----

/** What the upload route allows for this pathname, or why not. */
export function uploadRules(user: Pick<User, "id">, pathname: string): { ok: true; allowedContentTypes: string[]; maximumSizeInBytes: number } | { ok: false; error: string } {
  if (!videosOn()) return { ok: false, error: "Video messages are off." };
  if (!pathname.startsWith(prefixFor(user.id)) || pathname.includes("..") || pathname.length > 200) return { ok: false, error: "Not your folder." };
  if (/-poster\.jpg$/.test(pathname)) return { ok: true, allowedContentTypes: [POSTER_TYPE], maximumSizeInBytes: 2 * 1024 * 1024 };
  if (!/\.(mp4|webm|mov)$/i.test(pathname)) return { ok: false, error: "Use an MP4, WebM or MOV file." };
  return { ok: true, allowedContentTypes: [...VIDEO_TYPES], maximumSizeInBytes: MAX_VIDEO_BYTES };
}

/** A Blob address for this loan officer's folder, or null. */
function ownBlob(user: Pick<User, "id">, url: string): { url: string; pathname: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname.endsWith(".public.blob.vercel-storage.com")) return null;
    const pathname = decodeURIComponent(u.pathname.replace(/^\//, ""));
    return pathname.startsWith(prefixFor(user.id)) && !pathname.includes("..") ? { url: `${u.origin}${u.pathname}`, pathname } : null;
  } catch {
    return null;
  }
}

export type BlobDeps = {
  head: (url: string) => Promise<{ size: number; contentType: string }>;
  del: (urls: string[]) => Promise<void>;
};
const realBlob: BlobDeps = {
  head: async (url) => {
    const h = await blobHead(url);
    return { size: h.size, contentType: h.contentType };
  },
  del: (urls) => blobDel(urls),
};

/** After the browser uploaded: record the video and start its word check. */
export async function registerVideo(user: User, input: { url: string; posterUrl?: string | null; title: string; durationSec: number }, now = new Date(), blob: BlobDeps = realBlob): Promise<{ ok: true; video: Video } | { ok: false; error: string }> {
  if (!videosOn()) return { ok: false, error: "Video messages are off." };
  const file = ownBlob(user, input.url);
  if (!file) return { ok: false, error: "That upload isn't in your folder." };
  const dur = Number(input.durationSec);
  if (!Number.isFinite(dur) || dur <= 0) return { ok: false, error: "Couldn't read how long the video is." };
  if (dur > MAX_VIDEO_SECONDS + DURATION_SLACK) {
    await blob.del([file.url]).catch(() => undefined);
    return { ok: false, error: "Keep videos to two minutes." };
  }
  let meta: { size: number; contentType: string };
  try {
    meta = await blob.head(file.url);
  } catch {
    return { ok: false, error: "The upload didn't finish. Try again." };
  }
  if (!(VIDEO_TYPES as readonly string[]).includes(meta.contentType.split(";")[0])) {
    await blob.del([file.url]).catch(() => undefined);
    return { ok: false, error: "Use an MP4, WebM or MOV file." };
  }
  const poster = input.posterUrl ? ownBlob(user, input.posterUrl) : null;
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) || `Video, ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}`;
  const video: Video = {
    id: rid("vid_"),
    ownerUserId: user.id,
    title,
    url: file.url,
    pathname: file.pathname,
    contentType: meta.contentType,
    size: meta.size,
    posterUrl: poster?.url ?? null,
    posterPathname: poster?.pathname ?? null,
    durationSec: Math.round(dur * 10) / 10,
    status: "checking",
    reason: "",
    parts: [],
    partCues: [],
    partSeconds: [],
    transcript: "",
    cues: [],
    createdAt: iso(now),
    checkedAt: null,
    deletedAt: null,
  };
  await videoStore().putVideo(video);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "videos.add", detail: { videoId: video.id, seconds: video.durationSec } });
  return { ok: true, video };
}

// ---- The word check ----

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);

/** Sentences packed into pieces the draft check reads whole (it reads up to 640 characters). */
function pieces(text: string, max = 600): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of sentences(text)) {
    for (let i = 0; i < s.length; i += max) {
      const bit = s.slice(i, i + max);
      if (cur && cur.length + 1 + bit.length > max) {
        out.push(cur);
        cur = "";
      }
      cur = cur ? `${cur} ${bit}` : bit;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The same rules as a text or email, read over what the video says. Dates
 * are fine in a person's own words (the date rule is for drafts a model
 * writes); everything else applies.
 */
export function checkTranscript(text: string): { ok: true } | { ok: false; reason: string; near: string } {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return { ok: true };
  const fh = t.match(FAIR_HOUSING);
  if (fh) return { ok: false, reason: `says who it's for ("${fh[0]}"); talk about the home and the loan, not the people (fair housing)`, near: excerpt(t, fh.index ?? 0) };
  for (const p of pieces(t)) {
    const d = checkDraft(p);
    if (d.ok || d.reason === "carries a date") continue;
    const s = sentences(p).find((x) => {
      const r = checkDraft(x);
      return !r.ok && r.reason !== "carries a date";
    });
    return { ok: false, reason: d.reason, near: (s ?? p).slice(0, 160) };
  }
  return { ok: true };
}
const excerpt = (t: string, at: number) => t.slice(Math.max(0, at - 60), at + 100).trim();

/**
 * One piece of the video's sound (16 kHz, 16-bit mono, at most 50 seconds),
 * sent by the browser. When every piece is in, the video passes or is held.
 */
export async function checkPart(user: User, videoId: string, index: number, total: number, pcm: Uint8Array, now = new Date(), transcriber = transcribePart): Promise<{ ok: true; done: boolean; video: Video } | { ok: false; error: string; status?: number }> {
  if (!transcribeOn()) return { ok: false, error: "The word check isn't set up (GOOGLE_CLOUD_API_KEY with Speech-to-Text turned on).", status: 503 };
  const v = await videoStore().video(videoId);
  if (!v || v.ownerUserId !== user.id || v.status === "deleted") return { ok: false, error: "No such video.", status: 404 };
  if (v.status !== "checking") return { ok: true, done: true, video: v };
  if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS || !Number.isInteger(index) || index < 0 || index >= total) return { ok: false, error: "Keep videos to two minutes.", status: 400 };
  if (v.parts.length && v.parts.length !== total) return { ok: false, error: "That doesn't match the video's other pieces. Upload it again.", status: 409 };
  if (pcm.length > PART_BYTES || pcm.length % 2) return { ok: false, error: "That piece of sound is too long.", status: 413 };
  const hour = Math.floor(now.getTime() / 3_600_000);
  if ((await incr(`cc:videos:check:${user.id}:${hour}`, 3_700)) > 60) return { ok: false, error: "Too many checks this hour. Try again shortly.", status: 429 };
  const seconds = pcm.length / 32_000;
  if ((await incr(`cc:videos:secs:${iso(now).slice(0, 10)}`, 2 * 86_400, Math.ceil(seconds))) > dailyCheckCap()) return { ok: false, error: "The word check has done its share for today. Try again tomorrow.", status: 503 };

  let heard: { text: string; cues: Cue[] };
  try {
    heard = pcm.length >= 3_200 ? await transcriber(pcm, index * (PART_BYTES / 32_000)) : { text: "", cues: [] };
  } catch (e) {
    console.warn(`[videos] word check failed: ${e instanceof Error ? e.message : "error"}`);
    return { ok: false, error: "The word check didn't answer. Try again in a minute.", status: 502 };
  }
  // Re-read, then write this piece (pieces can arrive together).
  const cur = (await videoStore().video(videoId)) ?? v;
  if (cur.status !== "checking") return { ok: true, done: true, video: cur };
  const parts = cur.parts.length ? [...cur.parts] : Array<string | null>(total).fill(null);
  const partCues = cur.partCues.length ? [...cur.partCues] : Array.from({ length: total }, () => [] as Cue[]);
  const partSeconds = cur.partSeconds?.length ? [...cur.partSeconds] : Array<number>(total).fill(0);
  parts[index] = heard.text;
  partCues[index] = heard.cues;
  partSeconds[index] = seconds;
  const next: Video = { ...cur, parts, partCues, partSeconds };
  if (parts.some((p) => p === null)) {
    await videoStore().putVideo(next);
    return { ok: true, done: false, video: next };
  }
  const done = finish(next, now);
  await videoStore().putVideo(done);
  await accountStore().audit({ at: iso(now), actor: user.email, action: done.status === "ok" ? "videos.passed" : "videos.held", detail: { videoId, reason: done.reason.slice(0, 120) } });
  return { ok: true, done: true, video: done };
}

function finish(v: Video, now: Date): Video {
  const transcript = v.parts.map((p) => p ?? "").filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const cues = v.partCues.flat();
  const heardSec = (v.partSeconds ?? []).reduce((a, b) => a + b, 0);
  const base = { ...v, transcript, cues, checkedAt: iso(now) };
  if (heardSec > MAX_VIDEO_SECONDS + DURATION_SLACK) return { ...base, status: "held", reason: "It runs longer than two minutes." };
  const c = checkTranscript(transcript);
  if (!c.ok) return { ...base, status: "held", reason: `It ${c.reason}. Near: “${c.near}”` };
  return { ...base, status: "ok", reason: transcript ? "" : "No speech was heard, so there are no captions." };
}

// ---- Managing ----

export async function renameVideo(user: User, id: string, title: string): Promise<boolean> {
  const v = await videoStore().video(id);
  if (!v || v.ownerUserId !== user.id || v.status === "deleted") return false;
  const t = title.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  if (!t) return false;
  await videoStore().putVideo({ ...v, title: t });
  return true;
}

/** Removes the file and poster; every watch link then says it's no longer available. */
export async function deleteVideo(user: User, id: string, now = new Date(), blob: BlobDeps = realBlob): Promise<boolean> {
  const v = await videoStore().video(id);
  if (!v || v.ownerUserId !== user.id || v.status === "deleted") return false;
  await blob.del([v.url, ...(v.posterUrl ? [v.posterUrl] : [])]).catch((e) => console.warn(`[videos] delete failed: ${e instanceof Error ? e.name : "error"}`));
  await videoStore().putVideo({ ...v, status: "deleted", deletedAt: iso(now), url: "", posterUrl: null, transcript: "", cues: [], parts: [], partCues: [] });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "videos.delete", detail: { videoId: id } });
  return true;
}

// ---- Sending ----

export const watchLink = (token: string) => `${CONFIG.siteUrl.replace(/\/$/, "")}/v/${token}`;

/** The short note that goes with the link. {first} is their first name. */
export function checkNote(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = raw.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
  if (text.length < 2) return { ok: false, error: "Write a short note to go with the video." };
  if (text.length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  const unknown = variablesOf(text).filter((x) => x !== "first" && x !== "myFirst");
  if (unknown.length) return { ok: false, error: `{${unknown[0]}} isn't a field a video note can fill in. Use {first}.` };
  const c = checkTemplate(text);
  if (!c.ok) return { ok: false, error: `The note can't go out: it ${c.reason}.` };
  return { ok: true, text };
}

export type Senders = {
  text: (actor: User, contactId: string, body: string, purpose: Purpose) => Promise<SendOutcome>;
  email: (actor: User, contactId: string, subject: string, body: string, purpose: Purpose) => Promise<SendOutcome>;
};

/** Sends one person their own watch link, by text or email, through the send gate. */
export async function sendVideo(actor: User, input: { contactId: string; videoId: string; channel: "text" | "email"; purpose: Purpose; note: string }, now: Date, senders: Senders): Promise<SendOutcome & { token?: string }> {
  if (!videosOn()) return { ok: false, error: "Video messages are off." };
  const v = await videoStore().video(input.videoId);
  if (!v || v.ownerUserId !== actor.id || v.status === "deleted") return { ok: false, error: "Pick one of your videos." };
  if (v.status === "checking") return { ok: false, error: "That video's word check hasn't finished. Open Video messages to finish it." };
  if (v.status === "held") return { ok: false, error: "That video was held by the word check. Record it again without the words it flagged." };
  const c = await contactStore().get(input.contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "No such contact." };
  const n = checkNote(input.note);
  if (!n.ok) return { ok: false, error: n.error };
  const mine = myValues(actor);
  const note = fill(n.text, { first: c.firstName || "there", myFirst: mine.myFirst });
  const token = rid("", 12);
  const link = watchLink(token);
  const send: VideoSend = { token, videoId: v.id, ownerUserId: actor.id, contactId: c.id, contactName: `${c.firstName} ${c.lastName}`.trim() || "Contact", channel: input.channel, status: "sending", at: iso(now), views: 0, firstViewedAt: null, lastViewedAt: null };
  await videoStore().putSend(send);
  const res =
    input.channel === "text"
      ? await senders.text(actor, c.id, `${note}\n\n${link}`, input.purpose)
      : await senders.email(actor, c.id, `A quick video from ${mine.myFirst || "your loan officer"}`, `${note}\n\nWatch it here (about ${Math.max(1, Math.round(v.durationSec / 60 * 2) / 2)} min): ${link}`, input.purpose);
  await videoStore().putSend({ ...send, status: res.ok ? "sent" : "failed" });
  await accountStore().audit({ at: iso(now), actor: actor.email, action: res.ok ? "videos.send" : "videos.send.blocked", detail: { videoId: v.id, contactId: c.id, channel: input.channel } });
  return res.ok ? { ok: true, token } : res;
}

export const realSenders = (statusCallback: string | null): Senders => ({
  text: (a, id, body, p) => sendText(a, id, body, p, statusCallback, new Date(), { origin: "human" }),
  email: (a, id, s, b, p) => sendEmail(a, id, s, b, p, new Date(), undefined, { origin: "human" }),
});

// ---- Watching ----

export type WatchView =
  | { state: "missing" }
  | { state: "gone"; mloName: string }
  | {
      state: "ok";
      token: string;
      title: string;
      url: string;
      posterUrl: string | null;
      contentType: string;
      transcript: string;
      hasCaptions: boolean;
      firstName: string;
      mlo: { name: string; first: string; nmls: string; photo: string | null; phone: string | null; booking: string | null; apply: string | null; email: string | null };
      company: { name: string; nmls: string; address: string };
    };

/** What the watch page shows for a link. */
export async function watchView(token: string): Promise<WatchView> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return { state: "missing" };
  const s = await videoStore().send(token).catch(() => null);
  if (!s || s.status !== "sent") return { state: "missing" };
  const [v, owner, c] = await Promise.all([videoStore().video(s.videoId), accountStore().userById(s.ownerUserId), contactStore().get(s.contactId)]);
  const m = mloById(owner?.mloId);
  const name = m?.name ?? owner?.name ?? "Your loan officer";
  if (!v || v.status !== "ok" || !v.url) return { state: "gone", mloName: name };
  const co = companyDetails(m);
  const https = (u: string | undefined) => (u && /^https:\/\/[^\s[\]]+$/.test(u) ? u : null);
  return {
    state: "ok",
    token,
    title: v.title,
    url: v.url,
    posterUrl: v.posterUrl,
    contentType: v.contentType,
    transcript: v.transcript,
    hasCaptions: v.cues.length > 0,
    firstName: c?.firstName ?? "",
    mlo: { name, first: m?.firstName ?? name.split(/\s+/)[0], nmls: m?.nmls ?? "", photo: m?.photo && !m.photo.includes("[") ? m.photo : null, phone: m?.phone ?? null, booking: https(m?.calendly), apply: https(m?.applicationUrl), email: owner?.email ?? null },
    company: { name: co.name, nmls: co.nmls, address: co.address },
  };
}

/** Caption lines for a link, or null. */
export async function captionsFor(token: string): Promise<Cue[] | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  const s = await videoStore().send(token).catch(() => null);
  if (!s || s.status !== "sent") return null;
  const v = await videoStore().video(s.videoId);
  return v && v.status === "ok" ? v.cues : null;
}

export type Notifier = (m: { to: string; subject: string; text: string }) => Promise<boolean>;

/**
 * They pressed play. Counted once per half hour per visitor (a hashed
 * address), never when the sender is the one watching. The first view
 * emails the loan officer: names only.
 */
export async function recordView(token: string, visitor: string, viewer: Pick<User, "id"> | null, now: Date, notify: Notifier): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return false;
  const s = await videoStore().send(token);
  if (!s || s.status !== "sent") return false;
  if (viewer && viewer.id === s.ownerUserId) return false;
  if ((await incr(`cc:videos:view:${token}:${visitor}`, 1_800)) > 1) return false;
  const after = await videoStore().addView(token, iso(now));
  if (after && after.views === 1) {
    const [owner, v] = await Promise.all([accountStore().userById(s.ownerUserId), videoStore().video(s.videoId)]);
    if (owner?.email && owner.status === "active") {
      await notify({
        to: owner.email,
        subject: `${s.contactName} watched your video`,
        text: `${s.contactName} just watched "${v?.title ?? "your video"}".\n\nTheir page: ${CONFIG.siteUrl.replace(/\/$/, "")}/mlo/contacts/${encodeURIComponent(s.contactId)}\n\nMLO Command Center`,
      }).catch(() => false);
    }
  }
  return true;
}
