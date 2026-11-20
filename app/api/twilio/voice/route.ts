import { readTwilio } from "@/lib/messaging/webhook";
import { ensureRegistry } from "@/lib/registry/cache";
import { companyLineTwiml, isOptOutLine, optOutLineTwiml } from "@/lib/voicemail/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/twilio/voice — someone called one of our numbers (D57): the
 * toll-free opt-out line, or a company's texting and calling number (press 9
 * to stop, or reach the loan officer who last called). Signed requests only.
 */
export async function POST(req: Request) {
  await ensureRegistry();
  const p = await readTwilio(req);
  if (!p) return new Response("Forbidden", { status: 403 });
  const body = isOptOutLine(p.To) ? optOutLineTwiml(p) : await companyLineTwiml(p);
  return new Response(body, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
