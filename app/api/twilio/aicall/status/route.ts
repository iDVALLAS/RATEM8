import { readTwilio } from "@/lib/messaging/webhook";
import { aiCallStatus } from "@/lib/aicalls/service";

export const dynamic = "force-dynamic";

/** POST /api/twilio/aicall/status?s= — how an M8 call ended (D58). Signed requests only. */
export async function POST(req: Request) {
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const s = new URL(req.url).searchParams.get("s") ?? "";
  if (/^ac_[A-Za-z0-9_-]{8,20}$/.test(s)) await aiCallStatus(s, p, new Date());
  return new Response(null, { status: 204 });
}
