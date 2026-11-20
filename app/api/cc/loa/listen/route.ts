import { currentUser } from "@/lib/accounts/auth";
import { incr } from "@/lib/m8/kv";
import { listenOn, transcribe } from "@/lib/voice/google";
import { LISTEN_RATE, MAX_LISTEN_BYTES } from "@/lib/voice/pcm";

export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** POST /api/cc/loa/listen — the loan officer speaking to their LOA: 16 kHz PCM in, words out (D62). Nothing is stored. */
export async function POST(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return json(401, { ok: false, error: "Sign in first." });
  if (!listenOn()) return json(404, { ok: false, error: "The microphone isn't set up (the Google key with Speech-to-Text)." });
  const pcm = new Uint8Array(await req.arrayBuffer());
  if (pcm.length > MAX_LISTEN_BYTES) return json(413, { ok: false, error: "Keep it under 30 seconds." });
  if (pcm.length < LISTEN_RATE / 5 || pcm.length % 2) return json(400, { ok: false, error: "I didn't catch that. Try again." });
  if ((await incr(`cc:loa:listen:${u.id}:${new Date().toISOString().slice(0, 10)}`, 90_000)) > 400) return json(429, { ok: false, error: "That's the microphone's limit for today. You can type." });
  try {
    return json(200, { ok: true, text: await transcribe(pcm) });
  } catch {
    return json(502, { ok: false, error: "I couldn't hear that just now. Try again, or type it." });
  }
}
