import { handleInbound } from "@/lib/messaging/service";
import { fromNumber, readTwilio } from "@/lib/messaging/webhook";

/**
 * POST /api/twilio/inbound — a text to our Twilio Messaging Service (D4).
 * Only requests signed with our Twilio auth token are accepted. Replies
 * nothing (Twilio's own opt-out handling answers STOP and HELP).
 */
export async function POST(req: Request) {
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const from = fromNumber(p);
  if (from) await handleInbound(from, p.Body ?? "");
  return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
