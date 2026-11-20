import { readTwilio } from "@/lib/messaging/webhook";
import { ensureRegistry } from "@/lib/registry/cache";
import { resendMail } from "@/lib/pilot/service";
import { turnTwiml } from "@/lib/aicalls/service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/twilio/aicall/turn?s= — what the client said, and M8's answer (D58). Signed requests only. */
export async function POST(req: Request) {
  await ensureRegistry();
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const s = new URL(req.url).searchParams.get("s") ?? "";
  const body = /^ac_[A-Za-z0-9_-]{8,20}$/.test(s) ? await turnTwiml(s, p, new Date(), resendMail) : `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
