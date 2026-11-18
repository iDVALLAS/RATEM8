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
  // Our sender is the Messaging Service the text arrived through (one per sponsor's 10DLC brand).
  const sender = p.MessagingServiceSid || p.To || "";
  if (from && sender) await handleInbound(from, sender, p.Body ?? "");
  return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
