import { streamFile } from "@/lib/blob/private";
import { watchFile } from "@/lib/videos/service";

export const dynamic = "force-dynamic";

/** GET /v/[token]/poster — the still shown before a watch link's video plays (D65.1). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const f = await watchFile(token, "poster");
  return f ? streamFile(f.url, null, { contentType: f.contentType }) : new Response("Not found", { status: 404 });
}
