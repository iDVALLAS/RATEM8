/**
 * lib/voice/provider.ts — M8's voice, behind one interface (v33).
 *
 * The UI only ever calls speak() / listen() / stop(). Which engine runs is
 * a server setting (VOICE_PROVIDER, read in app/layout.tsx):
 *  - "browser":    the device's built-in voice (speechSynthesis) and the
 *                  browser's speech recognition. The "robot voice".
 *  - "elevenlabs": ElevenLabs text-to-speech through /api/voice/tts (the key
 *                  stays on the server). Listening still uses the browser.
 *                  Any failure (no key, quota, network) falls back to the
 *                  browser voice for the rest of the session.
 * Adding another engine (e.g. Deepgram for listening) is a new provider
 * here; no component changes.
 *
 * Client-only. Nothing here records or stores audio.
 */

export type VoiceKind = "browser" | "elevenlabs";

export type ListenHandlers = {
  /** Interim transcript while the person is still talking. */
  onPartial?: (text: string) => void;
  /** The final transcript of what was said. */
  onFinal: (text: string) => void;
  onEnd?: () => void;
  onError?: (reason: string) => void;
};

export interface VoiceProvider {
  readonly kind: VoiceKind;
  canSpeak(): boolean;
  canListen(): boolean;
  /** Speak the text sentence by sentence. Resolves when finished or stopped. */
  speak(text: string, onStart?: () => void): Promise<void>;
  /** Start listening. Returns a function that stops listening. */
  listen(h: ListenHandlers): () => void;
  /** Stop speaking (and listening) immediately. */
  stop(): void;
}

/** Split a reply into sentences so speech can start before the whole text is processed. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  // Split only where sentence punctuation is followed by a space, so
  // decimals ("6.375%") never break.
  const parts = clean.split(/(?<=[.!?]["')\]]*)\s+/);
  const out: string[] = [];
  for (const p of parts.filter(Boolean)) {
    // Very short fragments ("No.", "Yes!") ride with the previous sentence.
    if (out.length && p.length < 12) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

/** The voice settings the browser engine uses (owner spec: rate 1.0, pitch 0.9). */
export const BROWSER_VOICE = { rate: 1.0, pitch: 0.9 } as const;

/** Pick an English voice, preferring US English and the platform's default. */
export function pickVoice(voices: Pick<SpeechSynthesisVoice, "lang" | "default" | "name">[]): number {
  const en = voices.map((v, i) => ({ v, i })).filter(({ v }) => /^en(-|_|$)/i.test(v.lang));
  if (!en.length) return -1;
  const us = en.filter(({ v }) => /^en[-_]US$/i.test(v.lang));
  const pool = us.length ? us : en;
  return (pool.find(({ v }) => v.default) ?? pool[0]).i;
}

/* ─── Speech recognition (shared by both engines) ─────────────── */

type RecognitionEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function browserListen(h: ListenHandlers): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    h.onError?.("unsupported");
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interim) h.onPartial?.((finalText + interim).trim());
  };
  rec.onerror = (e) => h.onError?.(e.error);
  rec.onend = () => {
    if (finalText.trim()) h.onFinal(finalText.trim());
    h.onEnd?.();
  };
  try {
    rec.start();
  } catch {
    h.onError?.("start-failed");
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

/* ─── Browser ("robot") voice ─────────────────────────────────── */

export function browserProvider(): VoiceProvider {
  let token = 0;
  const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);
  return {
    kind: "browser",
    canSpeak: () => !!synth(),
    canListen: () => !!recognitionCtor(),
    listen: browserListen,
    stop() {
      token++;
      synth()?.cancel();
    },
    async speak(text, onStart) {
      const s = synth();
      if (!s) return;
      const mine = ++token;
      s.cancel();
      const voices = s.getVoices();
      const vi = pickVoice(voices);
      let started = false;
      for (const sentence of splitSentences(text)) {
        if (mine !== token) return;
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(sentence);
          u.rate = BROWSER_VOICE.rate;
          u.pitch = BROWSER_VOICE.pitch;
          u.lang = "en-US";
          if (vi >= 0) u.voice = voices[vi];
          u.onstart = () => {
            if (!started) {
              started = true;
              onStart?.();
            }
          };
          u.onend = () => resolve();
          u.onerror = () => resolve();
          s.speak(u);
        });
      }
    },
  };
}

/* ─── ElevenLabs voice (through the server route) ─────────────── */

export function elevenLabsProvider(fallback: VoiceProvider = browserProvider()): VoiceProvider {
  let token = 0;
  let audio: HTMLAudioElement | null = null;
  let failed = false;

  /** An audio URL, "local" (the server refused to send this sentence out), or null (unavailable). */
  async function fetchClip(sentence: string): Promise<string | "local" | null> {
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      });
      if (res.status === 422) return "local";
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }

  function play(url: string, mine: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (mine !== token) return resolve();
      audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    }).then(() => URL.revokeObjectURL(url));
  }

  return {
    kind: "elevenlabs",
    canSpeak: () => typeof window !== "undefined" && typeof Audio !== "undefined",
    canListen: () => fallback.canListen(),
    listen: (h) => fallback.listen(h),
    stop() {
      token++;
      audio?.pause();
      audio = null;
      fallback.stop();
    },
    async speak(text, onStart) {
      if (failed) return fallback.speak(text, onStart);
      const mine = ++token;
      const sentences = splitSentences(text);
      let started = false;
      // Fetch one sentence ahead so playback has no gaps.
      let next = sentences.length ? fetchClip(sentences[0]) : null;
      for (let i = 0; i < sentences.length; i++) {
        const url = await next;
        next = i + 1 < sentences.length ? fetchClip(sentences[i + 1]) : null;
        if (mine !== token) return;
        if (!url) {
          // Not configured or unavailable: the robot voice finishes the reply.
          failed = true;
          return fallback.speak(sentences.slice(i).join(" "), started ? undefined : onStart);
        }
        if (!started) {
          started = true;
          onStart?.();
        }
        if (url === "local") await fallback.speak(sentences[i]);
        else await play(url, mine);
      }
    },
  };
}

export function createVoice(kind: VoiceKind): VoiceProvider {
  return kind === "elevenlabs" ? elevenLabsProvider() : browserProvider();
}
