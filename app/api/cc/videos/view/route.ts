import { currentUser } from "@/lib/accounts/auth";
import { hashIp } from "@/lib/m8/limits";
import { resendMail } from "@/lib/pilot/service";
import { recordView } from "@/lib/videos/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cc/videos/view {token} — the person pressed play on their video
 * (D55). Public: watchers aren't signed in. Counted once per half hour per
 * visitor; nothing about them is stored but the count and the time.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const viewer = await currentUser().catch(() => null);
  const counted = await recordView(token, await hashIp(ip), viewer, new Date(), resendMail).catch(() => false);
  return new Response(JSON.stringify({ ok: true, counted }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
