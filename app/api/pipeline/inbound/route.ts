import { ingest, readPayload } from "@/lib/pipeline/intake";
import { ownerForKey } from "@/lib/pipeline/keys";
import { incr } from "@/lib/m8/kv";

/**
 * POST /api/pipeline/inbound — loan updates from a loan system (D6):
 * ARIVE's webhooks or a Zapier "Webhooks by Zapier" step, later Encompass.
 * The loan officer's key goes in the X-CC-Key header (or ?key= for systems
 * that only take a URL). Body: one loan update as JSON, or an array of up to
 * 100. 600 per hour per key. Answers with counts only.
 */
const json = (status: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req: Request) {
  const url = new URL(req.url);
  const key = req.headers.get("x-cc-key") ?? url.searchParams.get("key");
  const owner = await ownerForKey(key);
  if (!owner) return json(401, { ok: false, error: "Unknown key." });
  if ((await incr(`cc:pipe:${owner}:${Math.floor(Date.now() / 3_600_000)}`, 4000)) > 600) return json(429, { ok: false, error: "Too many updates this hour." });
  const raw = await req.json().catch(() => null);
  const items = Array.isArray(raw) ? raw.slice(0, 100) : [raw];
  let accepted = 0;
  let skipped = 0;
  for (const item of items) {
    const u = readPayload(item);
    if (!u) {
      skipped++;
      continue;
    }
    await ingest(owner, u, url.searchParams.get("source")?.slice(0, 20) || "loan system");
    accepted++;
  }
  return json(accepted ? 200 : 400, { ok: accepted > 0, accepted, skipped, ...(accepted ? {} : { error: "Each update needs a loan number and a status." }) });
}
