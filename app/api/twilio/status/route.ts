import { handleStatus } from "@/lib/messaging/service";
import { readTwilio } from "@/lib/messaging/webhook";
import { ensureRegistry } from "@/lib/registry/cache";

/** POST /api/twilio/status — delivery updates for texts we sent (D4). Signed requests only. */
export async function POST(req: Request) {
  await ensureRegistry(); // D45: signed-up loan officers' records
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  await handleStatus(p.MessageSid ?? "", p.MessageStatus ?? "");
  return new Response(null, { status: 204 });
}
