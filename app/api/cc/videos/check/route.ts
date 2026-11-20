import { currentUser } from "@/lib/accounts/auth";
import { checkPart } from "@/lib/videos/service";
import { PART_BYTES } from "@/lib/videos/audio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * POST /api/cc/videos/check?id=&part=&total= — one piece of a video's sound
 * (16 kHz, 16-bit mono PCM, at most 50 seconds) for the word check (D55).
 * The sound is never stored; only the words are, as the captions.
 */
export async function POST(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return json(401, { ok: false, error: "Sign in first." });
  const q = new URL(req.url).searchParams;
  if (Number(req.headers.get("content-length") ?? "0") > PART_BYTES) return json(413, { ok: false, error: "That piece of sound is too long." });
  const pcm = new Uint8Array(await req.arrayBuffer());
  const r = await checkPart(u, String(q.get("id") ?? ""), Number(q.get("part")), Number(q.get("total")), pcm);
  if (!r.ok) return json(r.status ?? 400, { ok: false, error: r.error });
  return json(200, { ok: true, done: r.done, status: r.video.status, reason: r.video.reason });
}
