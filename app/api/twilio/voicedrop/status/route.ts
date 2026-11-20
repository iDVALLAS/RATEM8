import { readTwilio } from "@/lib/messaging/webhook";
import { dropStatus } from "@/lib/voicemail/service";

export const dynamic = "force-dynamic";

/** POST /api/twilio/voicedrop/status?d= — how a voicemail drop ended (left, answered, no answer, busy). Signed requests only. */
export async function POST(req: Request) {
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const d = new URL(req.url).searchParams.get("d") ?? "";
  if (/^dr_[A-Za-z0-9_-]{8,20}$/.test(d)) await dropStatus(d, p, new Date());
  return new Response(null, { status: 204 });
}
