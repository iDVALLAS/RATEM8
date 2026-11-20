import { readTwilio } from "@/lib/messaging/webhook";
import { ensureRegistry } from "@/lib/registry/cache";
import { startTwiml } from "@/lib/aicalls/service";

export const dynamic = "force-dynamic";

/** POST /api/twilio/aicall?s= — the call connected: M8 says who it is and asks for the client (D58). Signed requests only. */
export async function POST(req: Request) {
  await ensureRegistry();
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const s = new URL(req.url).searchParams.get("s") ?? "";
  const body = /^ac_[A-Za-z0-9_-]{8,20}$/.test(s) ? await startTwiml(s, p.AnsweredBy ?? "unknown", new Date()) : `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
