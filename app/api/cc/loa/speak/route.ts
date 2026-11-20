import { currentUser } from "@/lib/accounts/auth";
import { incr } from "@/lib/m8/kv";
import { currentVoice, speakableText, synthesize, voiceOn } from "@/lib/voice/google";

export const dynamic = "force-dynamic";

/** POST /api/cc/loa/speak {text} — your LOA's answer, read aloud (D62). Signed-in loan officers only; a daily limit per person. */
export async function POST(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return new Response("Sign in first.", { status: 401 });
  if (!voiceOn()) return new Response("Voice isn't set up.", { status: 404 });
  const b = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = speakableText(String(b?.text ?? "")).slice(0, 2500);
  if (!text) return new Response("Nothing to say.", { status: 400 });
  if ((await incr(`cc:loa:speak:${u.id}:${new Date().toISOString().slice(0, 10)}`, 90_000, text.length)) > 60_000) return new Response("That's today's reading-aloud limit.", { status: 429 });
  try {
    const audio = await synthesize(text, await currentVoice());
    return new Response(audio as BodyInit, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Couldn't read it aloud just now.", { status: 502 });
  }
}
