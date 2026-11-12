import { requireAdmin } from "@/lib/mlo/auth";
import { incr } from "@/lib/m8/kv";
import { isCandidate, SAMPLE_LINE, synthesize, voiceOn } from "@/lib/voice/google";

/**
 * /mlo/voice/sample?name=… — one candidate voice reading SAMPLE_LINE (C15),
 * for the owner's picker. Admin only (middleware plus requireAdmin), only
 * curated voices, and each one is synthesized once per server instance.
 */
const cache = new Map<string, Uint8Array>();

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!voiceOn()) return new Response("Voice is off.", { status: 404 });
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!isCandidate(name)) return new Response("Unknown voice.", { status: 400 });
  let audio = cache.get(name);
  if (!audio) {
    const day = new Date().toISOString().slice(0, 10);
    if ((await incr(`m8:voice:samples:${day}`, 2 * 86_400)) > 200) return new Response("Enough samples for today.", { status: 429 });
    try {
      audio = await synthesize(SAMPLE_LINE, name);
    } catch (err) {
      console.error("[mlo-voice] sample failed", err instanceof Error ? err.message : "unknown");
      return new Response("Google didn't return audio for that voice.", { status: 502 });
    }
    cache.set(name, audio);
  }
  return new Response(audio as BodyInit, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
