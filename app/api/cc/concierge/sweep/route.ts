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
import { advanceAll } from "@/lib/texting/service";
import { resendMail } from "@/lib/pilot/service";
import { loaStore } from "@/lib/loa/store";
import { loaMorning } from "@/lib/loa/autopilot";
import { prefsStore } from "@/lib/profile/prefs";
import { sendHeldAlerts } from "@/lib/leads/alert";
import { syncLeadEvents } from "@/lib/leads/sync";
import { makeMonthlyDrafts, monthlyStore } from "@/lib/leads/spend";
import { planStore } from "@/lib/leads/plan-store";
import { advancePlan } from "@/lib/leads/plan-service";
import { weeklyScan } from "@/lib/contacts/cleanup-service";

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
  const owners = [...new Set([...(await conciergeStore().enabledOwners()), ...(await conciergeStore().digestOwners()), ...(await automationStore().owners()), ...(teamOn() ? await teamStore().enabledOwners() : []), ...(await loaStore().activeOwners().catch(() => [])), ...(await prefsStore().heldOwners().catch(() => []))])];
  let done = 0;
  let failed = 0;
  for (const owner of owners.slice(0, 200)) {
    const user = await accountStore().userById(owner);
    if (!user || user.status !== "active") continue;
    try {
      // D79: new-lead alerts that waited overnight (when their hours are open).
      await sendHeldAlerts(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-alerts" }));
      // D83: the lead-event log kept complete (imports since yesterday), and this month's drafts from monthly amounts per source.
      await syncLeadEvents(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-events" }));
      if (user.role !== "assistant") await makeMonthlyDrafts(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-monthly" }));
      // D86: the lead plan's roadmap steps and the Business Manager's 30-day check-in, when due (before the team runs,
      // so the check-in is this period's lead-source move).
      if (user.role !== "assistant") await advancePlan(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-plan" }));
      // D88: "Clean up my contacts", once per ISO week (before the email, which carries its count).
      await weeklyScan(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "cleanup" }));
      await runDaily(user);
      // D54: the Concierge team plans the day (its sends go out in the midday run).
      if (teamOn()) await runTeam(user);
      // D71: the LOA plans each open loan and sends its Full-auto messages that are due (before the email counts them).
      await loaMorning(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "loa" }));
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
  // D83: loan officers with a monthly amount per source but none of the above get only their drafts and their lead log.
  // D86: the same for loan officers with a saved lead plan (its roadmap steps and check-ins).
  const leadOnly = [...new Set([...(await monthlyStore().owners().catch(() => [])), ...(await planStore().owners().catch(() => []))])];
  for (const owner of leadOnly.filter((o) => !owners.includes(o)).slice(0, 200)) {
    const user = await accountStore().userById(owner);
    if (!user || user.status !== "active" || user.role === "assistant") continue;
    await syncLeadEvents(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-events" }));
    await makeMonthlyDrafts(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-monthly" }));
    await advancePlan(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "lead-plan" }));
  }
  // D88: every other active loan officer's book gets its weekly clean-up scan too (once per ISO week, claimed first).
  const scanned = new Set(owners);
  const everyone = (await accountStore().listUsers().catch(() => [])).filter((u) => u.status === "active" && u.role !== "assistant" && !scanned.has(u.id));
  for (const user of everyone.slice(0, 200)) await weeklyScan(user).catch((e) => report("error", e, { route: "concierge-sweep", stage: "cleanup" }));
  // D51: campaign steps due now (East Coast mornings; the midday run covers the West).
  const campaigns = await runDue(new Date()).catch(async (e) => {
    await report("error", e, { route: "concierge-sweep", stage: "campaigns" });
    return null;
  });
  // D56: companies being registered for texting move on as the carriers answer.
  const texting = await advanceAll(new Date(), resendMail).catch(async (e) => {
    await report("error", e, { route: "concierge-sweep", stage: "texting" });
    return null;
  });
  return Response.json({ ok: failed === 0, swept: done, failed, campaigns, texting });
}
