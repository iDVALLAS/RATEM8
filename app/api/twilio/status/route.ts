import { handleStatus } from "@/lib/messaging/service";
import { readTwilio } from "@/lib/messaging/webhook";

/** POST /api/twilio/status — delivery updates for texts we sent (D4). Signed requests only. */
export async function POST(req: Request) {
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  await handleStatus(p.MessageSid ?? "", p.MessageStatus ?? "");
  return new Response(null, { status: 204 });
}
