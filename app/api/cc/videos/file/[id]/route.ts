import { currentUser } from "@/lib/accounts/auth";
import { streamFile } from "@/lib/blob/private";
import { ownFile } from "@/lib/videos/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/cc/videos/file/[id] — a loan officer's own video (or ?poster=1
 * its still), from the private Blob store (D65.1). Signed in, own files only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const which = new URL(req.url).searchParams.get("poster") ? "poster" : "video";
  const f = await ownFile(u, id, which);
  return f ? streamFile(f.url, which === "video" ? req : null, { contentType: f.contentType }) : new Response("Not found", { status: 404 });
}
