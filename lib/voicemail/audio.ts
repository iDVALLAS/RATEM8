/**
 * lib/voicemail/audio.ts — voicemail audio as the phone network plays it
 * (D57): 8 kHz, 16-bit, mono WAV. Client-safe: the recorder builds the file
 * in the browser, and the server reads the same bytes for the word check, so
 * what's checked is exactly what's played.
 */
import { downsample, toPcm16 } from "@/lib/voice/pcm";

export const VM_RATE = 8_000;
/** Longest voicemail, in seconds (the word check reads up to 60 in one go). */
export const MAX_VM_SECONDS = 55;
export const MAX_VM_BYTES = 44 + MAX_VM_SECONDS * VM_RATE * 2;

/** All channels averaged into one, at the phone network's rate. */
export function monoAt(channels: Float32Array[], sampleRate: number, to = VM_RATE): Float32Array {
  if (!channels.length) return new Float32Array(0);
  const n = channels[0].length;
  const mix = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mix[i] += ch[i] / channels.length;
  return downsample([mix], sampleRate, to);
}

/** A WAV file around 16-bit mono PCM. */
export function encodeWav(samples: Float32Array, rate = VM_RATE): Uint8Array {
  const pcm = toPcm16(samples);
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** The PCM inside a WAV this recorder made (8 kHz, 16-bit, mono), or null for anything else. */
export function readWav(bytes: Uint8Array): { rate: number; pcm: Uint8Array } | null {
  if (bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data") return null;
  if (v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== 1 || v.getUint16(34, true) !== 16) return null;
  const rate = v.getUint32(24, true);
  const len = v.getUint32(40, true);
  if (rate !== VM_RATE || len !== bytes.length - 44 || len % 2) return null;
  return { rate, pcm: bytes.subarray(44) };
}
