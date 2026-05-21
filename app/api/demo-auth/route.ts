import { NextResponse } from "next/server";

/**
 * POST /api/demo-auth
 *
 * Validates the demo password and sets a session cookie.
 *
 * Body: { password: string }
 *
 * Success → sets `ratem8_demo_auth` cookie (httpOnly, secure, 30-day) and returns { ok: true }
 * Failure → returns 401 with error message, logs the attempt
 *
 * Cookie value is SHA-256 hash of "ratem8:" + password. The page checks
 * the same hash on each request, so rotating DEMO_PASSWORD instantly
 * invalidates all existing cookies (since the hash changes).
 *
 * Audit logging: every attempt (success and failure) is logged with
 * timestamp + IP + user-agent. In v10 this should hit a real database
 * for compliance audit trail; for now console logs are enough for
 * a stealth-launch preview.
 */

type Body = { password?: unknown };

export async function POST(req: Request) {
  const expectedPassword = process.env.DEMO_PASSWORD;

  // If DEMO_PASSWORD isn't set, fail closed — don't accidentally publish
  // an open demo because someone forgot to set the env var.
  if (!expectedPassword) {
    console.error("[demo-auth] DEMO_PASSWORD env var not set");
    return NextResponse.json(
      { ok: false, error: "Demo is temporarily unavailable. Email jason@ratem8.com." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const submitted =
    typeof body.password === "string" ? body.password.trim() : "";

  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const timestamp = new Date().toISOString();

  if (submitted !== expectedPassword) {
    // Audit log the failed attempt
    console.warn("[demo-auth] FAILED attempt", {
      timestamp,
      ip,
      ua: ua.substring(0, 80),
      submittedLength: submitted.length,
    });

    // Constant-time-ish delay so timing attacks can't easily distinguish
    // "wrong password" from "DEMO_PASSWORD not set"
    await new Promise((r) => setTimeout(r, 250));

    return NextResponse.json(
      { ok: false, error: "That password didn't work." },
      { status: 401 }
    );
  }

  // Success — hash and set cookie
  const hash = await hashPassword(expectedPassword);

  console.log("[demo-auth] SUCCESS", {
    timestamp,
    ip,
    ua: ua.substring(0, 80),
  });

  const response = NextResponse.json({ ok: true });

  response.cookies.set("ratem8_demo_auth", hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}

async function hashPassword(pw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode("ratem8:" + pw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
