import { hashIp } from "@/lib/m8/limits";
import { incr } from "@/lib/m8/kv";
import { report } from "@/lib/monitoring";
import { currentVoice, dailyCharCap, speakableText, synthesize, verifyReply, voiceOn } from "@/lib/voice/google";

/**
 * /api/m8-speak — M8 reads one of its own replies aloud (C15).
 *
 * POST { text, sig }: `text` is a finished M8 reply exactly as streamed and
 * `sig` the signature /api/m8-chat sent with it (lib/voice/google.ts). Any
 * other text is refused, so this can't voice arbitrary words.
 *
 * Limits: 20 per minute and 200 per day per hashed IP, and a site-wide
 * daily character cap (M8_VOICE_DAILY_CHARS, default 200,000). Off (404)
 * without GOOGLE_CLOUD_API_KEY or with M8_VOICE="false". Logs carry
 * counts and reasons only, never the text.
 */

const PER_MINUTE = 20;
const PER_DAY = 200;

const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ ok: false, error }), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req: Request) {
  if (!voiceOn()) return fail(404, "Voice is off.");
  let body: { text?: unknown; sig?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail(400, "Bad request");
  }
  const { text, sig } = body;
  if (typeof text !== "string" || typeof sig !== "string" || !text || text.length > 8000 || sig.length > 200) return fail(400, "Bad request");
  if (!verifyReply(text, sig)) {
    console.warn("[m8-speak] refused: signature");
    return fail(403, "Only M8's own replies can be read aloud.");
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = await hashIp(ip);
  const minute = Math.floor(Date.now() / 60_000);
  const day = new Date().toISOString().slice(0, 10);
  const [perMin, perDay] = await Promise.all([incr(`m8:voice:ip:${ipHash}:${minute}`, 90), incr(`m8:voice:ipd:${ipHash}:${day}`, 90_000)]);
  if (perMin > PER_MINUTE || perDay > PER_DAY) {
    console.warn("[m8-speak] blocked: rate limit");
    return fail(429, "Too many read-alouds. Try again in a minute.");
  }

  const speech = speakableText(text);
  if (!speech) return fail(400, "Nothing to read.");
  const used = await incr(`m8:voice:chars:${day}`, 2 * 86_400, speech.length);
  if (used > dailyCharCap()) {
    console.warn("[m8-speak] blocked: daily character cap");
    return fail(503, "Read-aloud is resting for today. The reply is above.");
  }

  try {
    const audio = await synthesize(speech, await currentVoice());
    console.log("[m8-speak] ok", { chars: speech.length });
    return new Response(audio as BodyInit, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[m8-speak] synthesis failed", err instanceof Error ? err.message : "unknown");
    await report("error", err, { route: "m8-speak", stage: "synthesize" });
    return fail(502, "M8 couldn't read that aloud just now. The reply is above.");
  }
}
