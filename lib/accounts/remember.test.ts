import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base32Decode, hotp, stepAt } from "./totp";
import { confirmEnroll, disableOwn, finishCodeStep, resetFor, startEnroll } from "./mfa";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "./store";
import {
  deviceTrusted,
  forgetDevices,
  openSession,
  REMEMBER_TTL_MS,
  rememberDevice,
  requestSignIn,
  sessionTtl,
  SESSION_TTL_MS,
  sha256,
  signOut,
  userForSession,
  verifySignIn,
  verifySignInCode,
} from "./auth";
import { resetMemoryCounters } from "@/lib/m8/kv";

/** D89: "Remember this device for 30 days" (D94: was "computer"), 12 hours otherwise, and a remembered device skipping the phone code. */

const T0 = Date.parse("2026-11-23T18:00:00Z");
const H = 3_600_000;
const D = 24 * H;
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "system" };
const lo: User = { id: "u_lo", email: "lo@example.com", name: "Lo", role: "lo", mloId: null, status: "active", createdAt: "2026-01-02T00:00:00Z", createdBy: "owner@example.com" };
const codeAt = (keyGrouped: string, ms: number) => hotp(base32Decode(keyGrouped), stepAt(ms));

// signOut() reads the request's cookies; here it signs out whichever session a test sets.
let cookieSession: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieSession ? { value: cookieSession } : undefined), delete: () => {} }),
}));

describe("Remember this device (D89)", () => {
  let store: MemoryAccountStore;
  let sent: string[];
  const saved = { ...process.env };
  beforeEach(async () => {
    store = new MemoryAccountStore();
    setAccountStoreForTests(store);
    resetMemoryCounters();
    sent = [];
    cookieSession = undefined;
    process.env.MLO_OWNER_EMAIL = "owner@example.com";
    process.env.RESEND_API_KEY = "re_test";
    process.env.MLO_NOTIFICATION_EMAIL = "alerts@example.com";
    process.env.LOANM8_FROM_EMAIL = "m8@example.com";
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body).text);
      return new Response("{}", { status: 200 });
    }));
    await store.putUser(owner);
    await store.putUser(lo);
  });
  afterEach(() => {
    process.env = { ...saved };
    setAccountStoreForTests(null);
    vi.unstubAllGlobals();
  });

  /** Asks for a sign-in at `at`; returns the browser's pending value, the emailed code and the link token. */
  const ask = async (email: string, at: number, ip = "ip") => {
    const r = (await requestSignIn(email, "https://loanm8.com", ip, at)) as { ok: true; pending: string };
    const text = sent[sent.length - 1];
    return { pending: r.pending, code: /code is (\d{6})/.exec(text)![1], link: decodeURIComponent(/t=([^\s]+)/.exec(text)![1]) };
  };
  const enroll = async (u: User, at: number) => {
    const s = await startEnroll(u, at);
    if ("error" in s) throw new Error(s.error);
    const r = await confirmEnroll(u, codeAt(s.key, at), at);
    if (!r.ok) throw new Error(r.error);
    return s.key;
  };

  it("a sign-in lasts 12 hours unticked and 30 days ticked", async () => {
    expect(SESSION_TTL_MS).toBe(12 * H);
    expect(REMEMBER_TTL_MS).toBe(30 * D);
    expect(sessionTtl(false)).toBe(12 * H);
    expect(sessionTtl(true)).toBe(30 * D);
    const a = await ask(owner.email, T0, "ip1");
    const short = await verifySignInCode(a.pending, a.code, T0 + 1000);
    if (!("session" in short)) throw new Error("expected a session");
    expect(await userForSession(short.session, T0 + 11 * H)).toMatchObject({ id: owner.id });
    expect(await userForSession(short.session, T0 + 12 * H + 2000)).toBeNull();
    const b = await ask(owner.email, T0, "ip2");
    const long = await verifySignIn(b.link, T0 + 1000, { remember: true });
    if (!long || !("session" in long)) throw new Error("expected a session");
    expect(await userForSession(long.session, T0 + 29 * D)).toMatchObject({ id: owner.id });
    expect(await userForSession(long.session, T0 + 30 * D + 2000)).toBeNull();
    // What was chosen is in the audit log (no token, no address).
    const oks = (await store.recentAudit(20)).filter((e) => e.action === "signin.ok").map((e) => e.detail);
    expect(oks).toEqual(expect.arrayContaining([{ remember: false }, { remember: true }]));
  });

  it("with the phone code on, a device remembered after passing it skips the code for 30 days, and only for that person", async () => {
    const key = await enroll(owner, T0);
    // First sign-in: the email code, then the phone code (Remember ticked there).
    const a = await ask(owner.email, T0 + 60_000, "ip1");
    const step = await verifySignInCode(a.pending, a.code, T0 + 61_000, { remember: true });
    expect("mfa" in step).toBe(true);
    const done = await finishCodeStep((step as { mfa: string }).mfa, codeAt(key, T0 + 120_000), T0 + 120_000);
    if (!done.ok) throw new Error(done.error);
    const device = await rememberDevice(done.user, T0 + 120_000);
    expect(await deviceTrusted(owner.id, device, T0 + 121_000)).toBe(true);
    // Next sign-in on that device: the email step still, then straight in.
    const b = await ask(owner.email, T0 + 2 * D, "ip2");
    const skip = await verifySignInCode(b.pending, b.code, T0 + 2 * D + 1000, { device, remember: true });
    expect("session" in skip).toBe(true);
    expect((await store.recentAudit(5)).find((e) => e.action === "signin.ok")?.detail).toEqual({ remember: true, rememberedComputer: true });
    // Another browser (no cookie, or a made-up one), or someone else with this cookie: the phone code again.
    const c = await ask(owner.email, T0 + 2 * D, "ip3");
    expect("mfa" in (await verifySignInCode(c.pending, c.code, T0 + 2 * D + 1000, { device: "made-up-value" }))).toBe(true);
    await enroll(lo, T0 + 2 * D);
    const d = await ask(lo.email, T0 + 2 * D, "ip4");
    expect("mfa" in (await verifySignInCode(d.pending, d.code, T0 + 2 * D + 2000, { device }))).toBe(true);
    // 30 days after it was remembered, it asks again.
    const e = await ask(owner.email, T0 + 31 * D, "ip5");
    expect("mfa" in (await verifySignInCode(e.pending, e.code, T0 + 31 * D + 1000, { device }))).toBe(true);
  });

  it("never stores the token, and a remembered-device token is not a sign-in (nor the other way round)", async () => {
    const device = await rememberDevice(owner, T0);
    const session = await openSession(owner, T0, true);
    const keys = [...(store as unknown as { sessions: Map<string, unknown> }).sessions.keys()];
    expect(keys.some((k) => k.includes(device) || k.includes(session))).toBe(false);
    expect(keys.filter((k) => k.startsWith("dev:"))).toHaveLength(1);
    expect(await userForSession(device, T0 + 1000)).toBeNull();
    expect(await deviceTrusted(owner.id, session, T0 + 1000)).toBe(false);
    expect(await store.sessionUser(sha256(device), new Date(T0).toISOString())).toBeNull();
  });

  it("is forgotten by Forget my remembered devices, an authenticator reset, turning the code off or on again; plain sign-out keeps it", async () => {
    const key = await enroll(owner, T0);
    const device = await rememberDevice(owner, T0 + 1000);
    const session = await openSession(owner, T0 + 1000, true);
    // Signing out of this browser ends the sign-in, not the remembered device.
    cookieSession = session;
    await signOut();
    expect(await userForSession(session, T0 + 2000)).toBeNull();
    expect(await deviceTrusted(owner.id, device, T0 + 2000)).toBe(true);
    // Forget them all: the sign-in on another device stays.
    const other = await openSession(owner, T0 + 3000, true);
    expect(await forgetDevices(owner, T0 + 4000)).toBe(1);
    expect(await deviceTrusted(owner.id, device, T0 + 5000)).toBe(false);
    expect(await userForSession(other, T0 + 5000)).toMatchObject({ id: owner.id });
    expect(await forgetDevices(owner, T0 + 6000)).toBe(0);
    // Turning the code off forgets them; turning it on again (a new phone) does too.
    const d2 = await rememberDevice(owner, T0 + 7000);
    expect((await disableOwn(owner, codeAt(key, T0 + 90_000), T0 + 90_000)).ok).toBe(true);
    expect(await deviceTrusted(owner.id, d2, T0 + 91_000)).toBe(false);
    const d3 = await rememberDevice(owner, T0 + 92_000);
    await enroll(owner, T0 + 93_000);
    expect(await deviceTrusted(owner.id, d3, T0 + 94_000)).toBe(false);
    // An owner's reset of someone's authenticator signs them out everywhere and forgets their devices.
    await enroll(lo, T0 + 95_000);
    const d4 = await rememberDevice(lo, T0 + 96_000);
    expect((await resetFor(owner, lo.id, T0 + 97_000)).ok).toBe(true);
    expect(await deviceTrusted(lo.id, d4, T0 + 98_000)).toBe(false);
  });

  it("without the phone code on, Remember only lengthens the sign-in (no device is remembered)", async () => {
    const a = await ask(lo.email, T0, "ip1");
    const r = await verifySignInCode(a.pending, a.code, T0 + 1000, { remember: true });
    expect("session" in r).toBe(true);
    const keys = [...(store as unknown as { sessions: Map<string, unknown> }).sessions.keys()];
    expect(keys.some((k) => k.startsWith("dev:"))).toBe(false);
  });
});
