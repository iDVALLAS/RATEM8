import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { currentUser, openSession, SESSION_COOKIE, sessionTtl } from "@/lib/accounts/auth";
import {
  beginPasskeySignIn,
  beginRegistration,
  deviceNameFrom,
  finishPasskeySignIn,
  finishRegistration,
  newBrowserBinding,
  PASSKEY_COOKIE,
  CHALLENGE_TTL_MS,
  rpFrom,
  type Refusal,
} from "@/lib/accounts/passkeys";
import { FACE_ID_ERRORS } from "@/lib/content/face-id";
import { hashIp } from "@/lib/m8/limits";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** A refusal: calm words for the page, the reason code (never a key or an id) for the server log. */
const no = (r: Refusal, step: string, status = 400) => {
  console.warn(`[cc-passkey] ${step} refused: ${r.reason}`);
  return json({ ok: false, error: r.error }, status);
};

/**
 * POST /api/cc/passkey/<step> — Face ID (D94), see lib/accounts/passkeys.ts.
 *  register-options, register: a signed-in person turns it on for this device.
 *  signin-options, signin: anyone; a good answer opens a session (12 hours, or 30 days with Remember).
 * Same-origin only: the browser's Origin header must be this site exactly.
 */
export async function POST(req: Request, ctx: { params: Promise<{ step: string }> }) {
  const { step } = await ctx.params;
  const h = await headers();
  const rp = rpFrom(h);
  if (!rp || h.get("origin") !== rp.origin) return no({ ok: false, error: FACE_ID_ERRORS.generic, reason: "origin" }, step, 403);
  const raw = await req.text().catch(() => "");
  if (raw.length > 32_000) return no({ ok: false, error: FACE_ID_ERRORS.generic, reason: "size" }, step, 413);
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return no({ ok: false, error: FACE_ID_ERRORS.generic, reason: "json" }, step);
  }
  const jar = await cookies();
  const secure = rp.origin.startsWith("https:");
  const bindingCookie = { httpOnly: true, secure, sameSite: "strict" as const, path: "/api/cc/passkey", maxAge: Math.floor(CHALLENGE_TTL_MS / 1000) };
  // One binding per browser for 5 minutes; each challenge under it still works once.
  const binding = () => {
    const b = jar.get(PASSKEY_COOKIE)?.value ?? "";
    const v = b.length >= 20 && b.length <= 100 ? b : newBrowserBinding();
    jar.set(PASSKEY_COOKIE, v, bindingCookie);
    return v;
  };
  const ipHash = await hashIp((h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown");
  const now = Date.now();

  if (step === "register-options" || step === "register") {
    const user = await currentUser().catch(() => null);
    if (!user) return no({ ok: false, error: "Sign in first.", reason: "signed-out" }, step, 401);
    if (step === "register-options") {
      const r = await beginRegistration(user, rp, binding(), now);
      return r.ok ? json({ ok: true, options: r.options }) : no(r, step, r.reason === "rate" ? 429 : 400);
    }
    const r = await finishRegistration(user, rp, jar.get(PASSKEY_COOKIE)?.value, body.response, deviceNameFrom(h.get("user-agent")), now);
    if (!r.ok) return no(r, step);
    jar.delete({ name: PASSKEY_COOKIE, path: "/api/cc/passkey" });
    return json({ ok: true });
  }

  if (step === "signin-options") {
    const r = await beginPasskeySignIn(rp, binding(), ipHash, now);
    return r.ok ? json({ ok: true, options: r.options }) : no(r, step, r.reason === "rate" ? 429 : 400);
  }

  if (step === "signin") {
    const r = await finishPasskeySignIn(rp, jar.get(PASSKEY_COOKIE)?.value, body.response, ipHash, now);
    if (!r.ok) return no(r, step, r.reason === "rate" ? 429 : 400);
    jar.delete({ name: PASSKEY_COOKIE, path: "/api/cc/passkey" });
    const remember = body.remember === true;
    jar.set(SESSION_COOKIE, await openSession(r.user, now, remember, { passkey: true }), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(sessionTtl(remember) / 1000) });
    return json({ ok: true, next: "/mlo" });
  }

  return json({ ok: false, error: FACE_ID_ERRORS.generic }, 404);
}
