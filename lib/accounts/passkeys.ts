/**
 * lib/accounts/passkeys.ts — Face ID sign-in (D94). SERVER-ONLY.
 *
 * "Face ID" is a passkey on the loan officer's own device: the device's
 * built-in authenticator (Face ID, Touch ID, an Android fingerprint or
 * Windows Hello) makes a key pair; the private key never leaves the device
 * and we keep only the public key. Signing in proves both "something you
 * have" (the device) and "something you are" (the face or finger, user
 * verification required), so a Face ID sign-in counts as the whole sign-in:
 * the emailed code and the phone code (D34) are both skipped.
 *
 *  - Turning it on needs a signed-in person: the code-step toggle sends them
 *    to /sign-in/face-id after signing in, or "Add this device" on
 *    /mlo/security#face-id.
 *  - Every ceremony gets a random challenge that works once, for 5 minutes,
 *    only in the browser that asked (the httpOnly `lm8_cc_pk` cookie), and is
 *    stored only as a hash beside the sign-in tokens.
 *  - The relying party is the request's own host, and the origin must match
 *    it exactly (loanm8.com in production, the preview host on previews).
 *  - A signature counter that goes backwards is refused (a cloned key).
 *  - A device whose account is gone or disabled signs nobody in. An owner's
 *    reset and disabling an account remove that person's devices; turning
 *    the phone code on or off, and signing out, keep them.
 * Credential ids and keys are never logged; the audit trail gets our own
 * row ids and counts only.
 *
 * The cryptography (CBOR, COSE keys, signatures) is @simplewebauthn/server.
 */
import { randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { incr } from "@/lib/m8/kv";
import { FACE_ID_ERRORS } from "@/lib/content/face-id";
import { accountStore, type PasskeyRecord, type User } from "./store";
import { sha256 } from "./auth";

/** The browser binding for a Face ID ceremony (httpOnly, path /api/cc/passkey, 5 minutes). */
export const PASSKEY_COOKIE = "lm8_cc_pk";
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MAX_PASSKEYS = 10;
/**
 * Per hour: sign-in challenges per IP (every /sign-in view asks for one where the email box can offer the passkey, so an
 * office sharing one address needs room), sign-in answers per IP, and setup challenges per person.
 */
export const PASSKEY_LIMITS = { signinOptions: 120, signin: 30, register: 20 } as const;
const AUTH_MARK = "*";
const RP_NAME = "MLO Command Center";

export type Rp = { rpID: string; origin: string };
export type Refusal = { ok: false; error: string; reason: string };

const iso = (ms: number) => new Date(ms).toISOString();
const refuse = (reason: string, error: string = FACE_ID_ERRORS.generic): Refusal => ({ ok: false, error, reason });
const challengeHash = (kind: "reg" | "auth", browser: string, challenge: string) => sha256(`pk:${kind}:${browser}:${challenge}`);
export const newBrowserBinding = () => randomBytes(32).toString("base64url");
const validBinding = (b: string | null | undefined): b is string => !!b && b.length >= 20 && b.length <= 100;

/**
 * The relying party for this request: the host the browser asked (no port) and its exact origin.
 * Null for a missing or odd host.
 */
export function rpFrom(h: { get(name: string): string | null }): Rp | null {
  const host = (h.get("host") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host) || host.length > 253) return null;
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  if (proto !== "https" && proto !== "http") return null;
  const rpID = host.replace(/:\d+$/, "");
  // WebAuthn needs https, except on localhost (local QA).
  if (proto === "http" && rpID !== "localhost") return null;
  return { rpID, origin: `${proto}://${host}` };
}

/** The challenge inside the browser's clientDataJSON, or null. */
export function clientChallenge(clientDataJSON: unknown): string | null {
  if (typeof clientDataJSON !== "string" || clientDataJSON.length > 4000) return null;
  try {
    const c = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof c.challenge === "string" && c.challenge.length >= 16 && c.challenge.length <= 200 ? c.challenge : null;
  } catch {
    return null;
  }
}

const b64 = (v: unknown, max = 8000): v is string => typeof v === "string" && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(v);

/** A registration answer of the right shape, or null. */
export function asRegistration(v: unknown): RegistrationResponseJSON | null {
  const r = v as RegistrationResponseJSON | null;
  if (!r || typeof r !== "object" || r.type !== "public-key" || !b64(r.id, 1400) || !b64(r.rawId, 1400)) return null;
  if (!r.response || !b64(r.response.clientDataJSON) || !b64(r.response.attestationObject, 16000)) return null;
  return r;
}

/** A sign-in answer of the right shape, or null. */
export function asAuthentication(v: unknown): AuthenticationResponseJSON | null {
  const r = v as AuthenticationResponseJSON | null;
  if (!r || typeof r !== "object" || r.type !== "public-key" || !b64(r.id, 1400) || !b64(r.rawId, 1400)) return null;
  const x = r.response;
  if (!x || !b64(x.clientDataJSON) || !b64(x.authenticatorData) || !b64(x.signature, 2000)) return null;
  if (x.userHandle !== undefined && x.userHandle !== null && !b64(x.userHandle, 200)) return null;
  return r;
}

/** A plain name for the device from its browser's User-Agent ("iPhone", "Mac", "Windows PC"). */
export function deviceNameFrom(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (/iPhone/.test(s)) return "iPhone";
  if (/iPad/.test(s)) return "iPad";
  if (/Android/.test(s)) return /Mobile/.test(s) ? "Android phone" : "Android tablet";
  if (/CrOS/.test(s)) return "Chromebook";
  // An iPad asking for the desktop site says "Macintosh" too.
  if (/Macintosh|Mac OS X/.test(s)) return "Mac";
  if (/Windows/.test(s)) return "Windows PC";
  if (/Linux/.test(s)) return "Linux computer";
  return "This device";
}

/** "iPhone · added Nov 26, 2026 · last used Nov 26, 2026" */
export function passkeyLabel(p: Pick<PasskeyRecord, "deviceName" | "createdAt" | "lastUsedAt">): string {
  const day = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return [p.deviceName, `added ${day(p.createdAt)}`, p.lastUsedAt ? `last used ${day(p.lastUsedAt)}` : null].filter(Boolean).join(" · ");
}

// ---- Turning it on (a signed-in person) ----

/** The options for navigator.credentials.create(), bound to this person and this browser for 5 minutes. */
export async function beginRegistration(user: User, rp: Rp, browser: string, now = Date.now()): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | Refusal> {
  if (user.status !== "active") return refuse("inactive");
  if (!validBinding(browser)) return refuse("binding");
  if ((await incr(`cc:pk:reg:${user.id}:${Math.floor(now / 3_600_000)}`, 4000)) > PASSKEY_LIMITS.register) return refuse("rate", FACE_ID_ERRORS.tooMany);
  const store = accountStore();
  const mine = await store.listPasskeys(user.id);
  if (mine.length >= MAX_PASSKEYS) return refuse("max", FACE_ID_ERRORS.tooManyDevices);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.name,
    // The user handle is our opaque account id (no email or name inside it).
    userID: new TextEncoder().encode(user.id),
    timeout: 120_000,
    attestationType: "none",
    excludeCredentials: mine.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
  });
  await store.putLoginToken(challengeHash("reg", browser, options.challenge), user.id, iso(now + CHALLENGE_TTL_MS));
  return { ok: true, options };
}

/** Checks the device's answer and saves its public key. */
export async function finishRegistration(user: User, rp: Rp, browser: string | null | undefined, body: unknown, deviceName: string, now = Date.now()): Promise<{ ok: true; passkey: PasskeyRecord } | Refusal> {
  const resp = asRegistration(body);
  if (!resp) return refuse("shape");
  if (!validBinding(browser)) return refuse("binding", FACE_ID_ERRORS.expired);
  const challenge = clientChallenge(resp.response.clientDataJSON);
  if (!challenge) return refuse("shape");
  const store = accountStore();
  // One use: the challenge is spent whatever happens next.
  const owner = await store.consumeLoginToken(challengeHash("reg", browser, challenge), iso(now));
  if (!owner || owner !== user.id || user.status !== "active") return refuse("challenge", FACE_ID_ERRORS.expired);
  if (resp.authenticatorAttachment === "cross-platform") return refuse("attachment", FACE_ID_ERRORS.notThisDevice);
  let info;
  try {
    const v = await verifyRegistrationResponse({ response: resp, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true });
    if (!v.verified || !v.registrationInfo) return refuse("unverified");
    info = v.registrationInfo;
  } catch {
    return refuse("verify");
  }
  if (!info.userVerified) return refuse("uv");
  if (await store.passkeyByCredential(info.credential.id)) return refuse("duplicate", FACE_ID_ERRORS.already);
  if ((await store.listPasskeys(user.id)).length >= MAX_PASSKEYS) return refuse("max", FACE_ID_ERRORS.tooManyDevices);
  const passkey: PasskeyRecord = {
    id: `pk_${randomBytes(12).toString("base64url")}`,
    credentialId: info.credential.id,
    userId: user.id,
    publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
    counter: info.credential.counter,
    transports: (info.credential.transports ?? resp.response.transports ?? []).filter((t): t is string => typeof t === "string").slice(0, 8),
    deviceName: deviceName.slice(0, 40) || "This device",
    backedUp: !!info.credentialBackedUp,
    createdAt: iso(now),
    lastUsedAt: null,
  };
  await store.putPasskey(passkey);
  await store.audit({ at: iso(now), actor: user.email, action: "passkey.add", detail: { passkey: passkey.id, devices: (await store.listPasskeys(user.id)).length } });
  return { ok: true, passkey };
}

// ---- Signing in (nobody signed in yet) ----

/** The options for navigator.credentials.get(): no email needed (the device offers its own passkey). */
export async function beginPasskeySignIn(rp: Rp, browser: string, ipHash: string, now = Date.now()): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | Refusal> {
  if (!validBinding(browser)) return refuse("binding");
  if ((await incr(`cc:pk:opt:${ipHash}:${Math.floor(now / 3_600_000)}`, 4000)) > PASSKEY_LIMITS.signinOptions) return refuse("rate", FACE_ID_ERRORS.tooMany);
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required", timeout: 120_000, allowCredentials: [] });
  await accountStore().putLoginToken(challengeHash("auth", browser, options.challenge), AUTH_MARK, iso(now + CHALLENGE_TTL_MS));
  return { ok: true, options };
}

/** Checks a Face ID sign-in. On success the caller opens a session (the whole sign-in is done). */
export async function finishPasskeySignIn(rp: Rp, browser: string | null | undefined, body: unknown, ipHash: string, now = Date.now()): Promise<{ ok: true; user: User; passkey: PasskeyRecord } | Refusal> {
  if ((await incr(`cc:pk:try:${ipHash}:${Math.floor(now / 3_600_000)}`, 4000)) > PASSKEY_LIMITS.signin) return refuse("rate", FACE_ID_ERRORS.tooMany);
  const resp = asAuthentication(body);
  if (!resp) return refuse("shape");
  if (!validBinding(browser)) return refuse("binding", FACE_ID_ERRORS.expired);
  const challenge = clientChallenge(resp.response.clientDataJSON);
  if (!challenge) return refuse("shape");
  const store = accountStore();
  const mark = await store.consumeLoginToken(challengeHash("auth", browser, challenge), iso(now));
  if (mark !== AUTH_MARK) return refuse("challenge", FACE_ID_ERRORS.expired);
  const passkey = await store.passkeyByCredential(resp.id);
  if (!passkey) return refuse("unknown", FACE_ID_ERRORS.unknown);
  const user = await store.userById(passkey.userId);
  if (!user || user.status !== "active") return refuse("inactive", FACE_ID_ERRORS.unknown);
  // The device says whose passkey it is; it must be the account we saved it for.
  if (resp.response.userHandle && Buffer.from(resp.response.userHandle, "base64url").toString("utf8") !== user.id) return refuse("handle");
  let info;
  try {
    const v = await verifyAuthenticationResponse({
      response: resp,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: { id: passkey.credentialId, publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")), counter: passkey.counter, transports: passkey.transports },
      requireUserVerification: true,
    });
    if (!v.verified) return refuse("unverified");
    info = v.authenticationInfo;
  } catch {
    // The library also refuses a counter that went backwards here.
    return refuse("verify");
  }
  if (!info.userVerified) return refuse("uv");
  // A counter that didn't go up (when either side counts) means a copied key: refuse and note it.
  if ((info.newCounter > 0 || passkey.counter > 0) && info.newCounter <= passkey.counter) {
    await store.audit({ at: iso(now), actor: user.email, action: "passkey.counter_refused", detail: { passkey: passkey.id } });
    return refuse("counter");
  }
  await store.touchPasskey(passkey.id, info.newCounter, iso(now));
  await store.audit({ at: iso(now), actor: user.email, action: "passkey.signin", detail: { passkey: passkey.id } });
  return { ok: true, user, passkey: { ...passkey, counter: info.newCounter, lastUsedAt: iso(now) } };
}

// ---- Managing devices ----

export const listPasskeysFor = (user: User) => accountStore().listPasskeys(user.id);

/** Removes one of your own Face ID devices. */
export async function removePasskey(user: User, id: string, now = Date.now()): Promise<boolean> {
  if (!id || id.length > 60) return false;
  const gone = await accountStore().deletePasskey(user.id, id);
  if (gone) await accountStore().audit({ at: iso(now), actor: user.email, action: "passkey.remove", detail: { passkey: id } });
  return gone;
}

/** An owner's reset or a disabled account: every Face ID device of that person goes. */
export async function removeAllPasskeys(actor: string, userId: string, now = Date.now()): Promise<number> {
  const n = await accountStore().deletePasskeysFor(userId);
  if (n) await accountStore().audit({ at: iso(now), actor, action: "passkey.remove_all", detail: { userId, n } });
  return n;
}
