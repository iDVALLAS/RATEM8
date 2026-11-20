import { timingSafeEqual } from "node:crypto";
import { runDue } from "@/lib/campaigns/service";
import { report } from "@/lib/monitoring";
import { ensureRegistry } from "@/lib/registry/cache";

/**
 * GET /api/cc/campaigns/tick — runs every campaign step that's due (D51).
 * For a scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Off (404) without CRON_SECRET. On Vercel's free plan it runs once a day
 * (vercel.json); on a paid plan, make it every 15 minutes.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  await ensureRegistry(); // D45: signed-up loan officers' records
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Not found", { status: 404 });
  try {
    const r = await runDue(new Date());
    return Response.json({ ok: true, ...r });
  } catch (e) {
    await report("error", e, { route: "campaigns-tick", stage: "run" });
    return Response.json({ ok: false }, { status: 500 });
  }
}
