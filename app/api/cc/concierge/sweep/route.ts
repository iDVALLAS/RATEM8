import { timingSafeEqual } from "node:crypto";
import { accountStore } from "@/lib/accounts/store";
import { conciergeStore } from "@/lib/concierge/store";
import { sweep } from "@/lib/concierge/agent";
import { report } from "@/lib/monitoring";
import { runDaily } from "@/lib/automations/engine";
import { sendDigest } from "@/lib/digest";
import { sendWeekly } from "@/lib/report/weekly";
import { automationStore } from "@/lib/automations/store";
import { ensureRegistry } from "@/lib/registry/cache";
import { runDue } from "@/lib/campaigns/service";
import { teamStore } from "@/lib/agents/store";
import { runTeam, teamOn } from "@/lib/agents/runner";

/**
 * GET /api/cc/concierge/sweep — the morning run for every loan officer who
 * turned the Concierge on (D8). For a scheduler (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`). Off (404) without CRON_SECRET.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  await ensureRegistry(); // D45: signed-up loan officers' records
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Not found", { status: 404 });
  // D10: loan officers with the Concierge on, or with any after-closing / new-contact recipe on.
  const owners = [...new Set([...(await conciergeStore().enabledOwners()), ...(await conciergeStore().digestOwners()), ...(await automationStore().owners()), ...(teamOn() ? await teamStore().enabledOwners() : [])])];
  let done = 0;
  let failed = 0;
  for (const owner of owners.slice(0, 200)) {
    const user = await accountStore().userById(owner);
    if (!user || user.status !== "active") continue;
    try {
      await runDaily(user);
      // D54: the Concierge team plans the day (its sends go out in the midday run).
      if (teamOn()) await runTeam(user);
      const r = await sweep(user);
      if (r.errors) failed++;
      // D11: after the run, so the email counts this morning's drafts.
      if ((await sendDigest(user)) === "failed") failed++;
      // D27: Monday mornings, the weekly report.
      if ((await sendWeekly(user)) === "failed") failed++;
      done++;
    } catch (e) {
      // D8.1: a failed run is recorded, never mistaken for a quiet day.
      failed++;
      const kind = e instanceof Error ? e.name : "unknown";
      await accountStore().audit({ at: new Date().toISOString(), actor: "concierge", action: "concierge.sweep_failed", detail: { owner, error: kind } });
      await report("error", e, { route: "concierge-sweep", stage: "sweep" });
    }
  }
  // D51: campaign steps due now (East Coast mornings; the midday run covers the West).
  const campaigns = await runDue(new Date()).catch(async (e) => {
    await report("error", e, { route: "concierge-sweep", stage: "campaigns" });
    return null;
  });
  return Response.json({ ok: failed === 0, swept: done, failed, campaigns });
}
