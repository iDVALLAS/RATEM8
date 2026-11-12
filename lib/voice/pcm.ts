/**
 * lib/voice/pcm.ts — microphone audio to 16 kHz, 16-bit mono PCM (C16).
 * Client-safe (no server imports): the chat records with Web Audio, which
 * works the same in every browser, and sends these bytes to /api/m8-listen.
 */

export const LISTEN_RATE = 16_000;
/** Longest recording, in seconds (Google's quick recognize allows 60). */
export const MAX_LISTEN_SECONDS = 30;
/** Largest upload /api/m8-listen accepts. */
export const MAX_LISTEN_BYTES = LISTEN_RATE * 2 * MAX_LISTEN_SECONDS;

/** Joins recorded chunks and averages them down to `to` samples per second. */
export function downsample(chunks: Float32Array[], from: number, to = LISTEN_RATE): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  if (from === to) return all;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += all[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Float samples (-1…1) as little-endian 16-bit PCM bytes. */
export function toPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const v = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/** Loudest sample, to skip sending silence. */
export function peak(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) p = Math.max(p, Math.abs(samples[i]));
  return p;
}
