/**
 * lib/voice/tts-guard.ts — the cheap checks in front of the paid voice
 * route (v33). ElevenLabs bills per character, so the route only speaks
 * short text, only for this site's own pages, and only so often per visitor.
 *
 * The rate limit is per server instance (in memory). It stops casual
 * abuse; a shared limiter (L5) makes it exact across instances.
 */

export const TTS_MAX_CHARS = 600;
export const TTS_WINDOW_MS = 60_000;
export const TTS_MAX_PER_WINDOW = 40;

const hits = new Map<string, number[]>();

export type TtsInput = {
  text: string;
  origin: string | null;
  fetchSite: string | null;
  host: string | null;
  ip: string;
  now: number;
};

/** "ok", or the HTTP status to refuse with. */
export function ttsGuard(i: TtsInput): "ok" | 400 | 403 | 413 | 429 {
  if (!i.text) return 400;
  if (i.text.length > TTS_MAX_CHARS) return 413;

  // Same-site only: browsers send Sec-Fetch-Site; fall back to Origin vs Host.
  if (i.fetchSite && i.fetchSite !== "same-origin") return 403;
  if (!i.fetchSite) {
    if (!i.origin || !i.host) return 403;
    try {
      if (new URL(i.origin).host !== i.host) return 403;
    } catch {
      return 403;
    }
  }

  const recent = (hits.get(i.ip) ?? []).filter((t) => i.now - t < TTS_WINDOW_MS);
  if (recent.length >= TTS_MAX_PER_WINDOW) {
    hits.set(i.ip, recent);
    return 429;
  }
  recent.push(i.now);
  hits.set(i.ip, recent);
  if (hits.size > 5_000) hits.clear(); // bounded memory
  return "ok";
}

/** Test hook. */
export function resetTtsGuard() {
  hits.clear();
}
