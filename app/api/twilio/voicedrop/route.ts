import { readTwilio } from "@/lib/messaging/webhook";
import { ensureRegistry } from "@/lib/registry/cache";
import { dropTwiml, hangup } from "@/lib/voicemail/service";

export const dynamic = "force-dynamic";
const xml = (body: string) => new Response(body, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });

/** POST /api/twilio/voicedrop?d= — what a voicemail drop says once the call connects (D57). Signed requests only. */
export async function POST(req: Request) {
  await ensureRegistry();
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const d = new URL(req.url).searchParams.get("d") ?? "";
  return xml(/^dr_[A-Za-z0-9_-]{8,20}$/.test(d) ? await dropTwiml(d, p.AnsweredBy ?? "unknown") : hangup());
}
