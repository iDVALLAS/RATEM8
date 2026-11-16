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

/**
 * SpeechQueue — M8 speaking a reply a sentence or two at a time (C18).
 * Each piece's audio is fetched as soon as it arrives (so the next one is
 * ready while the current one plays) and played in order on one audio
 * element (the one unlocked by the borrower's tap).
 */
export class SpeechQueue {
  private chain: Promise<void> = Promise.resolve();
  private gen = 0;
  private active = 0;
  private urls = new Set<string>();

  constructor(
    private audio: HTMLAudioElement,
    private hooks: { onStart?: () => void; onError?: (msg: string) => void; fallbackError: string },
  ) {}

  /** True while something is queued or playing. */
  get busy(): boolean {
    return this.active > 0;
  }

  push(text: string, sig: string): void {
    const gen = this.gen;
    this.active++;
    const clip = fetch("/api/m8-speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, sig }) })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? this.hooks.fallbackError);
        }
        const url = URL.createObjectURL(await res.blob());
        this.urls.add(url);
        return url;
      });
    clip.catch(() => {}); // handled in the chain
    this.chain = this.chain.then(async () => {
      try {
        const url = await clip;
        if (gen !== this.gen) return;
        this.hooks.onStart?.();
        await new Promise<void>((resolve) => {
          const a = this.audio;
          const done = () => {
            a.onended = a.onerror = null;
            resolve();
          };
          a.onended = done;
          a.onerror = done;
          a.src = url;
          a.play().catch(done);
        });
      } catch (err) {
        if (gen === this.gen) this.hooks.onError?.(err instanceof Error ? err.message : this.hooks.fallbackError);
      } finally {
        this.active--;
        this.release();
      }
    });
  }

  /** Resolves once everything queued so far has played (or been stopped). */
  drained(): Promise<void> {
    return this.chain;
  }

  /** Stops now and drops anything queued. */
  stop(): void {
    this.gen++;
    this.audio.pause();
    this.audio.onended?.(new Event("ended"));
  }

  private release(): void {
    if (this.active > 0) return;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}
