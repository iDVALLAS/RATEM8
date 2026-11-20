import { accountStore } from "@/lib/accounts/store";
import { ownerForKey } from "@/lib/pipeline/keys";
import { incr } from "@/lib/m8/kv";
import { ensureRegistry } from "@/lib/registry/cache";
import { logDialerCall } from "@/lib/zapier/service";

const json = (status: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /api/zapier/call — call results from a power dialer (D65), through
 * Zapier or the dialer's own webhook. Key in X-CC-Key (or ?key=). Body: one
 * call as JSON ({phone, result or disposition, notes}), or up to 50. Each is
 * logged on the loan officer's contact with that number; "do not call" and
 * "wrong number" record a stop.
 */
export async function POST(req: Request) {
  await ensureRegistry();
  const url = new URL(req.url);
  const owner = await ownerForKey(req.headers.get("x-cc-key") ?? url.searchParams.get("key"));
  const user = owner ? await accountStore().userById(owner) : null;
  if (!user || user.status !== "active") return json(401, { ok: false, error: "Unknown key." });
  if ((await incr(`cc:zcall:${user.id}:${Math.floor(Date.now() / 3_600_000)}`, 4000)) > 600) return json(429, { ok: false, error: "Too many calls this hour." });
  const raw = await req.json().catch(() => null);
  const items = (Array.isArray(raw) ? raw.slice(0, 50) : [raw]) as Record<string, unknown>[];
  let logged = 0;
  const skipped: string[] = [];
  for (const it of items) {
    const s = (k: string[]) => String(k.map((x) => it?.[x]).find((v) => typeof v === "string" || typeof v === "number") ?? "");
    const r = await logDialerCall(user, { phone: s(["phone", "phone_number", "to", "number", "contact_phone"]), result: s(["result", "disposition", "outcome", "status", "call_result"]), notes: s(["notes", "note", "summary", "comments"]) });
    if (r.ok) logged++;
    else skipped.push(r.error);
  }
  return json(logged ? 200 : 400, { ok: logged > 0, logged, skipped: skipped.length, ...(logged ? {} : { error: skipped[0] ?? "Nothing to log." }) });
}
