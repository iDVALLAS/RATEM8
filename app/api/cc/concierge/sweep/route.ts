import { timingSafeEqual } from "node:crypto";
import { accountStore } from "@/lib/accounts/store";
import { conciergeStore } from "@/lib/concierge/store";
import { sweep } from "@/lib/concierge/agent";
import { report } from "@/lib/monitoring";

/**
 * GET /api/cc/concierge/sweep — the morning run for every loan officer who
 * turned the Concierge on (D8). For a scheduler (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`). Off (404) without CRON_SECRET.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Not found", { status: 404 });
  const owners = await conciergeStore().enabledOwners();
  let done = 0;
  let failed = 0;
  for (const owner of owners.slice(0, 200)) {
    const user = await accountStore().userById(owner);
    if (!user || user.status !== "active") continue;
    try {
      const r = await sweep(user);
      if (r.errors) failed++;
      done++;
    } catch (e) {
      // D8.1: a failed run is recorded, never mistaken for a quiet day.
      failed++;
      const kind = e instanceof Error ? e.name : "unknown";
      await accountStore().audit({ at: new Date().toISOString(), actor: "concierge", action: "concierge.sweep_failed", detail: { owner, error: kind } });
      await report("error", e, { route: "concierge-sweep", stage: "sweep" });
    }
  }
  return Response.json({ ok: failed === 0, swept: done, failed });
}
