import { currentUser } from "@/lib/accounts/auth";
import { streamFile } from "@/lib/blob/private";
import { ownVoicemailFile } from "@/lib/voicemail/service";

export const dynamic = "force-dynamic";

/** GET /api/cc/voicemail/file/[id] — a loan officer's own recording, from the private Blob store (D65.1). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const url = await ownVoicemailFile(u, id);
  return url ? streamFile(url, req, { contentType: "audio/wav" }) : new Response("Not found", { status: 404 });
}
