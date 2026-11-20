import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, stepAt, verifyTotp } from "./totp";
import { confirmEnroll, finishCodeStep, mfaOn, MFA_MAX_TRIES, pendingEnroll, resetFor, seal, startEnroll, unseal, disableOwn } from "./mfa";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "./store";
import { openSession, userForSession, verifySignIn, sha256 } from "./auth";
import { resetMemoryCounters } from "@/lib/m8/kv";

const RFC = Buffer.from("12345678901234567890");
const T0 = Date.parse("2026-11-19T18:00:00Z");
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "system" };
const lo: User = { id: "u_lo", email: "lo@example.com", name: "Lo", role: "lo", mloId: null, status: "active", createdAt: "2026-01-02T00:00:00Z", createdBy: "owner@example.com" };

const codeAt = (keyGrouped: string, ms: number) => hotp(base32Decode(keyGrouped), stepAt(ms));

describe("Authenticator codes (D34)", () => {
  it("matches the RFC 6238 test values", () => {
    const b32 = base32Encode(RFC);
    expect(b32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(hotp(RFC, stepAt(59_000), 8)).toBe("94287082");
    expect(hotp(RFC, stepAt(1111111109_000), 8)).toBe("07081804");
    expect(hotp(RFC, stepAt(1234567890_000), 8)).toBe("89005924");
    expect(hotp(RFC, stepAt(2000000000_000), 8)).toBe("69279037");
    // One step either side for clock drift, never two; never a step already used.
    const now = 1234567890_000;
    const code = hotp(RFC, stepAt(now));
    expect(verifyTotp(b32, code, now)).toBe(stepAt(now));
    expect(verifyTotp(b32, code, now + 30_000)).toBe(stepAt(now));
    expect(verifyTotp(b32, code, now + 61_000)).toBeNull();
    expect(verifyTotp(b32, code, now, stepAt(now))).toBeNull();
    expect(verifyTotp(b32, "12345", now)).toBeNull();
  });

  it("keeps the secret sealed", () => {
    const s = seal("GEZDGNBV");
    expect(s).not.toContain("GEZDGNBV");
    expect(unseal(s)).toBe("GEZDGNBV");
    expect(unseal(s.slice(0, -2) + "xx")).toBeNull();
  });
});

describe("The second sign-in step (D34)", () => {
  let store: MemoryAccountStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    store = new MemoryAccountStore();
    setAccountStoreForTests(store);
    resetMemoryCounters();
    await store.putUser(owner);
    await store.putUser(lo);
  });
  afterEach(() => {
    process.env = { ...saved };
    setAccountStoreForTests(null);
  });

  const enroll = async (u: User, at = T0) => {
    const s = await startEnroll(u, at);
    if ("error" in s) throw new Error(s.error);
    const r = await confirmEnroll(u, codeAt(s.key, at), at);
    if (!r.ok) throw new Error(r.error);
    return { key: s.key, recovery: r.recovery };
  };
  const link = async (u: User, at: number) => {
    await store.putLoginToken(sha256(`t-${at}`), u.id, new Date(at + 900_000).toISOString());
    return verifySignIn(`t-${at}`, at);
  };

  it("needs a working code to turn on, and gives ten recovery codes", async () => {
    const s = await startEnroll(lo, T0);
    if ("error" in s) throw new Error();
    expect(await pendingEnroll(lo)).toMatchObject({ key: s.key });
    expect(s.uri).toMatch(/^otpauth:\/\/totp\/MLO%20Command%20Center%3Alo%40example\.com\?secret=/);
    expect(await confirmEnroll(lo, "000000", T0)).toMatchObject({ ok: false });
    expect(await mfaOn(lo.id)).toBe(false);
    const r = await confirmEnroll(lo, codeAt(s.key, T0), T0);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.recovery).toHaveLength(10);
    expect(await mfaOn(lo.id)).toBe(true);
    // Recovery codes are stored only as hashes.
    const rec = (await store.getMfa(lo.id))!;
    expect(JSON.stringify(rec)).not.toContain(r.ok ? r.recovery[0] : "x");
  });

  it("the emailed link opens the code step, not a session", async () => {
    const { key } = await enroll(lo);
    const res = await link(lo, T0 + 120_000);
    expect(res && "mfa" in res).toBe(true);
    const p = (res as { mfa: string }).mfa;
    expect(await finishCodeStep(p, "000000", T0 + 125_000)).toMatchObject({ ok: false, error: expect.stringMatching(/tries left/) });
    const ok = await finishCodeStep(p, codeAt(key, T0 + 130_000), T0 + 130_000);
    expect(ok).toMatchObject({ ok: true, used: "totp" });
    // The ticket is spent, and the same code can't be used again.
    expect(await finishCodeStep(p, codeAt(key, T0 + 130_000), T0 + 131_000)).toMatchObject({ ok: false, spent: true });
    const again = (await link(lo, T0 + 132_000)) as { mfa: string };
    expect(await finishCodeStep(again.mfa, codeAt(key, T0 + 130_000), T0 + 132_000)).toMatchObject({ ok: false });
    // Without the app, the link still opens a session directly.
    expect(await link(owner, T0)).toHaveProperty("session");
  });

  it("locks after too many wrong codes, and expires after five minutes", async () => {
    const { key } = await enroll(lo);
    const p = ((await link(lo, T0 + 60_000)) as { mfa: string }).mfa;
    for (let i = 0; i < MFA_MAX_TRIES; i++) await finishCodeStep(p, "000000", T0 + 61_000);
    expect(await finishCodeStep(p, codeAt(key, T0 + 62_000), T0 + 62_000)).toMatchObject({ ok: false, spent: true });
    const p2 = ((await link(lo, T0 + 100_000)) as { mfa: string }).mfa;
    expect(await finishCodeStep(p2, codeAt(key, T0 + 100_000 + 301_000), T0 + 100_000 + 301_000)).toMatchObject({ ok: false, spent: true });
  });

  it("a recovery code works once", async () => {
    const { recovery } = await enroll(lo);
    const p = ((await link(lo, T0 + 60_000)) as { mfa: string }).mfa;
    expect(await finishCodeStep(p, recovery[0].toUpperCase(), T0 + 61_000)).toMatchObject({ ok: true, used: "recovery", recoveryLeft: 9 });
    const p2 = ((await link(lo, T0 + 70_000)) as { mfa: string }).mfa;
    expect(await finishCodeStep(p2, recovery[0], T0 + 71_000)).toMatchObject({ ok: false });
  });

  it("the owner can reset a lost phone (which signs them out); only the owner can turn off a requirement", async () => {
    const { key } = await enroll(lo);
    const s = await openSession(lo, T0);
    expect(await resetFor(lo, owner.id, T0)).toMatchObject({ ok: false });
    expect(await resetFor(owner, lo.id, T0)).toEqual({ ok: true });
    expect(await mfaOn(lo.id)).toBe(false);
    expect(await userForSession(s, T0 + 1000)).toBeNull();
    const { key: k2 } = await enroll(lo, T0 + 90_000);
    process.env.CC_REQUIRE_MFA = "true";
    expect(await disableOwn(lo, codeAt(k2, T0 + 150_000), T0 + 150_000)).toMatchObject({ ok: false });
    delete process.env.CC_REQUIRE_MFA;
    expect(await disableOwn(lo, codeAt(k2, T0 + 150_000), T0 + 150_000)).toEqual({ ok: true });
    expect(key).not.toBe(k2);
  });
});
