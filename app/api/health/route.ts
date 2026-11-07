import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "@/lib/config";
import { m8Model, redisConfig, databaseUrl, emailConfig } from "@/lib/m8/server";
import { monitoringOn } from "@/lib/monitoring";

/**
 * /api/health — the uptime monitor's target (C5).
 *
 * GET /api/health → 200 {ok:true, chat:"on"} when the live chat is switched
 * on and has its API key; 503 otherwise, so the monitor alerts. Shows no
 * configuration beyond that.
 *
 * GET /api/health?deep=1 with the HEALTH_CHECK_TOKEN (header
 * "Authorization: Bearer …" or ?token=…) also asks the AI provider whether
 * the key and model work (a model lookup, which costs no tokens) and lists
 * which switches are on (true/false only, never values).
 */
export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function authorized(req: Request): boolean {
  const token = process.env.HEALTH_CHECK_TOKEN?.trim();
  if (!token) return false;
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? "";
  if (given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: Request) {
  const chatOn = CONFIG.featureFlags.liveChat;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ok = chatOn && !!apiKey;
  const deep = new URL(req.url).searchParams.get("deep") === "1";

  if (!deep || !authorized(req)) {
    return json(ok ? 200 : 503, { ok, chat: chatOn ? (apiKey ? "on" : "no-key") : "off", time: new Date().toISOString() });
  }

  let model: "ok" | "failed" | "skipped" = "skipped";
  if (apiKey) {
    try {
      await new Anthropic({ apiKey }).models.retrieve(m8Model());
      model = "ok";
    } catch {
      model = "failed";
    }
  }
  const healthy = ok && model === "ok";
  return json(healthy ? 200 : 503, {
    ok: healthy,
    chat: chatOn ? "on" : "off",
    apiKey: !!apiKey,
    model,
    switches: {
      upstash: redisConfig() !== null,
      neon: databaseUrl() !== null,
      resend: emailConfig() !== null,
      sentry: monitoringOn(),
      mloRouting: CONFIG.pricing.mloRouting,
    },
    time: new Date().toISOString(),
  });
}
