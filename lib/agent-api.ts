/**
 * lib/agent-api.ts — shared plumbing for every /api/agent/* route.
 *
 *  - `envelope()`     wraps a payload with the fields every agent response
 *                     must carry (disclaimer, as_of, licensed_states,
 *                     requires_human_consent_for, version). Facts come from
 *                     lib/config.ts. No rates, no pricing, ever.
 *  - `rateLimit()`    naïve in-memory token bucket, 60 requests per 10
 *                     minutes per client IP. Good enough for one Node
 *                     instance; swap for a shared store before scale.
 *  - `logAgentRequest()` logs route, status, timing, and the optional
 *                     X-Agent-Origin tag. Never a body, never an IP.
 *  - `corsHeaders()` / `json()` / `optionsResponse()` — CORS for GET/POST
 *                     from any origin, JSON responses with no-store.
 *  - `disabledResponse()` — friendly 503 while the `agentApi` flag is off.
 *
 * Pure enough to unit-test: lib/agent-api.test.ts.
 */

import { CONFIG, STATES, CALC_DISCLAIMER, NOT_A_COMMITMENT } from "./config";

/** Bump when a response shape changes. Agents can pin to this. */
export const AGENT_API_VERSION = "2026-09-29";

export const HUMAN_CONSENT_ITEMS = ["credit_pull", "recording", "data_sharing"] as const;
export type HumanConsentItem = (typeof HUMAN_CONSENT_ITEMS)[number];

export const HUMAN_CONSENT_MESSAGE =
  "A human must consent to any credit pull, recording, or data sharing. An AI agent cannot consent on a borrower's behalf.";

export type LicensedState = { code: string; name: string; serviceArea: string };

export type EnvelopeFields = {
  disclaimer: string;
  as_of: string;
  licensed_states: LicensedState[];
  requires_human_consent_for: HumanConsentItem[];
  version: string;
};

export type Envelope<T extends object> = T & EnvelopeFields;

/** The standard disclaimer on every agent response. Locked text from config. */
export const AGENT_DISCLAIMER = `${CALC_DISCLAIMER} ${NOT_A_COMMITMENT}`;

export function licensedStates(): LicensedState[] {
  return STATES.map((s) => ({ code: s.code, name: s.name, serviceArea: s.serviceArea }));
}

/**
 * Wrap a payload with the mandatory fields. `extra` is merged after the
 * payload but before the mandatory fields, so nothing can overwrite them.
 */
export function envelope<T extends object>(data: T, extra?: Record<string, unknown>): Envelope<T> {
  return {
    ...data,
    ...(extra ?? {}),
    disclaimer: AGENT_DISCLAIMER,
    as_of: new Date().toISOString(),
    licensed_states: licensedStates(),
    requires_human_consent_for: [...HUMAN_CONSENT_ITEMS],
    version: AGENT_API_VERSION,
  } as Envelope<T>;
}

/* ─── CORS + JSON helpers ───────────────────────────────────── */

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Agent-Origin",
    "Access-Control-Max-Age": "86400",
  };
}

export type JsonInit = { status?: number; headers?: Record<string, string> };

/** JSON response with CORS and `Cache-Control: no-store`. */
export function json(data: unknown, init: JsonInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

/** Preflight. Every agent route exports `OPTIONS = optionsResponse`. */
export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** 503 while `CONFIG.featureFlags.agentApi` is false. */
export function disabledResponse(): Response {
  return json(
    {
      error: "agent_api_disabled",
      message: `The ${CONFIG.brandName} agent API is not enabled right now. Human-readable answers are at ${CONFIG.siteUrl}/ai.`,
    },
    { status: 503, headers: { "Retry-After": "3600" } }
  );
}

/** 405 for the wrong verb. */
export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: "method_not_allowed", message: `Use ${allowed.join(" or ")}.` },
    { status: 405, headers: { Allow: [...allowed, "OPTIONS"].join(", ") } }
  );
}

/* ─── Rate limiting ─────────────────────────────────────────── */

export const RATE_LIMIT = {
  /** Requests allowed per window (bucket capacity). */
  capacity: 60,
  /** Window length in milliseconds. */
  windowMs: 10 * 60 * 1000,
} as const;

const REFILL_PER_MS = RATE_LIMIT.capacity / RATE_LIMIT.windowMs;
const MAX_BUCKETS = 10_000;

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

/** Client key: first hop of x-forwarded-for, else x-real-ip, else "unknown". */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim().slice(0, 64);
  return "unknown";
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; response: Response };

/**
 * Token bucket per client key. Returns a ready-made 429 with Retry-After
 * when the bucket is empty. `now` is injectable for tests.
 */
export function rateLimit(req: Request, now: number = Date.now()): RateLimitResult {
  const key = clientKey(req);
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) pruneBuckets(now);
    b = { tokens: RATE_LIMIT.capacity, updatedAt: now };
    buckets.set(key, b);
  } else {
    const elapsed = Math.max(0, now - b.updatedAt);
    b.tokens = Math.min(RATE_LIMIT.capacity, b.tokens + elapsed * REFILL_PER_MS);
    b.updatedAt = now;
  }

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens) };
  }

  const retryAfterSec = Math.max(1, Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000));
  return {
    ok: false,
    retryAfterSec,
    response: json(
      {
        error: "rate_limited",
        message: `Limit is ${RATE_LIMIT.capacity} requests per ${RATE_LIMIT.windowMs / 60_000} minutes per client. Try again in ${retryAfterSec} seconds.`,
        retry_after_seconds: retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    ),
  };
}

function pruneBuckets(now: number) {
  for (const [k, b] of buckets) {
    if (now - b.updatedAt > RATE_LIMIT.windowMs) buckets.delete(k);
  }
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

/** Test hook. Not used by routes. */
export function resetRateLimitForTests(): void {
  buckets.clear();
}

/* ─── Logging (no PII) ──────────────────────────────────────── */

export type AgentLogEntry = {
  ts: string;
  route: string;
  ok: boolean;
  ms: number;
  agentOrigin: string | null;
};

/**
 * Logs exactly `{ ts, route, ok, ms, agentOrigin }`. Never a body, never
 * an IP, never a query string. `agentOrigin` is the X-Agent-Origin header
 * truncated to 64 chars, for the analytics dimension in
 * docs/ai-visibility-checklist.md.
 */
export function logAgentRequest(req: Request, info: { route: string; ok: boolean; ms: number }): AgentLogEntry {
  const entry: AgentLogEntry = {
    ts: new Date().toISOString(),
    route: info.route,
    ok: info.ok,
    ms: Math.round(info.ms),
    agentOrigin: req.headers.get("x-agent-origin")?.slice(0, 64) ?? null,
  };
  console.info(`[agent-api] ${JSON.stringify(entry)}`);
  return entry;
}

/* ─── Route wrapper ─────────────────────────────────────────── */

/**
 * Applies rate limiting, timing, logging, and a last-resort 500 around a
 * handler. The feature-flag check stays explicit in each route file so it
 * is visible at a glance.
 */
export async function withAgentRoute(req: Request, route: string, handler: () => Promise<Response> | Response): Promise<Response> {
  const started = Date.now();
  const limited = rateLimit(req);
  if (!limited.ok) {
    logAgentRequest(req, { route, ok: false, ms: Date.now() - started });
    return limited.response;
  }
  try {
    const res = await handler();
    logAgentRequest(req, { route, ok: res.ok, ms: Date.now() - started });
    return res;
  } catch {
    logAgentRequest(req, { route, ok: false, ms: Date.now() - started });
    return json({ error: "internal_error", message: "Something went wrong on our side. Nothing you sent was stored." }, { status: 500 });
  }
}

/** JSON cannot carry Infinity; break-even results use null for "never". */
export function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}
