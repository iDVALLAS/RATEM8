import { containsSensitive } from "@/lib/prep/machine";
import { CONFIG } from "@/lib/config";
import { ttsGuard } from "@/lib/voice/tts-guard";

/**
 * POST /api/voice/tts — M8's ElevenLabs voice (v33).
 *
 * Body: { text: string } — one sentence of an M8 reply.
 * Returns audio/mpeg, or an error the client answers by falling back to the
 * browser voice:
 *   503 not configured (VOICE_PROVIDER isn't "elevenlabs" or no key)
 *   400 bad input · 403 not from this site · 413 too long
 *   422 looks like an SSN / date of birth / account number (never sent out)
 *   429 too many requests · 502 ElevenLabs failed
 *
 * The key never leaves the server. Nothing is logged: not the text, not the
 * audio, not the IP. Audio is streamed back and not stored.
 *
 * Env (server only): VOICE_PROVIDER=elevenlabs, ELEVENLABS_API_KEY,
 * optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (CONFIG.voice.provider !== "elevenlabs" || !key) return new Response(null, { status: 503 });

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return new Response(null, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const verdict = ttsGuard({
    text,
    origin: req.headers.get("origin"),
    fetchSite: req.headers.get("sec-fetch-site"),
    host: req.headers.get("host"),
    ip,
    now: Date.now(),
  });
  if (verdict !== "ok") return new Response(null, { status: verdict });
  if (containsSensitive(text)) return new Response(null, { status: 422 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(CONFIG.voice.elevenLabs.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: CONFIG.voice.elevenLabs.modelId }),
        signal: controller.signal,
      },
    );
    if (!res.ok || !res.body) return new Response(null, { status: 502 });
    return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch {
    return new Response(null, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
