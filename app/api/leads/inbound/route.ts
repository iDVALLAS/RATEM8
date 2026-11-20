import { accountStore } from "@/lib/accounts/store";
import { ingestLead, readLead } from "@/lib/leads/intake";
import { ownerForKey } from "@/lib/pipeline/keys";
import { incr } from "@/lib/m8/kv";
import { ensureRegistry } from "@/lib/registry/cache";
import { emit } from "@/lib/zapier/service";

/**
 * POST /api/leads/inbound — new leads from a lead vendor or web form (D14).
 * The loan officer's connection key goes in the X-CC-Key header (or ?key=
 * for vendors that only take a web address); ?source=zillow names the
 * vendor when the payload doesn't. Body: one lead as JSON, or an array of up
 * to 50. 300 per hour per key. Answers with counts only.
 */
const json = (status: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req: Request) {
  await ensureRegistry(); // D45: signed-up loan officers' records
  const url = new URL(req.url);
  const owner = await ownerForKey(req.headers.get("x-cc-key") ?? url.searchParams.get("key"));
  if (!owner) return json(401, { ok: false, error: "Unknown key." });
  const user = await accountStore().userById(owner);
  if (!user || user.status !== "active") return json(401, { ok: false, error: "Unknown key." });
  if ((await incr(`cc:leads:${owner}:${Math.floor(Date.now() / 3_600_000)}`, 4000)) > 300) return json(429, { ok: false, error: "Too many leads this hour." });
  const raw = await req.json().catch(() => null);
  const items = Array.isArray(raw) ? raw.slice(0, 50) : [raw];
  const source = url.searchParams.get("source")?.replace(/[^\w .-]/g, "").slice(0, 40) ?? "";
  let accepted = 0;
  let skipped = 0;
  for (const item of items) {
    const lead = readLead(item, source);
    if (!lead) {
      skipped++;
      continue;
    }
    await ingestLead(user, lead);
    // D65: a Zapier hook for new leads (to a dialer, a CRM, a Slack channel).
    await emit(owner, "lead_created", { lead }).catch(() => null);
    accepted++;
  }
  return json(accepted ? 200 : 400, { ok: accepted > 0, accepted, skipped, ...(accepted ? {} : { error: "Each lead needs a phone number or an email." }) });
}
