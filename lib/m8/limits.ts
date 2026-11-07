/**
 * lib/m8/limits.ts — rate limits, the turn cap and the daily token budget
 * for the live chat (C4). Counters live in Upstash Redis when it's
 * configured (lib/m8/kv.ts), otherwise in one instance's memory.
 *
 * Keys hold a hashed IP or the random chat session id, never a raw IP.
 */
import { incr, setOnce } from "./kv";
import { sendAlert } from "./alerts";
import { dailyTokenCap, ipSalt, maxTurns } from "./server";

export const LIMITS = {
  ipPerMinute: 20,
  ipPerDay: 300,
  sessionPerMinute: 12,
} as const;

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${ipSalt()}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Per-IP and per-session request limits. */
export async function checkRateLimit(ipHash: string, sid: string): Promise<{ ok: boolean }> {
  const minute = Math.floor(Date.now() / 60_000);
  const day = new Date().toISOString().slice(0, 10);
  const [ipMin, ipDay, sMin] = await Promise.all([
    incr(`m8:rl:ip:${ipHash}:${minute}`, 90),
    incr(`m8:rl:ipd:${ipHash}:${day}`, 90_000),
    incr(`m8:rl:s:${sid}:${minute}`, 90),
  ]);
  return { ok: ipMin <= LIMITS.ipPerMinute && ipDay <= LIMITS.ipPerDay && sMin <= LIMITS.sessionPerMinute };
}

/**
 * Counts this turn for the session and says whether it is over the cap.
 * The client's own message count is a second check, so clearing Redis or
 * a cold instance never lifts the cap for a long conversation.
 */
export async function countTurn(sid: string, userTurnsInRequest: number): Promise<{ ok: boolean; turns: number }> {
  const turns = Math.max(await incr(`m8:turns:${sid}`, 30 * 86_400), userTurnsInRequest);
  return { ok: turns <= maxTurns(), turns };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True while today's token use is under the daily budget. */
export async function underDailyBudget(): Promise<boolean> {
  return (await incr(`m8:tokens:${today()}`, 2 * 86_400, 0)) < dailyTokenCap();
}

/** Adds a reply's tokens to today's budget and alerts at 80% and 100%, once a day each. */
export async function recordUsage(tokens: number): Promise<void> {
  if (!(tokens > 0)) return;
  const cap = dailyTokenCap();
  const used = await incr(`m8:tokens:${today()}`, 2 * 86_400, Math.round(tokens));
  for (const pct of [80, 100]) {
    if (used >= (cap * pct) / 100 && (await setOnce(`m8:alert:${today()}:${pct}`, 2 * 86_400))) {
      await sendAlert(
        pct === 100 ? "M8 hit its daily budget and is paused until tomorrow (UTC)" : "M8 has used 80% of today's budget",
        `M8 has used ${used.toLocaleString("en-US")} of its ${cap.toLocaleString("en-US")}-token daily budget (${today()}, UTC). Raise M8_DAILY_TOKEN_CAP in Vercel to allow more. The Anthropic Console's own spend limit still applies.`,
      );
    }
  }
}
