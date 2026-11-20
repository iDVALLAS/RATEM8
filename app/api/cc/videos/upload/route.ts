import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/lib/accounts/auth";
import { uploadRules } from "@/lib/videos/service";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * POST /api/cc/videos/upload — a one-hour, one-file pass so the browser can
 * send a video straight to Vercel Blob (D55). Only a signed-in loan officer,
 * only into their own folder, only video (or the JPEG still that goes with
 * it), and only up to the size limit. The video isn't used until
 * registerVideoAction records it.
 */
export async function POST(req: Request) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return json(400, { error: "Bad request." });
  }
  try {
    const out = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const u = await currentUser();
        if (!u) throw new Error("Sign in first.");
        const r = uploadRules(u, pathname);
        if (!r.ok) throw new Error(r.error);
        return { allowedContentTypes: r.allowedContentTypes, maximumSizeInBytes: r.maximumSizeInBytes, addRandomSuffix: true, validUntil: Date.now() + 3_600_000, tokenPayload: u.id };
      },
      // Recording happens in registerVideoAction, which checks the file itself.
      onUploadCompleted: async () => undefined,
    });
    return json(200, out);
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message.slice(0, 200) : "Upload refused." });
  }
}
