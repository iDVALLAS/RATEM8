import { timingSafeEqual } from "node:crypto";
import { accountStore } from "@/lib/accounts/store";
import { ensureRegistry } from "@/lib/registry/cache";
import { report } from "@/lib/monitoring";
import { loaStore } from "@/lib/loa/store";
import { sendQueued } from "@/lib/loa/autopilot";

/**
 * GET /api/cc/loa/tick — sends the LOA's Full-auto messages whose time has
 * come (D71): the 15-minute undo window ended, or the morning run's time.
 * For a scheduler sending `Authorization: Bearer $CRON_SECRET`; 404 without
 * CRON_SECRET or with the wrong one. Not in vercel.json: Vercel's free plan
 * allows daily crons only, so the morning run and the midday tick cover it,
 * plus each loan officer's own page views. An outside every-15-minutes caller
 * (a GitHub Actions schedule or cron-job.org holding the secret) makes the
 * 15-minute sends go on time.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Not found", { status: 404 });
  await ensureRegistry(); // D45: signed-up loan officers' records
  try {
    const now = new Date();
    let sent = 0;
    let held = 0;
    let owners = 0;
    for (const owner of (await loaStore().queuedOwners()).slice(0, 200)) {
      const user = await accountStore().userById(owner);
      if (!user || user.status !== "active") continue;
      const r = await sendQueued(user, now).catch(() => ({ sent: 0, held: 0, failed: 0 }));
      sent += r.sent;
      held += r.held;
      owners++;
    }
    return Response.json({ ok: true, owners, sent, held });
  } catch (e) {
    await report("error", e, { route: "loa-tick", stage: "send" });
    return Response.json({ ok: false }, { status: 500 });
  }
}
