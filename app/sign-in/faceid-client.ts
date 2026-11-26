/**
 * app/sign-in/faceid-client.ts — the browser half of Face ID (D94). Client only.
 * The ceremony itself is @simplewebauthn/browser; the server half is
 * lib/accounts/passkeys.ts behind /api/cc/passkey/<step>.
 */
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { FACE_ID_ERRORS } from "@/lib/content/face-id";

/** True only where this device has Face ID, a fingerprint reader or Windows Hello the browser can use. */
export async function faceIdAvailable(): Promise<boolean> {
  try {
    return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable());
  } catch {
    return false;
  }
}

export const autofillAvailable = () => browserSupportsWebAuthnAutofill().catch(() => false);

type Answer = { ok: true; options?: unknown; next?: string } | { ok: false; error: string };

async function post(step: string, body: unknown = {}): Promise<Answer> {
  try {
    const r = await fetch(`/api/cc/passkey/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", cache: "no-store" });
    const j = (await r.json().catch(() => null)) as Answer | null;
    return j && typeof j.ok === "boolean" ? j : { ok: false, error: FACE_ID_ERRORS.generic };
  } catch {
    return { ok: false, error: FACE_ID_ERRORS.network };
  }
}

/** Why the device's own prompt ended without an answer, in calm words. `quiet`: ended at once, before any prompt showed. */
function ceremonyError(e: unknown, startedAt: number): { error: string; quiet: boolean } {
  const quiet = performance.now() - startedAt < 400;
  if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return { error: FACE_ID_ERRORS.already, quiet: false };
  return { error: FACE_ID_ERRORS.cancelled, quiet };
}

export type Outcome = { ok: true; next?: string } | { ok: false; error: string; quiet?: boolean; aborted?: boolean };

/** Turns on Face ID for the signed-in person on this device. */
export async function addFaceId(): Promise<Outcome> {
  const o = await post("register-options");
  if (!o.ok || !o.options) return o.ok ? { ok: false, error: FACE_ID_ERRORS.generic } : o;
  const t0 = performance.now();
  let response;
  try {
    response = await startRegistration({ optionsJSON: o.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
  } catch (e) {
    return { ok: false, ...ceremonyError(e, t0) };
  }
  const r = await post("register", { response });
  return r.ok ? { ok: true } : r;
}

/**
 * Signs in with Face ID: the device offers its own passkey (no email). With `autofill`, it waits quietly for the
 * person to pick a passkey from the email box's suggestions instead (conditional UI), until another request aborts it.
 */
export async function signInWithFaceId(remember: () => boolean, autofill = false): Promise<Outcome> {
  const o = await post("signin-options");
  if (!o.ok || !o.options) return o.ok ? { ok: false, error: FACE_ID_ERRORS.generic } : o;
  const t0 = performance.now();
  let response;
  try {
    response = await startAuthentication({ optionsJSON: o.options as Parameters<typeof startAuthentication>[0]["optionsJSON"], useBrowserAutofill: autofill });
  } catch (e) {
    const aborted = e instanceof WebAuthnError ? e.code === "ERROR_CEREMONY_ABORTED" : e instanceof Error && e.name === "AbortError";
    return { ok: false, aborted, ...ceremonyError(e, t0) };
  }
  const r = await post("signin", { response, remember: remember() });
  return r.ok ? { ok: true, next: r.next } : r;
}
