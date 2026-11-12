import { hashIp } from "@/lib/m8/limits";
import { incr } from "@/lib/m8/kv";
import { report } from "@/lib/monitoring";
import { dailyListenCap, listenOn, transcribe } from "@/lib/voice/google";
import { LISTEN_RATE, MAX_LISTEN_BYTES } from "@/lib/voice/pcm";

/**
 * /api/m8-listen — the chat's microphone (C16). The body is 16 kHz, 16-bit
 * mono PCM (lib/voice/pcm.ts), at most 30 seconds. Google turns it into
 * text, which goes back to the borrower's message box; nothing is sent to
 * M8 until they press send.
 *
 * The audio is never stored or logged, and neither is the text. Limits:
 * 20 per minute and 150 per day per hashed IP, and a site-wide daily cap
 * in seconds (M8_LISTEN_DAILY_SECONDS, default 7,200). Off (404) without
 * GOOGLE_CLOUD_API_KEY, or with M8_VOICE or M8_LISTEN set to "false".
 */

const PER_MINUTE = 20;
const PER_DAY = 150;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!listenOn()) return json(404, { ok: false, error: "The microphone is off." });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_LISTEN_BYTES) return json(413, { ok: false, error: "That was too long. Keep it under 30 seconds." });
  const pcm = new Uint8Array(await req.arrayBuffer());
  if (pcm.length > MAX_LISTEN_BYTES) return json(413, { ok: false, error: "That was too long. Keep it under 30 seconds." });
  if (pcm.length < LISTEN_RATE / 5 || pcm.length % 2) return json(400, { ok: false, error: "I didn't catch that. Try again." });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = await hashIp(ip);
  const minute = Math.floor(Date.now() / 60_000);
  const day = new Date().toISOString().slice(0, 10);
  const [perMin, perDay] = await Promise.all([incr(`m8:listen:ip:${ipHash}:${minute}`, 90), incr(`m8:listen:ipd:${ipHash}:${day}`, 90_000)]);
  if (perMin > PER_MINUTE || perDay > PER_DAY) {
    console.warn("[m8-listen] blocked: rate limit");
    return json(429, { ok: false, error: "Too many voice messages. Type it for now, or try again in a minute." });
  }
  const seconds = Math.ceil(pcm.length / 2 / LISTEN_RATE);
  if ((await incr(`m8:listen:secs:${day}`, 2 * 86_400, seconds)) > dailyListenCap()) {
    console.warn("[m8-listen] blocked: daily cap");
    return json(503, { ok: false, error: "The microphone is resting for today. You can type your question." });
  }

  try {
    const text = await transcribe(pcm);
    console.log("[m8-listen] ok", { seconds, heard: text.length > 0 });
    return json(200, { ok: true, text });
  } catch (err) {
    console.error("[m8-listen] failed", err instanceof Error ? err.message : "unknown");
    await report("error", err, { route: "m8-listen", stage: "transcribe" });
    return json(502, { ok: false, error: "I couldn't hear that just now. Try again, or type it." });
  }
}
