/**
 * lib/voice/client.ts — playing M8's voice in the browser (C17). Client-safe.
 */

/** A tiny silent WAV, played inside a tap so phones allow the audio that follows. */
export function silentWav(): string {
  const b = new Uint8Array(46);
  const v = new DataView(b.buffer);
  const str = (o: number, x: string) => [...x].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 38, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, 2, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
}

/** Fetches M8's voice for a signed reply and plays it on `audio`; resolves when it finishes (or is paused). */
export async function playM8Reply(audio: HTMLAudioElement, text: string, sig: string, fallbackError: string): Promise<void> {
  const res = await fetch("/api/m8-speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, sig }) });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? fallbackError);
  }
  const url = URL.createObjectURL(await res.blob());
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => reject(new Error(fallbackError));
      audio.src = url;
      audio.play().catch(reject);
    });
  } finally {
    audio.onended = audio.onpause = audio.onerror = null;
    URL.revokeObjectURL(url);
  }
}
