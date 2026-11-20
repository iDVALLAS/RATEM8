import { captionsFor } from "@/lib/videos/service";
import { toVtt } from "@/lib/videos/transcribe";

export const dynamic = "force-dynamic";

/** GET /v/<token>/captions.vtt — the video's captions, from the word check (D55). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cues = await captionsFor(token);
  if (!cues) return new Response("Not found", { status: 404 });
  return new Response(toVtt(cues), { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" } });
}
