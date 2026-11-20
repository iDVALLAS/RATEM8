import { streamFile } from "@/lib/blob/private";
import { watchFile } from "@/lib/videos/service";

export const dynamic = "force-dynamic";

/**
 * GET /v/[token]/media — the video behind one person's watch link (D65.1).
 * The file sits in the private Blob store; this route checks the link is
 * live and the video still passes before streaming it (with seeking).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const f = await watchFile(token, "video");
  return f ? streamFile(f.url, req, { contentType: f.contentType }) : new Response("Not found", { status: 404 });
}
