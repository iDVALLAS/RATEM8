/**
 * lib/voice/google.ts — M8's voice (C15). SERVER-ONLY.
 *
 * Google Cloud Text-to-Speech over its REST API (no client library), with
 * the API key in GOOGLE_CLOUD_API_KEY (Vercel, Sensitive). Like every M8
 * service it is a switch: on with the key, off without it, and
 * M8_VOICE="false" turns it off with the key still set.
 *
 * M8 only ever speaks its own replies. /api/m8-chat signs each finished
 * reply (signReply) and /api/m8-speak speaks only text whose signature
 * checks out, so the endpoint can't be used to voice arbitrary text.
 *
 * The voice is M8's own, never a person's: a curated Google voice the
 * owner picks on /mlo/voice (VOICE_CANDIDATES), saved in the pricing
 * store's settings under VOICE_SETTINGS_ID.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/pricing/store";

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const API = "https://texttospeech.googleapis.com/v1";

/** True when M8 can speak: the key is set and the kill switch isn't. */
export function voiceOn(): boolean {
  return !!env("GOOGLE_CLOUD_API_KEY") && env("M8_VOICE") !== "false";
}

/** Characters spoken per day across the site (M8_VOICE_DAILY_CHARS overrides). */
export function dailyCharCap(): number {
  const n = Number(env("M8_VOICE_DAILY_CHARS"));
  return Number.isInteger(n) && n > 0 ? n : 200_000;
}

/** Longest text spoken in one request (Google's limit is 5,000 bytes). */
export const MAX_SPEAK_CHARS = 2500;

/** How long a reply's signature stays good. */
export const SIG_TTL_MS = 60 * 60 * 1000;

/**
 * The voices offered on /mlo/voice: Google's own, for a mix of warm and
 * conversational with confident and seasoned. `tone` is Google's
 * description of each Chirp 3 HD voice. Only those Google lists for the
 * key are shown.
 */
export const VOICE_CANDIDATES: { name: string; tone: string; gender: "female" | "male" }[] = [
  { name: "en-US-Chirp3-HD-Sulafat", tone: "Warm", gender: "female" },
  { name: "en-US-Chirp3-HD-Gacrux", tone: "Mature", gender: "female" },
  { name: "en-US-Chirp3-HD-Kore", tone: "Firm", gender: "female" },
  { name: "en-US-Chirp3-HD-Achernar", tone: "Soft", gender: "female" },
  { name: "en-US-Chirp3-HD-Vindemiatrix", tone: "Gentle", gender: "female" },
  { name: "en-US-Chirp3-HD-Sadaltager", tone: "Knowledgeable", gender: "male" },
  { name: "en-US-Chirp3-HD-Charon", tone: "Informative", gender: "male" },
  { name: "en-US-Chirp3-HD-Algieba", tone: "Smooth", gender: "male" },
  { name: "en-US-Chirp3-HD-Orus", tone: "Firm", gender: "male" },
  { name: "en-US-Chirp3-HD-Schedar", tone: "Even", gender: "male" },
  { name: "en-US-Chirp3-HD-Iapetus", tone: "Clear", gender: "male" },
  { name: "en-US-Studio-O", tone: "Studio, warm", gender: "female" },
  { name: "en-US-Studio-Q", tone: "Studio, assured", gender: "male" },
];

/** Used until the owner picks one. */
export const DEFAULT_VOICE = "en-US-Chirp3-HD-Sulafat";

export const isCandidate = (name: string) => VOICE_CANDIDATES.some((v) => v.name === name);

/** The line every candidate reads on /mlo/voice. */
export const SAMPLE_LINE =
  "Hi, I'm M8. I can walk you through how a loan works, what a payment might look like, or what a line on your Loan Estimate means. A licensed loan officer checks anything that matters before you decide.";

// ─── The saved choice ───────────────────────────────────────

/** Settings row that holds the site's voice (not a brokerage). */
export const VOICE_SETTINGS_ID = "site-voice";

let cached: { name: string; at: number } | null = null;

export async function currentVoice(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.name;
  let name = DEFAULT_VOICE;
  try {
    const s = await getStore().latestSettings(VOICE_SETTINGS_ID);
    if (s?.voiceName && isCandidate(s.voiceName)) name = s.voiceName;
  } catch {
    // Store unreachable: speak with the default rather than not at all.
  }
  cached = { name, at: Date.now() };
  return name;
}

export async function saveVoice(name: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCandidate(name)) return { ok: false, error: "That voice isn't on the list." };
  const store = getStore();
  if (!store.writable) return { ok: false, error: store.reason ?? "Settings storage is read-only." };
  await store.putSettings({ tenantId: VOICE_SETTINGS_ID, activeLenderKeys: [], playbook: [], voiceName: name, updatedBy: actor, updatedAt: new Date().toISOString() });
  cached = { name, at: Date.now() };
  return { ok: true };
}

// ─── Signing M8's replies ───────────────────────────────────

function secret(): string {
  // A dedicated secret if set; otherwise derived from the Google key, which never leaves the server.
  return env("M8_VOICE_SECRET") ?? `m8-voice:${env("GOOGLE_CLOUD_API_KEY") ?? ""}`;
}

function mac(issued: number, text: string): string {
  return createHmac("sha256", secret()).update(`${issued}\n${text}`).digest("base64url");
}

/** "issued.mac" for a finished M8 reply. */
export function signReply(text: string, now = Date.now()): string {
  return `${now}.${mac(now, text)}`;
}

export function verifyReply(text: string, sig: string, now = Date.now()): boolean {
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(sig);
  if (!m) return false;
  const issued = Number(m[1]);
  if (!(issued <= now + 60_000 && now - issued <= SIG_TTL_MS)) return false;
  const a = Buffer.from(m[2]);
  const b = Buffer.from(mac(issued, text));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Text to speech ─────────────────────────────────────────

/**
 * What M8 says out loud for a reply: markdown marks dropped, links read as
 * their words, list bullets as pauses, and the length capped at a
 * sentence end.
 */
export function speakableText(reply: string): string {
  let s = reply
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (s.length > MAX_SPEAK_CHARS) {
    const cut = s.slice(0, MAX_SPEAK_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf(".\n"));
    s = end > MAX_SPEAK_CHARS / 2 ? cut.slice(0, end + 1) : cut;
  }
  return s;
}

const langOf = (voice: string) => voice.split("-").slice(0, 2).join("-");

/** MP3 bytes for `text` in `voice`, or throws. */
export async function synthesize(text: string, voice: string): Promise<Uint8Array> {
  const key = env("GOOGLE_CLOUD_API_KEY");
  if (!key) throw new Error("voice off");
  const res = await fetch(`${API}/text:synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: langOf(voice), name: voice },
      audioConfig: { audioEncoding: "MP3" },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`google tts ${res.status}`);
  const out = (await res.json()) as { audioContent?: string };
  if (!out.audioContent) throw new Error("google tts: no audio");
  return new Uint8Array(Buffer.from(out.audioContent, "base64"));
}

/** Names of the candidates Google offers this key (all of them if the list can't be read). */
export async function availableCandidates(): Promise<typeof VOICE_CANDIDATES> {
  const key = env("GOOGLE_CLOUD_API_KEY");
  if (!key) return [];
  try {
    const res = await fetch(`${API}/voices?languageCode=en-US`, { headers: { "X-Goog-Api-Key": key }, cache: "no-store" });
    if (!res.ok) return VOICE_CANDIDATES;
    const { voices } = (await res.json()) as { voices?: { name: string }[] };
    const names = new Set((voices ?? []).map((v) => v.name));
    const found = VOICE_CANDIDATES.filter((v) => names.has(v.name));
    return found.length ? found : VOICE_CANDIDATES;
  } catch {
    return VOICE_CANDIDATES;
  }
}
