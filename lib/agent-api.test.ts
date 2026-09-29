import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  envelope,
  rateLimit,
  resetRateLimitForTests,
  RATE_LIMIT,
  AGENT_API_VERSION,
  AGENT_DISCLAIMER,
  logAgentRequest,
  json,
  corsHeaders,
  finiteOrNull,
} from "./agent-api";
import { CALC_DISCLAIMER, NOT_A_COMMITMENT, STATES } from "./config";

const req = (ip: string, extra: Record<string, string> = {}) =>
  new Request("https://example.test/api/agent/states", { headers: { "x-forwarded-for": ip, ...extra } });

describe("envelope", () => {
  it("adds every mandatory field and keeps the payload", () => {
    const out = envelope({ tool: "points-breakeven", result: { a: 1 } });
    expect(out.tool).toBe("points-breakeven");
    expect(out.result).toEqual({ a: 1 });
    expect(out.disclaimer).toBe(`${CALC_DISCLAIMER} ${NOT_A_COMMITMENT}`);
    expect(out.disclaimer).toBe(AGENT_DISCLAIMER);
    expect(new Date(out.as_of).toISOString()).toBe(out.as_of);
    expect(out.requires_human_consent_for).toEqual(["credit_pull", "recording", "data_sharing"]);
    expect(out.version).toBe(AGENT_API_VERSION);
  });

  it("lists licensed states from config with code, name, and service area", () => {
    const out = envelope({});
    expect(out.licensed_states).toHaveLength(STATES.length);
    expect(out.licensed_states).toEqual(STATES.map((s) => ({ code: s.code, name: s.name, serviceArea: s.serviceArea })));
  });

  it("never lets extra or payload fields overwrite the mandatory ones", () => {
    const out = envelope({ disclaimer: "nope", version: "0" } as unknown as object, { as_of: "never" });
    expect(out.disclaimer).toBe(AGENT_DISCLAIMER);
    expect(out.version).toBe(AGENT_API_VERSION);
    expect(out.as_of).not.toBe("never");
  });

  it("carries no rate or pricing field of its own", () => {
    const keys = Object.keys(envelope({}));
    expect(keys.some((k) => /rate|price|apr/i.test(k))).toBe(false);
  });
});

describe("rateLimit", () => {
  beforeEach(() => resetRateLimitForTests());

  it("allows the bucket capacity, then returns a 429 with Retry-After", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT.capacity; i++) {
      expect(rateLimit(req("10.0.0.1"), t0).ok).toBe(true);
    }
    const r = rateLimit(req("10.0.0.1"), t0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(429);
    expect(Number(r.response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(r.retryAfterSec).toBe(Number(r.response.headers.get("Retry-After")));
    const body = (await r.response.json()) as { error: string; retry_after_seconds: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retry_after_seconds).toBe(r.retryAfterSec);
  });

  it("keeps separate buckets per client IP", () => {
    const t0 = 5_000;
    for (let i = 0; i < RATE_LIMIT.capacity; i++) rateLimit(req("10.0.0.2"), t0);
    expect(rateLimit(req("10.0.0.2"), t0).ok).toBe(false);
    expect(rateLimit(req("10.0.0.3"), t0).ok).toBe(true);
  });

  it("refills over time", () => {
    const t0 = 0;
    for (let i = 0; i < RATE_LIMIT.capacity; i++) rateLimit(req("10.0.0.4"), t0);
    expect(rateLimit(req("10.0.0.4"), t0).ok).toBe(false);
    // A full window later the bucket is full again.
    const later = rateLimit(req("10.0.0.4"), t0 + RATE_LIMIT.windowMs);
    expect(later.ok).toBe(true);
    if (later.ok) expect(later.remaining).toBe(RATE_LIMIT.capacity - 1);
  });

  it("uses the first hop of x-forwarded-for", () => {
    const t0 = 42;
    for (let i = 0; i < RATE_LIMIT.capacity; i++) rateLimit(req("10.0.0.5, 192.168.0.1"), t0);
    expect(rateLimit(req("10.0.0.5"), t0).ok).toBe(false);
  });
});

describe("logAgentRequest", () => {
  it("logs only ts, route, ok, ms, agentOrigin", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const entry = logAgentRequest(req("10.0.0.6", { "x-agent-origin": "x".repeat(100) }), { route: "/api/agent/states", ok: true, ms: 12.6 });
    expect(Object.keys(entry).sort()).toEqual(["agentOrigin", "ms", "ok", "route", "ts"]);
    expect(entry.agentOrigin).toHaveLength(64);
    expect(entry.ms).toBe(13);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).not.toContain("10.0.0.6");
    spy.mockRestore();
  });

  it("records null when no X-Agent-Origin header is sent", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(logAgentRequest(req("10.0.0.7"), { route: "/x", ok: false, ms: 1 }).agentOrigin).toBeNull();
    spy.mockRestore();
  });
});

describe("json + corsHeaders", () => {
  it("sets CORS and no-store on every response", async () => {
    const res = json({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(corsHeaders()["Access-Control-Allow-Headers"]);
    expect(await res.json()).toEqual({ a: 1 });
  });
});

describe("finiteOrNull", () => {
  it("maps Infinity to null for JSON", () => {
    expect(finiteOrNull(Infinity)).toBeNull();
    expect(finiteOrNull(12)).toBe(12);
  });
});
