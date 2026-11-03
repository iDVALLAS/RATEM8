import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEnvelope, monitoringOn, parseDsn, report, scrub } from "./monitoring";
import { isStealthPublic, STEALTH_PUBLIC_PAGES } from "./public-paths";

/** C5: indexing, monitoring and the health check. */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Sentry reporter (C5)", () => {
  it("parses a DSN into the envelope endpoint", () => {
    expect(parseDsn("https://abc123@o42.ingest.sentry.io/7")).toEqual({ endpoint: "https://o42.ingest.sentry.io/api/7/envelope/", publicKey: "abc123", dsn: "https://abc123@o42.ingest.sentry.io/7" });
    expect(parseDsn("nonsense")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("is off and sends nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const spy = vi.spyOn(globalThis, "fetch");
    expect(monitoringOn()).toBe(false);
    await report("error", new Error("x"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends one envelope with tags when on, and never throws", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o42.ingest.sentry.io/7");
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(report("error", new Error("boom"), { route: "m8-chat" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://o42.ingest.sentry.io/api/7/envelope/");
    expect(String(init.body)).toContain('"route":"m8-chat"');
  });

  it("scrubs connection strings, emails, keys and long numbers", () => {
    expect(scrub("connect postgresql://u:p@ep-x.neon.tech/db failed for a@b.co with sk-ant-abcdef1234 acct 123456789")).toBe("connect [url] failed for [email] with [key] acct [number]");
  });

  it("builds a three-line envelope", () => {
    const env = buildEnvelope(parseDsn("https://k@h.io/1")!, "warning", "Error", "guard replaced a reply: unquoted-rate", { guard: "unquoted-rate" });
    const lines = env.split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[2]).level).toBe("warning");
  });
});

describe("public pages in stealth (C5)", () => {
  it("includes the brief's launch pages", () => {
    for (const p of ["/", "/chat", "/licensing", "/privacy", "/terms"]) expect(STEALTH_PUBLIC_PAGES).toContain(p);
  });

  it("lets the public pages and assets through, and keeps the rest gated", () => {
    for (const p of ["/chat", "/licensing/texas", "/states/oregon", "/team/headshot.webp", "/api/m8-chat", "/api/health"]) expect(isStealthPublic(p)).toBe(true);
    for (const p of ["/rates", "/join", "/calculators", "/chatroom"]) expect(isStealthPublic(p)).toBe(false);
  });
});

describe("robots and sitemap (C5)", () => {
  it("in stealth, robots allows exactly the public pages and disallows the rest", async () => {
    vi.stubEnv("NEXT_PUBLIC_STEALTH_MODE", "true");
    const { default: robots } = await import("@/app/robots");
    const rule = (robots().rules as { allow: string[]; disallow: string }[])[0];
    for (const p of ["/$", "/chat$", "/licensing$", "/privacy$", "/terms$"]) expect(rule.allow).toContain(p);
    expect(rule.disallow).toBe("/");
  });

  it("in stealth, the sitemap lists only reachable pages; live, it lists everything", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    vi.stubEnv("NEXT_PUBLIC_STEALTH_MODE", "true");
    const stealth = sitemap().map((e) => new URL(e.url).pathname);
    expect(stealth).toEqual(expect.arrayContaining(["/", "/chat", "/licensing", "/privacy", "/terms"]));
    expect(stealth).not.toContain("/calculators");
    vi.stubEnv("NEXT_PUBLIC_STEALTH_MODE", "false");
    expect(sitemap().map((e) => new URL(e.url).pathname)).toContain("/calculators");
  });
});

describe("/api/health (C5)", () => {
  it("is 503 without the API key and 200 with it; shows no configuration without the token", async () => {
    const { GET } = await import("@/app/api/health/route");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await GET(new Request("http://x/api/health"))).status).toBe(503);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const res = await GET(new Request("http://x/api/health?deep=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, chat: "on" });
    expect(body.switches).toBeUndefined();
  });
});
