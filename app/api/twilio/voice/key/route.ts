import { readTwilio } from "@/lib/messaging/webhook";
import { keyTwiml } from "@/lib/voicemail/service";

export const dynamic = "force-dynamic";

/** POST /api/twilio/voice/key?k=drop|company|optout&d= — a key pressed on a call; 9 stops recorded calls and texts (D57). Signed requests only. */
export async function POST(req: Request) {
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const k = q.get("k") ?? "";
  const d = q.get("d");
  const body = await keyTwiml(["drop", "company", "optout", "optout-number"].includes(k) ? k : "company", p, d && /^dr_[A-Za-z0-9_-]{8,20}$/.test(d) ? d : null, new Date());
  return new Response(body, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
