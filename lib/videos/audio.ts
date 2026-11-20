/**
 * lib/videos/audio.ts — limits for video messages, and the video's sound as
 * 16 kHz mono pieces for the word check (D55). Client-safe: no server
 * imports, so the recorder can use it.
 */
import { downsample, LISTEN_RATE, toPcm16 } from "@/lib/voice/pcm";

/** Longest video, in seconds. */
export const MAX_VIDEO_SECONDS = 120;
/** A little slack for a recording stopped a moment late. */
export const DURATION_SLACK = 5;
/** Largest file (a two-minute phone video at 1080p fits; 4K doesn't). */
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
/** Sound is checked in pieces of this many seconds (Google's quick check takes up to 60). */
export const PART_SECONDS = 50;
export const PART_BYTES = PART_SECONDS * LISTEN_RATE * 2;
export const MAX_PARTS = Math.ceil((MAX_VIDEO_SECONDS + DURATION_SLACK) / PART_SECONDS);
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const POSTER_TYPE = "image/jpeg";

/** All channels averaged into one, at 16 kHz. */
export function monoAt16k(channels: Float32Array[], sampleRate: number): Float32Array {
  if (!channels.length) return new Float32Array(0);
  const n = channels[0].length;
  const mix = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mix[i] += ch[i] / channels.length;
  return downsample([mix], sampleRate, LISTEN_RATE);
}

/** 16 kHz samples as 16-bit pieces of at most PART_SECONDS each. */
export function splitParts(samples: Float32Array): Uint8Array[] {
  const per = PART_SECONDS * LISTEN_RATE;
  const out: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += per) out.push(toPcm16(samples.subarray(i, Math.min(samples.length, i + per))));
  return out.length ? out : [new Uint8Array(0)];
}
