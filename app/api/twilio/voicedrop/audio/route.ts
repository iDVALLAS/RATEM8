import { readMedia, streamFile } from "@/lib/blob/private";
import { voicemailFile } from "@/lib/voicemail/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/twilio/voicedrop/audio?id=&e=&s= — one recording, for Twilio's
 * <Play> (D65.1). The file is in the private Blob store; the address is
 * signed for that one recording and expires in an hour.
 */
export async function GET(req: Request) {
  const id = readMedia("vm", new URL(req.url).searchParams);
  const url = id ? await voicemailFile(id) : null;
  return url ? streamFile(url, req, { contentType: "audio/wav" }) : new Response("Not found", { status: 404 });
}
