import { cookies, headers } from "next/headers";
import { CONFIG } from "@/lib/config";
import { decodeRoute, ROUTE_HEADER } from "@/lib/routing";
import { nameableMlo } from "@/lib/mlo-match";
import { redactChatInput } from "@/lib/m8/redact";
import { saveHandoff } from "@/lib/m8/store";
import { emailConfig } from "@/lib/m8/server";
import { hashIp } from "@/lib/m8/limits";
import { incr } from "@/lib/m8/kv";

/**
 * POST /api/m8-callback — "Have {first} call me" in M8 chat (C19).
 *
 * Body: { phone, name?, when?, recent?: [{ role, content }] }. The phone is
 * required (a 10-digit US number); `recent` is the last few chat messages,
 * redacted again here, so the loan officer knows what the call is about.
 * Saved as a handoff (Neon, when configured) and emailed through Resend.
 * Not configured → 503 and the box shows the loan officer's number instead,
 * so it never says "sent" when nothing was. Nothing is logged but counts.
 * 5 per hour per hashed IP.
 */

const SESSION_COOKIE = "lm8_chat_sid";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  let body: { phone?: unknown; name?: unknown; when?: unknown; recent?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { ok: false, error: "Bad request" });
  }
  const digits = clip(body.phone, 40).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!/^\d{10}$/.test(digits)) return json(400, { ok: false, error: "Enter a 10-digit phone number." });
  const phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  const name = redactChatInput(clip(body.name, 80)).text;
  const when = redactChatInput(clip(body.when, 120)).text;
  const recent = Array.isArray(body.recent)
    ? body.recent
        .slice(-6)
        .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
        .map((m) => `${m.role === "user" ? "Borrower" : "M8"}: ${redactChatInput(m.content.slice(0, 600)).text}`)
    : [];

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if ((await incr(`m8:callback:${await hashIp(ip)}:${Math.floor(Date.now() / 3_600_000)}`, 4000)) > 5) {
    return json(429, { ok: false, error: "That's a few requests already. Call the number shown, or try again later." });
  }

  const route = CONFIG.pricing.mloRouting ? decodeRoute((await headers()).get(ROUTE_HEADER)) : null;
  const mlo = route ? nameableMlo(route) : null;
  const state = route?.stateCode ?? null;
  const sid = (await cookies()).get(SESSION_COOKIE)?.value ?? "no-chat-session";
  const summary = [`Call back at ${phone}${name ? ` (${name})` : ""}${when ? `, best time: ${when}` : ""}.`, ...recent].join("\n");

  const saved = await saveHandoff({ sessionId: sid, mloId: mlo?.id ?? null, state, reason: "callback", summary, email: null });
  const cfg = emailConfig();
  let sent = false;
  if (cfg) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `M8 <${cfg.from}>`,
          to: [cfg.to],
          subject: `Call back ${phone}${mlo ? ` for ${mlo.name}` : ""}${state ? `, ${state}` : ""} (M8 chat)`,
          text: `${summary}\n\nState: ${state ?? "unknown"}\nChat session: ${sid}`,
        }),
      });
      sent = res.ok;
    } catch {
      sent = false;
    }
  }
  console.log("[m8-callback]", { sent, saved, messages: recent.length });
  if (!sent) return json(503, { ok: false, error: "This box can't send right now." });
  return json(200, { ok: true });
}
