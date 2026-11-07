/**
 * lib/m8/server.ts — M8 settings read on the server (C4). Never imported by
 * a client component.
 *
 * Every switch here turns on when its key is set in Vercel and is a safe
 * no-op without it (owner, 2026-11-02: "build as switches that turn on with
 * Vercel key").
 */

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

/** The model: M8_MODEL in Vercel, else the default that shipped before C4. */
export function m8Model(): string {
  return env("M8_MODEL") ?? "claude-sonnet-4-6";
}

/** Max output tokens per reply (brief C4: 800). */
export const M8_MAX_TOKENS = 800;

/** Turns per session (brief C4: 40). M8_MAX_TURNS overrides. */
export function maxTurns(): number {
  const n = Number(env("M8_MAX_TURNS"));
  return Number.isInteger(n) && n > 0 ? n : 40;
}

/**
 * Daily token budget for the Anthropic key (brief C4: a daily spend cap
 * with an alert). M8_DAILY_TOKEN_CAP overrides. The hard dollar limit is
 * the one set in the Anthropic Console; this is LoanM8's own soft cap.
 */
export function dailyTokenCap(): number {
  const n = Number(env("M8_DAILY_TOKEN_CAP"));
  return Number.isInteger(n) && n > 0 ? n : 2_000_000;
}

/** Upstash Redis (rate limits, turn counts, the daily budget). Vercel's Upstash integration names work too. */
export function redisConfig(): { url: string; token: string } | null {
  const url = env("UPSTASH_REDIS_REST_URL") ?? env("KV_REST_API_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN") ?? env("KV_REST_API_TOKEN");
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** Neon Postgres (transcripts, handoff requests). Vercel's Neon integration sets DATABASE_URL. */
export function databaseUrl(): string | null {
  return env("DATABASE_URL") ?? env("POSTGRES_URL") ?? null;
}

/** Email via Resend (handoffs, alerts). Same variables /api/chat-question uses. */
export function emailConfig(): { apiKey: string; to: string; from: string } | null {
  const apiKey = env("RESEND_API_KEY");
  const to = env("MLO_NOTIFICATION_EMAIL");
  const from = env("LOANM8_FROM_EMAIL");
  return apiKey && to && from ? { apiKey, to, from } : null;
}

/** Where alerts go: M8_ALERT_EMAIL, else the loan officer notification address. */
export function alertEmail(): string | null {
  return env("M8_ALERT_EMAIL") ?? env("MLO_NOTIFICATION_EMAIL") ?? null;
}

/** Salt for hashing IP addresses before they are used as rate-limit keys (never stored raw). */
export function ipSalt(): string {
  return env("M8_IP_SALT") ?? "loanm8-m8-chat";
}
