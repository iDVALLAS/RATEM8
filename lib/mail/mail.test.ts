import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seal, unseal } from "./seal";
import { buildMime } from "./mime";
import { authUrl, challengeOf, grantedSend, GMAIL_SEND, newVerifier, providersOn, redirectUri, setMailFetchForTests } from "./oauth";
import { openFlow, sealFlow } from "./flow";
import { connectMailbox, disconnectMailbox, mailboxFor, sendFromMailbox } from "./service";
import { mailboxStore, newMemoryMailboxStore, setMailboxStoreForTests } from "./store";
import { sendEmail, emailReadyFor } from "@/lib/messaging/email";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";

const NOW = new Date("2026-11-20T18:00:00Z");
const ORIGIN = "https://cc.example.com";
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = { firstName: "Ann", lastName: "Lee", email: "ann@example.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2021-04-01", amount: 1, noteRate: 6 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };

type Call = { url: string; init?: RequestInit };
const json = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function fakeFetch(routes: (url: string, init: RequestInit | undefined, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  setMailFetchForTests((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return routes(url, init, calls.length);
  }) as typeof fetch);
  return calls;
}
const form = (init?: RequestInit) => new URLSearchParams(String(init?.body ?? ""));

describe("Gmail and Microsoft 365, send-only (D52)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "gid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "gsecret";
    process.env.MS_OAUTH_CLIENT_ID = "mid";
    process.env.MS_OAUTH_CLIENT_SECRET = "msecret";
    process.env.CC_LINK_SECRET = "test-secret";
    delete process.env.RESEND_API_KEY;
    delete process.env.LOANM8_FROM_EMAIL;
    setMailboxStoreForTests(newMemoryMailboxStore());
    setAccountStoreForTests(new MemoryAccountStore());
  });
  afterEach(() => {
    process.env = { ...saved };
    setMailFetchForTests(null);
    setMailboxStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("seals tokens so they can't be read or altered", () => {
    const s = seal("refresh-123");
    expect(s).not.toContain("refresh-123");
    expect(unseal(s)).toBe("refresh-123");
    const parts = s.split(".");
    parts[2] = Buffer.from("x").toString("base64url");
    expect(unseal(parts.join("."))).toBeNull();
    expect(unseal("garbage")).toBeNull();
  });

  it("builds a plain-text message with no way to inject headers", () => {
    const m = buildMime({ fromName: "Pat\r\nBcc: evil@x.com", fromEmail: "pat@co.com", to: "ann@example.com", subject: "Hello\r\nBcc: evil@x.com", text: "Hi Ann\nline two" }, NOW);
    const [head, body] = m.split("\r\n\r\n");
    expect(head.split("\r\n").filter((l) => /^bcc:/i.test(l))).toHaveLength(0);
    expect(head).toContain("Subject: Hello Bcc: evil@x.com");
    expect(head).toContain("To: ann@example.com");
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Hi Ann\r\nline two");
    expect(buildMime({ fromName: "José", fromEmail: "j@co.com", to: "a@b.co", subject: "Café update", text: "x" })).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(() => buildMime({ fromName: "x", fromEmail: "j@co.com", to: "a@b.co>, c@d.co", subject: "s", text: "x" })).toThrow();
  });

  it("asks Google and Microsoft for send permission only, with PKCE", () => {
    const v = newVerifier();
    const g = new URL(authUrl("google", ORIGIN, "st", v)!);
    expect(g.searchParams.get("scope")).toBe(`openid email ${GMAIL_SEND}`);
    expect(g.searchParams.get("scope")).not.toMatch(/readonly|modify|mail\.google\.com/);
    expect(g.searchParams.get("code_challenge")).toBe(challengeOf(v));
    expect(g.searchParams.get("code_challenge_method")).toBe("S256");
    expect(g.searchParams.get("access_type")).toBe("offline");
    expect(g.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/cc/mail/callback/google`);
    const m = new URL(authUrl("microsoft", ORIGIN, "st", v)!);
    expect(m.hostname).toBe("login.microsoftonline.com");
    expect(m.pathname).toContain("/common/");
    expect(m.searchParams.get("scope")).toContain("Mail.Send");
    expect(m.searchParams.get("scope")).not.toMatch(/Mail\.Read/);
    expect(redirectUri(`${ORIGIN}/`, "microsoft")).toBe(`${ORIGIN}/api/cc/mail/callback/microsoft`);
    delete process.env.MS_OAUTH_CLIENT_SECRET;
    expect(authUrl("microsoft", ORIGIN, "st", v)).toBeNull();
    expect(providersOn()).toEqual(["google"]);
  });

  it("checks that the send permission was actually granted", () => {
    expect(grantedSend("google", `openid ${GMAIL_SEND} email`)).toBe(true);
    expect(grantedSend("google", "openid email")).toBe(false);
    expect(grantedSend("microsoft", "https://graph.microsoft.com/Mail.Send User.Read")).toBe(true);
    expect(grantedSend("microsoft", "User.Read")).toBe(false);
  });

  it("ties the return trip to the same person, state and time", () => {
    const t = Date.now();
    const raw = sealFlow({ state: "s1", verifier: "v", provider: "google", userId: "lo1", at: t });
    expect(openFlow(raw, "google", "s1", "lo1", t + 1000)?.verifier).toBe("v");
    expect(openFlow(raw, "google", "s2", "lo1", t)).toBeNull();
    expect(openFlow(raw, "microsoft", "s1", "lo1", t)).toBeNull();
    expect(openFlow(raw, "google", "s1", "lo2", t)).toBeNull();
    expect(openFlow(raw, "google", "s1", "lo1", t + 11 * 60_000)).toBeNull();
    expect(openFlow(undefined, "google", "s1", "lo1", t)).toBeNull();
  });

  const googleConnect = (scope = `openid email ${GMAIL_SEND}`, refresh: string | null = "r1") =>
    fakeFetch((url) => {
      if (url.includes("oauth2.googleapis.com/token")) return json(200, { access_token: "a1", expires_in: 3600, scope, ...(refresh ? { refresh_token: refresh } : {}) });
      if (url.includes("userinfo")) return json(200, { email: "Pat@Co.com", email_verified: true });
      return json(404, {});
    });

  it("connects Gmail: keeps the tokens sealed and the mailbox's own address", async () => {
    const calls = googleConnect();
    const r = await connectMailbox(me, "google", "code1", "ver1", ORIGIN, NOW);
    expect(r).toEqual({ ok: true, email: "pat@co.com" });
    const p = form(calls[0].init);
    expect(p.get("code_verifier")).toBe("ver1");
    expect(p.get("redirect_uri")).toBe(`${ORIGIN}/api/cc/mail/callback/google`);
    const m = (await mailboxStore().get("lo1"))!;
    expect(m.status).toBe("connected");
    expect(JSON.stringify(m)).not.toContain('"r1"');
    expect(unseal(m.refreshSealed)).toBe("r1");
    expect(await mailboxFor(me)).toMatchObject({ provider: "google", email: "pat@co.com", label: "Gmail" });
  });

  it("refuses a connection without send permission or a lasting token", async () => {
    googleConnect("openid email");
    expect(await connectMailbox(me, "google", "c", "v", ORIGIN, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/permission to send/) });
    googleConnect(undefined, null);
    expect(await connectMailbox(me, "google", "c", "v", ORIGIN, NOW)).toMatchObject({ ok: false });
    expect(await mailboxStore().get("lo1")).toBeNull();
  });

  it("sends from Gmail, refreshing the access token when it has run out", async () => {
    googleConnect();
    await connectMailbox(me, "google", "c", "v", ORIGIN, NOW);
    const later = new Date(NOW.getTime() + 2 * 3600_000);
    const calls = fakeFetch((url) => {
      if (url.includes("/token")) return json(200, { access_token: "a2", expires_in: 3600 });
      if (url.includes("gmail.googleapis.com")) return json(200, { id: "gm_1" });
      return json(404, {});
    });
    const r = await sendFromMailbox(me, { fromName: "Pat", to: "ann@example.com", subject: "Hello", text: "Hi" }, later);
    expect(r).toEqual({ ok: true, id: "gm_1", from: "pat@co.com" });
    expect(form(calls[0].init).get("grant_type")).toBe("refresh_token");
    const send = calls[1];
    expect((send.init?.headers as Record<string, string>).Authorization).toBe("Bearer a2");
    const raw = Buffer.from(JSON.parse(String(send.init?.body)).raw, "base64url").toString("utf8");
    expect(raw).toContain('From: "Pat" <pat@co.com>');
    expect(raw).toContain("To: ann@example.com");
    // The saved refresh token stays when Google doesn't send a new one.
    expect(unseal((await mailboxStore().get("lo1"))!.refreshSealed)).toBe("r1");
  });

  it("marks the mailbox for reconnecting when the permission is taken back, and never falls back", async () => {
    googleConnect();
    await connectMailbox(me, "google", "c", "v", ORIGIN, NOW);
    fakeFetch((url) => (url.includes("/token") ? json(400, { error: "invalid_grant" }) : json(200, { id: "x" })));
    const r = await sendFromMailbox(me, { fromName: "Pat", to: "ann@example.com", subject: "Hello", text: "Hi" }, new Date(NOW.getTime() + 2 * 3600_000));
    expect(r).toMatchObject({ ok: false, reconnect: true, error: expect.stringMatching(/^Reconnect your email/) });
    expect((await mailboxStore().get("lo1"))!.status).toBe("needs_reconnect");
    // Further sends stop before calling anyone.
    const calls = fakeFetch(() => json(200, {}));
    expect(await sendFromMailbox(me, { fromName: "Pat", to: "ann@example.com", subject: "Hello", text: "Hi" }, NOW)).toMatchObject({ ok: false, reconnect: true });
    expect(calls).toHaveLength(0);
  });

  it("retries once with a fresh token on a 401, and a sending limit isn't a broken connection", async () => {
    googleConnect();
    await connectMailbox(me, "google", "c", "v", ORIGIN, NOW);
    let sends = 0;
    fakeFetch((url) => {
      if (url.includes("/token")) return json(200, { access_token: "a3", expires_in: 3600 });
      sends++;
      return sends === 1 ? json(401, {}) : json(200, { id: "gm_2" });
    });
    expect(await sendFromMailbox(me, { fromName: "Pat", to: "ann@example.com", subject: "Hi", text: "x" }, NOW)).toMatchObject({ ok: true, id: "gm_2" });
    fakeFetch(() => new Response(JSON.stringify({ error: { errors: [{ reason: "dailyLimitExceeded" }], message: "rateLimitExceeded" } }), { status: 403 }));
    expect(await sendFromMailbox(me, { fromName: "Pat", to: "ann@example.com", subject: "Hi", text: "x" }, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/daily sending limit/) });
    expect((await mailboxStore().get("lo1"))!.status).toBe("connected");
  });

  it("connects Microsoft 365 and sends through Graph, keeping the newest refresh token", async () => {
    fakeFetch((url) => {
      if (url.includes("/token")) return json(200, { access_token: "ma1", refresh_token: "mr1", expires_in: 3600, scope: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read" });
      if (url.includes("graph.microsoft.com/v1.0/me?")) return json(200, { mail: "pat@company.com", userPrincipalName: "pat@company.onmicrosoft.com" });
      return json(404, {});
    });
    expect(await connectMailbox(me, "microsoft", "c", "v", ORIGIN, NOW)).toEqual({ ok: true, email: "pat@company.com" });
    const calls = fakeFetch((url) => {
      if (url.includes("/token")) return json(200, { access_token: "ma2", refresh_token: "mr2", expires_in: 3600 });
      if (url.includes("sendMail")) return new Response(null, { status: 202 });
      return json(404, {});
    });
    const r = await sendFromMailbox(me, { fromName: "Pat", to: "ann@example.com", subject: "Hi\r\nBcc: x@y.z", text: "Hello" }, new Date(NOW.getTime() + 2 * 3600_000));
    expect(r).toMatchObject({ ok: true, from: "pat@company.com" });
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "ann@example.com" } }]);
    expect(body.message.subject).not.toMatch(/[\r\n]/);
    expect(body.saveToSentItems).toBe(true);
    expect(unseal((await mailboxStore().get("lo1"))!.refreshSealed)).toBe("mr2");
  });

  it("disconnects and revokes", async () => {
    googleConnect();
    await connectMailbox(me, "google", "c", "v", ORIGIN, NOW);
    const calls = fakeFetch(() => json(200, {}));
    expect(await disconnectMailbox(me, NOW)).toBe(true);
    expect(calls[0].url).toContain("oauth2.googleapis.com/revoke");
    expect(await mailboxFor(me)).toBeNull();
    expect(await disconnectMailbox(me, NOW)).toBe(false);
  });

  describe("client email through the send gate", () => {
    let contacts: MemoryContactStore;
    let touches: MemoryTouchStore;
    beforeEach(async () => {
      contacts = new MemoryContactStore();
      touches = new MemoryTouchStore();
      setContactStoreForTests(contacts);
      setTouchStoreForTests(touches);
      setConciergeStoreForTests(new MemoryConciergeStore());
      setAutomationStoreForTests(new MemoryAutomationStore());
      await importBatch(me, "contacts", [rec], "a.csv", "personal", NOW);
    });
    afterEach(() => {
      for (const f of [setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests]) f(null);
    });
    const ann = async () => (await contacts.list({})).contacts[0];
    const notResend = async () => {
      throw new Error("must not use Resend");
    };

    it("goes from the connected mailbox with the signature line and footer, not Resend", async () => {
      process.env.RESEND_API_KEY = "re_test";
      process.env.LOANM8_FROM_EMAIL = "m8@example.com";
      googleConnect();
      await connectMailbox(me, "google", "c", "v", ORIGIN, NOW);
      expect(await emailReadyFor(me)).toMatchObject({ ready: true, via: "mailbox", from: "pat@co.com" });
      const calls = fakeFetch((url) => (url.includes("gmail") ? json(200, { id: "gm_9" }) : json(404, {})));
      const c = await ann();
      const r = await sendEmail(me, c.id, "A quick update on your loan", "Hi Ann, the appraisal is scheduled.", "service", NOW, notResend);
      expect(r).toEqual({ ok: true });
      const raw = Buffer.from(JSON.parse(String(calls[0].init?.body)).raw, "base64url").toString("utf8");
      const [, b64] = raw.split("\r\n\r\n");
      const text = Buffer.from(b64.replace(/\r\n/g, ""), "base64").toString("utf8");
      expect(text).toContain("Equal Housing Opportunity");
      expect(text).toMatch(/\/my\//);
      const [t] = await touches.forContact(c.id);
      expect(t).toMatchObject({ channel: "email", status: "sent", providerId: "gm_9" });
    });

    it("stops, with a retry time for campaigns, while the mailbox needs reconnecting", async () => {
      process.env.RESEND_API_KEY = "re_test";
      process.env.LOANM8_FROM_EMAIL = "m8@example.com";
      googleConnect();
      await connectMailbox(me, "google", "c", "v", ORIGIN, NOW);
      const m = (await mailboxStore().get("lo1"))!;
      await mailboxStore().put({ ...m, status: "needs_reconnect" });
      expect(await emailReadyFor(me)).toMatchObject({ ready: false, reconnect: true });
      const c = await ann();
      const r = await sendEmail(me, c.id, "A quick update on your loan", "Hi Ann, the appraisal is scheduled.", "service", NOW, notResend);
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Reconnect/) });
      expect(r.ok === false && r.retryAt && Date.parse(r.retryAt) > NOW.getTime()).toBe(true);
      expect(await touches.forContact(c.id)).toHaveLength(0);
    });

    it("says to connect when there's neither a mailbox nor Resend", async () => {
      expect(await emailReadyFor(me)).toMatchObject({ ready: false, via: null });
      const c = await ann();
      expect(await sendEmail(me, c.id, "A quick update on your loan", "Hi Ann.", "service", NOW, notResend)).toMatchObject({ ok: false, error: expect.stringMatching(/Email page/) });
    });
  });
});
