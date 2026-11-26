import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "./store";
import {
  asAuthentication,
  beginPasskeySignIn,
  beginRegistration,
  CHALLENGE_TTL_MS,
  clientChallenge,
  deviceNameFrom,
  finishPasskeySignIn,
  finishRegistration,
  listPasskeysFor,
  MAX_PASSKEYS,
  PASSKEY_LIMITS,
  passkeyLabel,
  removePasskey,
  rpFrom,
  type Rp,
} from "./passkeys";
import { forgetDevices, sha256, updateUser, userForSession, openSession } from "./auth";
import { confirmEnroll, disableOwn, resetFor, startEnroll } from "./mfa";
import { base32Decode, hotp, stepAt } from "./totp";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { REMEMBER_COPY } from "@/lib/content/sign-in";
import { FACE_ID, FACE_ID_ERRORS } from "@/lib/content/face-id";
import { activityLabel } from "@/lib/content/activity";
import { afterSignIn, safeNext } from "@/app/sign-in/fields";

/**
 * D94: Face ID sign-in (a passkey on the person's own device). These run real WebAuthn ceremonies against
 * @simplewebauthn/server with a software authenticator (an ES256 key made here), so origin, RP ID, user
 * verification and the signature counter are checked by the real library, not a mock.
 */

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));

const T0 = Date.parse("2026-11-26T18:00:00Z");
const RP: Rp = { rpID: "loanm8.com", origin: "https://loanm8.com" };
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "system" };
const lo: User = { id: "u_lo", email: "lo@example.com", name: "Lo", role: "lo", mloId: null, status: "active", createdAt: "2026-01-02T00:00:00Z", createdBy: "owner@example.com" };
const B1 = "browser-one-binding-value-123456";
const B2 = "browser-two-binding-value-654321";
const IP = "iphash";

const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha = (b: Uint8Array | Buffer | string) => createHash("sha256").update(b).digest();

/** A software platform authenticator: one ES256 key, a counter, and the flags we ask it to set. */
class SoftAuthenticator {
  readonly credId = Buffer.from(`cred-${Math.random().toString(36).slice(2)}-0123456789`);
  private key: KeyObject;
  readonly pub: KeyObject;
  counter = 0;
  constructor(public userHandle: string) {
    const k = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.key = k.privateKey;
    this.pub = k.publicKey;
  }
  private cose() {
    const jwk = this.pub.export({ format: "jwk" }) as { x: string; y: string };
    return isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))], [-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))]]));
  }
  private authData(rpID: string, uv: boolean, attested: boolean) {
    const flags = 0x01 | (uv ? 0x04 : 0) | (attested ? 0x40 : 0);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const parts = [sha(rpID), Buffer.from([flags]), counter];
    if (attested) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credId.length);
      parts.push(Buffer.alloc(16), len, this.credId, Buffer.from(this.cose()));
    }
    return Buffer.concat(parts);
  }
  private client(type: string, challenge: string, origin: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }
  register(challenge: string, o: { rpID?: string; origin?: string; uv?: boolean } = {}) {
    const auth = this.authData(o.rpID ?? RP.rpID, o.uv ?? true, true);
    const att = isoCBOR.encode(new Map<string, string | Map<string, never> | Uint8Array>([["fmt", "none"], ["attStmt", new Map()], ["authData", new Uint8Array(auth)]]));
    return {
      id: b64u(this.credId),
      rawId: b64u(this.credId),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(this.client("webauthn.create", challenge, o.origin ?? RP.origin)), attestationObject: b64u(att), transports: ["internal", "hybrid"] },
    };
  }
  /** Signs in; the counter goes up by `step` first (0 keeps it; a negative step rolls it back, as a copied key would). */
  assert(challenge: string, o: { rpID?: string; origin?: string; uv?: boolean; step?: number; userHandle?: string } = {}) {
    this.counter += o.step ?? 1;
    const auth = this.authData(o.rpID ?? RP.rpID, o.uv ?? true, false);
    const cd = this.client("webauthn.get", challenge, o.origin ?? RP.origin);
    const sig = sign("sha256", Buffer.concat([auth, sha(cd)]), this.key);
    return {
      id: b64u(this.credId),
      rawId: b64u(this.credId),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(cd), authenticatorData: b64u(auth), signature: b64u(sig), userHandle: b64u(Buffer.from(o.userHandle ?? this.userHandle)) },
    };
  }
}

describe("Face ID sign-in (D94)", () => {
  let store: MemoryAccountStore;
  beforeEach(async () => {
    store = new MemoryAccountStore();
    setAccountStoreForTests(store);
    resetMemoryCounters();
    await store.putUser(owner);
    await store.putUser(lo);
  });
  afterEach(() => setAccountStoreForTests(null));

  /** Turns Face ID on for `u` at `at` in browser B1; returns the authenticator. */
  const enrollFaceId = async (u: User, at = T0) => {
    const dev = new SoftAuthenticator(u.id);
    const o = await beginRegistration(u, RP, B1, at);
    if (!o.ok) throw new Error(o.reason);
    const r = await finishRegistration(u, RP, B1, dev.register(o.options.challenge), "iPhone", at + 1000);
    if (!r.ok) throw new Error(r.reason);
    return { dev, passkey: r.passkey };
  };
  const signIn = async (dev: SoftAuthenticator, at: number, o: Parameters<SoftAuthenticator["assert"]>[1] = {}, browser = B1) => {
    const opt = await beginPasskeySignIn(RP, B1, IP, at);
    if (!opt.ok) throw new Error(opt.reason);
    return finishPasskeySignIn(RP, browser, dev.assert(opt.options.challenge, o), IP, at + 1000);
  };

  it("says 'device', not 'computer', on the sign-in forms and Sign-in security", () => {
    expect(REMEMBER_COPY.label).toBe("Remember this device for 30 days");
    for (const v of Object.values(REMEMBER_COPY)) expect(v).not.toMatch(/computer/i);
    const security = readFileSync(join(process.cwd(), "app/mlo/security/page.tsx"), "utf8") + readFileSync(join(process.cwd(), "app/mlo/security/actions.ts"), "utf8");
    expect(security).toContain("Forget my remembered devices");
    expect(security).toContain("Remembered devices");
    expect(security).not.toMatch(/remember(ed)? (this )?computers?/i);
    expect(activityLabel("signin.device_remembered")).toBe("Remembered a device for 30 days");
    expect(activityLabel("signin.devices_forgotten")).toBe("Forgot their remembered devices");
    expect(activityLabel("passkey.signin")).toBe("Signed in with Face ID");
    expect(activityLabel("passkey.something_new")).toBe("Face ID activity");
    expect(FACE_ID.toggle).toBe("Use Face ID to sign in on this device");
    expect(FACE_ID.toggleNote).toMatch(/fingerprint or Windows Hello/);
  });

  it("asks for a platform authenticator, a discoverable key and user verification, under this site's own host", async () => {
    const o = await beginRegistration(owner, RP, B1, T0);
    if (!o.ok) throw new Error(o.reason);
    expect(o.options.rp).toEqual({ name: "MLO Command Center", id: "loanm8.com" });
    expect(o.options.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" });
    expect(Buffer.from(o.options.user.id, "base64url").toString()).toBe(owner.id);
    // The challenge is stored only as a hash.
    const tokens = [...(store as unknown as { tokens: Map<string, unknown> }).tokens.keys()];
    expect(tokens.some((k) => k.includes(o.options.challenge))).toBe(false);
    const s = await beginPasskeySignIn(RP, B1, IP, T0);
    if (!s.ok) throw new Error(s.reason);
    expect(s.options).toMatchObject({ rpId: "loanm8.com", userVerification: "required" });
    expect(s.options.allowCredentials ?? []).toEqual([]);
  });

  it("the relying party is the request's host; the origin must be https (or http on localhost)", () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(rpFrom(h({ host: "loanm8.com", "x-forwarded-proto": "https" }))).toEqual({ rpID: "loanm8.com", origin: "https://loanm8.com" });
    expect(rpFrom(h({ host: "ratem-8-git-x.vercel.app" }))).toEqual({ rpID: "ratem-8-git-x.vercel.app", origin: "https://ratem-8-git-x.vercel.app" });
    expect(rpFrom(h({ host: "localhost:3100", "x-forwarded-proto": "http" }))).toEqual({ rpID: "localhost", origin: "http://localhost:3100" });
    expect(rpFrom(h({ host: "evil.example", "x-forwarded-proto": "http" }))).toBeNull();
    expect(rpFrom(h({ host: "bad host/x" }))).toBeNull();
    expect(rpFrom(h({}))).toBeNull();
  });

  it("turns on, then signs in with no email: a session like any other, 12 hours or 30 days with Remember", async () => {
    const { dev, passkey } = await enrollFaceId(owner);
    expect(passkey).toMatchObject({ userId: owner.id, deviceName: "iPhone", counter: 0, transports: ["internal", "hybrid"], lastUsedAt: null });
    expect(passkeyLabel(passkey)).toBe("iPhone · added Nov 26, 2026");
    const r = await signIn(dev, T0 + 60_000);
    if (!r.ok) throw new Error(r.reason);
    expect(r.user.id).toBe(owner.id);
    expect((await listPasskeysFor(owner))[0]).toMatchObject({ counter: 1, lastUsedAt: new Date(T0 + 61_000).toISOString() });
    const s = await openSession(r.user, T0 + 61_000, false, { passkey: true });
    expect(await userForSession(s, T0 + 11 * 3_600_000)).toMatchObject({ id: owner.id });
    expect(await userForSession(s, T0 + 13 * 3_600_000)).toBeNull();
    const actions = (await store.recentAudit(10)).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["passkey.add", "passkey.signin", "signin.ok"]));
    expect((await store.recentAudit(10)).find((e) => e.action === "signin.ok")?.detail).toEqual({ remember: false, faceId: true });
    // Nothing in the audit trail is a credential id or key.
    const log = JSON.stringify(await store.recentAudit(50));
    expect(log).not.toContain(dev.credId.toString("base64url"));
    expect(log).not.toContain(passkey.publicKey);
  });

  it("a challenge works once, for 5 minutes, only in the browser that asked", async () => {
    const dev = new SoftAuthenticator(owner.id);
    // Setup: another browser's binding, then the right one twice.
    const o = await beginRegistration(owner, RP, B1, T0);
    if (!o.ok) throw new Error(o.reason);
    const reg = dev.register(o.options.challenge);
    expect(await finishRegistration(owner, RP, B2, reg, "Mac", T0 + 1000)).toMatchObject({ ok: false, reason: "challenge" });
    // The wrong browser didn't spend it.
    expect((await finishRegistration(owner, RP, B1, reg, "Mac", T0 + 1000)).ok).toBe(true);
    expect(await finishRegistration(owner, RP, B1, reg, "Mac", T0 + 2000)).toMatchObject({ ok: false, reason: "challenge" });
    // No cookie at all.
    expect(await finishRegistration(owner, RP, undefined, reg, "Mac", T0 + 2000)).toMatchObject({ ok: false, reason: "binding" });
    // Expiry: a sign-in challenge 5 minutes and a second old.
    const s = await beginPasskeySignIn(RP, B1, IP, T0);
    if (!s.ok) throw new Error(s.reason);
    expect(await finishPasskeySignIn(RP, B1, dev.assert(s.options.challenge), IP, T0 + CHALLENGE_TTL_MS + 1000)).toMatchObject({ ok: false, reason: "challenge" });
    // Single use at sign-in.
    const s2 = await beginPasskeySignIn(RP, B1, IP, T0 + 10_000);
    if (!s2.ok) throw new Error(s2.reason);
    expect((await finishPasskeySignIn(RP, B1, dev.assert(s2.options.challenge), IP, T0 + 11_000)).ok).toBe(true);
    expect(await finishPasskeySignIn(RP, B1, dev.assert(s2.options.challenge), IP, T0 + 12_000)).toMatchObject({ ok: false, reason: "challenge" });
    // A setup challenge is never a sign-in challenge (nor the reverse), and one person's setup isn't another's.
    const o2 = await beginRegistration(owner, RP, B1, T0 + 20_000);
    if (!o2.ok) throw new Error(o2.reason);
    expect(await finishPasskeySignIn(RP, B1, dev.assert(o2.options.challenge), IP, T0 + 21_000)).toMatchObject({ ok: false, reason: "challenge" });
    expect(await finishRegistration(lo, RP, B1, new SoftAuthenticator(lo.id).register(o2.options.challenge), "Mac", T0 + 21_000)).toMatchObject({ ok: false, reason: "challenge" });
  });

  it("refuses the wrong origin or RP ID (the real library checks), and a device without user verification", async () => {
    const dev = new SoftAuthenticator(owner.id);
    const reg = async (o: Parameters<SoftAuthenticator["register"]>[1]) => {
      const x = await beginRegistration(owner, RP, B1, T0);
      if (!x.ok) throw new Error(x.reason);
      return finishRegistration(owner, RP, B1, dev.register(x.options.challenge, o), "Mac", T0 + 1000);
    };
    expect(await reg({ origin: "https://loanm8.com.evil.example" })).toMatchObject({ ok: false, reason: "verify" });
    expect(await reg({ origin: "http://loanm8.com" })).toMatchObject({ ok: false, reason: "verify" });
    expect(await reg({ rpID: "evil.example" })).toMatchObject({ ok: false, reason: "verify" });
    expect(await reg({ uv: false })).toMatchObject({ ok: false, reason: "verify" });
    expect(await listPasskeysFor(owner)).toHaveLength(0);
    const { dev: real } = await enrollFaceId(owner, T0 + 5000);
    expect(await signIn(real, T0 + 10_000, { origin: "https://phish.example" })).toMatchObject({ ok: false, reason: "verify" });
    expect(await signIn(real, T0 + 20_000, { rpID: "phish.example" })).toMatchObject({ ok: false, reason: "verify" });
    expect(await signIn(real, T0 + 30_000, { uv: false })).toMatchObject({ ok: false, reason: "verify" });
    expect((await signIn(real, T0 + 40_000)).ok).toBe(true);
  });

  it("refuses a signature counter that didn't go up (a copied key), and notes it", async () => {
    const { dev } = await enrollFaceId(owner);
    expect((await signIn(dev, T0 + 10_000, { step: 5 })).ok).toBe(true); // counter 5
    expect(await signIn(dev, T0 + 20_000, { step: 0 })).toMatchObject({ ok: false }); // still 5
    expect(await signIn(dev, T0 + 30_000, { step: -2 })).toMatchObject({ ok: false }); // 3
    expect((await listPasskeysFor(owner))[0].counter).toBe(5);
    expect((await signIn(dev, T0 + 40_000, { step: 3 })).ok).toBe(true); // 6
    // A stored counter ahead of the device (it was copied and used elsewhere): refused.
    const s = await beginPasskeySignIn(RP, B1, IP, T0 + 50_000);
    if (!s.ok) throw new Error(s.reason);
    const resp = dev.assert(s.options.challenge, { step: 1 });
    const p = (await listPasskeysFor(owner))[0];
    await store.touchPasskey(p.id, 99, new Date(T0).toISOString());
    expect(await finishPasskeySignIn(RP, B1, resp, IP, T0 + 51_000)).toMatchObject({ ok: false });
  });

  it("a passkey for a disabled or removed account signs nobody in; a mismatched user handle is refused", async () => {
    const { dev } = await enrollFaceId(lo);
    expect(await signIn(dev, T0 + 1000, { userHandle: owner.id })).toMatchObject({ ok: false, reason: "handle" });
    await store.putUser({ ...lo, status: "disabled" });
    expect(await signIn(dev, T0 + 10_000)).toMatchObject({ ok: false, reason: "inactive", error: FACE_ID_ERRORS.unknown });
    await store.putUser(lo);
    expect((await signIn(dev, T0 + 20_000)).ok).toBe(true);
    // Disabling through People & roles removes the devices outright.
    expect((await updateUser(owner, lo.id, { status: "disabled" }, T0 + 30_000)).ok).toBe(true);
    expect(await listPasskeysFor(lo)).toHaveLength(0);
    await store.putUser(lo);
    expect(await signIn(dev, T0 + 40_000)).toMatchObject({ ok: false, reason: "unknown" });
    // A device nobody saved.
    expect(await signIn(new SoftAuthenticator(owner.id), T0 + 50_000)).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("Sign-in security: lists your devices, removes only your own; at most 10", async () => {
    const a = await enrollFaceId(owner, T0);
    await enrollFaceId(owner, T0 + 60_000);
    const mine = await listPasskeysFor(owner);
    expect(mine.map((p) => p.id)).toEqual([a.passkey.id, mine[1].id]);
    // Someone else can't remove it.
    expect(await removePasskey(lo, a.passkey.id, T0 + 70_000)).toBe(false);
    expect(await removePasskey(owner, a.passkey.id, T0 + 80_000)).toBe(true);
    expect(await removePasskey(owner, a.passkey.id, T0 + 90_000)).toBe(false);
    expect(await listPasskeysFor(owner)).toHaveLength(1);
    expect(await signIn(a.dev, T0 + 100_000)).toMatchObject({ ok: false, reason: "unknown" });
    expect((await store.recentAudit(5)).some((e) => e.action === "passkey.remove")).toBe(true);
    for (let i = 1; i < MAX_PASSKEYS; i++) await enrollFaceId(owner, T0 + 200_000 + i * 1000);
    expect(await beginRegistration(owner, RP, B1, T0 + 400_000)).toMatchObject({ ok: false, reason: "max" });
  });

  it("an owner's reset removes them; turning the phone code off or on, forgetting remembered devices and signing out keep them", async () => {
    const { dev } = await enrollFaceId(lo);
    const s = await startEnroll(lo, T0);
    if ("error" in s) throw new Error(s.error);
    const code = (ms: number) => hotp(base32Decode(s.key), stepAt(ms));
    expect((await confirmEnroll(lo, code(T0 + 30_000), T0 + 30_000)).ok).toBe(true);
    expect(await listPasskeysFor(lo)).toHaveLength(1);
    expect((await disableOwn(lo, code(T0 + 90_000), T0 + 90_000)).ok).toBe(true);
    await forgetDevices(lo, T0 + 91_000);
    expect(await listPasskeysFor(lo)).toHaveLength(1);
    // With the phone code on, Face ID still signs in without it.
    const s2 = await startEnroll(lo, T0 + 100_000);
    if ("error" in s2) throw new Error(s2.error);
    expect((await confirmEnroll(lo, hotp(base32Decode(s2.key), stepAt(T0 + 100_000)), T0 + 100_000)).ok).toBe(true);
    expect((await signIn(dev, T0 + 110_000)).ok).toBe(true);
    expect((await resetFor(owner, lo.id, T0 + 120_000)).ok).toBe(true);
    expect(await listPasskeysFor(lo)).toHaveLength(0);
    expect(await signIn(dev, T0 + 130_000)).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("rate limits sign-in per IP", async () => {
    for (let i = 0; i < PASSKEY_LIMITS.signinOptions; i++) expect((await beginPasskeySignIn(RP, B1, "busy-ip", T0)).ok).toBe(true);
    expect(await beginPasskeySignIn(RP, B1, "busy-ip", T0)).toMatchObject({ ok: false, reason: "rate", error: FACE_ID_ERRORS.tooMany });
    // The next hour starts fresh.
    expect((await beginPasskeySignIn(RP, B1, "busy-ip", T0 + 3_600_000)).ok).toBe(true);
    for (let i = 0; i < PASSKEY_LIMITS.signin; i++) await finishPasskeySignIn(RP, B1, {}, "busy-ip-2", T0);
    expect(await finishPasskeySignIn(RP, B1, {}, "busy-ip-2", T0)).toMatchObject({ ok: false, reason: "rate" });
  });

  it("small helpers: shapes, challenge, device names, where a sign-in lands", () => {
    expect(asAuthentication({ type: "public-key", id: "x" })).toBeNull();
    expect(clientChallenge(b64u(Buffer.from(JSON.stringify({ challenge: "abcdefghijklmnopqrstuv" }))))).toBe("abcdefghijklmnopqrstuv");
    expect(clientChallenge("%%%")).toBeNull();
    expect(deviceNameFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceNameFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(deviceNameFrom("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile")).toBe("Android phone");
    expect(deviceNameFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows PC");
    expect(deviceNameFrom(null)).toBe("This device");
    expect(afterSignIn(false)).toBe("/mlo");
    expect(afterSignIn(true)).toBe("/sign-in/face-id?next=%2Fmlo");
    expect(afterSignIn(true, "/mlo/security?recovery=3")).toBe("/sign-in/face-id?next=%2Fmlo%2Fsecurity%3Frecovery%3D3");
    expect(safeNext("/mlo/security?recovery=3")).toBe("/mlo/security?recovery=3");
    for (const bad of ["https://evil.example", "//evil.example", "/mlo//evil", "/sign-in", "javascript:x", undefined]) expect(safeNext(bad)).toBe("/mlo");
    expect(sha256("x")).toHaveLength(64);
  });
});
