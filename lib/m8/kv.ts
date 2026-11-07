/**
 * lib/m8/kv.ts — counters for rate limits, turn counts and the daily budget
 * (C4). Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set (no client library); otherwise an
 * in-memory fallback, which only protects one server instance at a time.
 */
import { redisConfig } from "./server";

type Entry = { n: number; exp: number };
const mem = new Map<string, Entry>();

function memIncr(key: string, by: number, ttlSec: number): number {
  const now = Date.now();
  const e = mem.get(key);
  if (!e || e.exp <= now) {
    mem.set(key, { n: by, exp: now + ttlSec * 1000 });
    return by;
  }
  e.n += by;
  return e.n;
}

/** Adds `by` to a counter that expires `ttlSec` after it was created. Returns the new value. */
export async function incr(key: string, ttlSec: number, by = 1): Promise<number> {
  const cfg = redisConfig();
  if (!cfg) return memIncr(key, by, ttlSec);
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCRBY", key, String(by)],
        ["EXPIRE", key, String(ttlSec), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const out = (await res.json()) as { result?: number }[];
    return Number(out[0]?.result ?? 0);
  } catch {
    // Redis unreachable: fall back to this instance's memory rather than failing the chat.
    return memIncr(key, by, ttlSec);
  }
}

/** Sets a key only if it doesn't exist (for once-a-day alerts). True when this call set it. */
export async function setOnce(key: string, ttlSec: number): Promise<boolean> {
  const cfg = redisConfig();
  if (!cfg) return memIncr(key, 1, ttlSec) === 1;
  try {
    const res = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}/1/NX/EX/${ttlSec}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
    });
    const out = (await res.json()) as { result?: string | null };
    return out.result === "OK";
  } catch {
    return memIncr(key, 1, ttlSec) === 1;
  }
}

/** Test helper: clears the in-memory fallback. */
export function resetMemoryCounters(): void {
  mem.clear();
}
