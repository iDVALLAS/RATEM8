import { afterEach, describe, expect, it } from "vitest";
import { openWhileLocked, siteLockOn, testerHash, validTesterCookie } from "./site-lock";

describe("pre-launch lock (C22)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is on in production unless SITE_LOCK is exactly false, and off on previews", () => {
    delete process.env.SITE_LOCK;
    process.env.VERCEL_ENV = "production";
    expect(siteLockOn()).toBe(true);
    process.env.SITE_LOCK = "false";
    expect(siteLockOn()).toBe(false);
    delete process.env.SITE_LOCK;
    process.env.VERCEL_ENV = "preview";
    expect(siteLockOn()).toBe(false);
    process.env.SITE_LOCK = "true";
    expect(siteLockOn()).toBe(true);
  });

  it("keeps the password page, legal pages and assets open, and locks the chat and its APIs", () => {
    for (const p of ["/", "/demo", "/api/demo-auth", "/api/health", "/licensing", "/privacy", "/_next/static/x.js", "/team/a.webp", "/mlo/pricing"]) expect(openWhileLocked(p)).toBe(true);
    for (const p of ["/chat", "/second-look", "/rates", "/api/m8-chat", "/api/m8-speak", "/api/m8-listen", "/api/second-look", "/api/m8-loan-estimate", "/api/m8-callback", "/states/wa", "/llms.txt", "/ai"]) expect(openWhileLocked(p)).toBe(false);
  });

  it("lets in only a cookie made from the current password", async () => {
    process.env.DEMO_PASSWORD = "open-sesame";
    expect(await validTesterCookie(await testerHash("open-sesame"))).toBe(true);
    expect(await validTesterCookie("qa")).toBe(false);
    expect(await validTesterCookie(undefined)).toBe(false);
    process.env.DEMO_PASSWORD = "new-password";
    expect(await validTesterCookie(await testerHash("open-sesame"))).toBe(false);
    delete process.env.DEMO_PASSWORD;
    expect(await validTesterCookie(await testerHash(""))).toBe(false);
  });
});
