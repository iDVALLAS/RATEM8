/**
 * lib/videos/transcribe.ts — what a video says, for the word check and the
 * captions (D55). SERVER-ONLY.
 *
 * The browser pulls the sound out of the video and sends it here in pieces
 * of at most 50 seconds (16 kHz, 16-bit mono, lib/videos/audio.ts). Google
 * Speech-to-Text (Command Center's Google key, CC_GOOGLE_CLOUD_API_KEY, or the shared GOOGLE_CLOUD_API_KEY)
 * turns each piece into words with their times, so the words become
 * captions too. Nothing is stored at Google.
 */
import { googleKey, MORTGAGE_PHRASES } from "@/lib/voice/google";
import type { Cue } from "./store";

const env = (k: string) => process.env[k]?.trim() || undefined;

/** True when the word check can run. */
export const transcribeOn = () => !!googleKey("cc");

type Word = { word?: string; startTime?: string; endTime?: string };
type Result = { alternatives?: { transcript?: string; words?: Word[] }[] };

const secs = (t: string | undefined) => {
  const n = parseFloat(String(t ?? "0").replace(/s$/, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Words into caption lines of up to about 7 words or 3.5 seconds, ending at a sentence where one ends. */
export function toCues(words: { word: string; start: number; end: number }[]): Cue[] {
  const out: Cue[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ start: round(cur[0].start), end: round(Math.max(cur[cur.length - 1].end, cur[0].start + 0.8)), text: cur.map((w) => w.word).join(" ") });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && (cur.length >= 7 || w.end - cur[0].start > 3.5)) flush();
    cur.push(w);
    if (/[.?!]$/.test(w.word)) flush();
  }
  flush();
  return out;
}
const round = (n: number) => Math.round(n * 100) / 100;

/** One piece of sound: its text and caption lines, timed from the start of the video. Throws on failure. */
export async function transcribePart(pcm: Uint8Array, offsetSec: number, fetcher: typeof fetch = fetch, sampleRate = 16_000): Promise<{ text: string; cues: Cue[] }> {
  const key = googleKey("cc");
  if (!key) throw new Error("speech off");
  const res = await fetcher("https://speech.googleapis.com/v1/speech:recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: sampleRate,
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        speechContexts: [{ phrases: MORTGAGE_PHRASES }],
      },
      audio: { content: Buffer.from(pcm).toString("base64") },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`google stt ${res.status}`);
  const out = (await res.json()) as { results?: Result[] };
  const alts = (out.results ?? []).map((r) => r.alternatives?.[0]).filter((a): a is NonNullable<typeof a> => !!a);
  const text = alts.map((a) => a.transcript?.trim() ?? "").filter(Boolean).join(" ").trim();
  const words = alts.flatMap((a) => a.words ?? []).filter((w) => w.word).map((w) => ({ word: String(w.word), start: secs(w.startTime) + offsetSec, end: secs(w.endTime) + offsetSec }));
  return { text, cues: toCues(words) };
}

/** Caption lines as a WebVTT file. */
export function toVtt(cues: Cue[]): string {
  const t = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  // "-->" can't appear inside a cue; caption text is plain.
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text.replace(/-->/g, "→").replace(/[<>&]/g, "")}`).join("\n\n")}\n`;
}
