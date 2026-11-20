import { timingSafeEqual } from "node:crypto";
import { runDue } from "@/lib/campaigns/service";
import { report } from "@/lib/monitoring";
import { ensureRegistry } from "@/lib/registry/cache";
import { accountStore } from "@/lib/accounts/store";
import { teamStore } from "@/lib/agents/store";
import { sendDueMoves, teamOn } from "@/lib/agents/runner";

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
    // D54: the Concierge team's approved-playbook sends, inside sending hours.
    let team = 0;
    if (teamOn()) {
      for (const owner of (await teamStore().enabledOwners()).slice(0, 200)) {
        const user = await accountStore().userById(owner);
        if (!user || user.status !== "active") continue;
        team += (await sendDueMoves(user).catch(() => ({ sent: 0 }))).sent;
      }
    }
    return Response.json({ ok: true, ...r, team });
  } catch (e) {
    await report("error", e, { route: "campaigns-tick", stage: "run" });
    return Response.json({ ok: false }, { status: 500 });
  }
}
