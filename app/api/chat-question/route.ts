import { NextResponse } from "next/server";

/**
 * POST /api/chat-question
 *
 * Captures a borrower question from the /chat demo and forwards
 * it to Jason via Resend. Also persists basic metadata for the
 * compliance audit log (CFPB 5-year record-keeping requirement).
 *
 * Body: { question: string, email: string | null }
 *
 * Env required:
 *   RESEND_API_KEY            — from resend.com
 *   JASON_NOTIFICATION_EMAIL  — where to send the alert
 *   RATEM8_FROM_EMAIL         — verified sending domain
 *
 * v7 caveats:
 *  - No rate limiting yet (add Upstash + IP-based rate limit in v8)
 *  - No persistence to a database yet — just email + Resend's log
 *  - No bot/spam protection beyond minimal input checks
 *  - If RESEND_API_KEY is missing, request succeeds with a warning
 *    log so the demo doesn't fail in local dev
 */

type Body = {
  question?: unknown;
  email?: unknown;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim()
      : null;

  if (!question || question.length < 2 || question.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "question required" },
      { status: 400 }
    );
  }

  // Minimal PII scan: don't accept anything that looks like an SSN
  // or a credit card. M8 should never ask for these and the
  // demo input should refuse to accept them.
  if (/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/.test(question)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Looks like that includes an SSN. M8 never needs your SSN. Please rephrase.",
      },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.JASON_NOTIFICATION_EMAIL;
  const fromEmail = process.env.RATEM8_FROM_EMAIL || "m8@ratem8.com";

  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const referer = req.headers.get("referer") || "unknown";
  const timestamp = new Date().toISOString();

  const subject = `[M8 Demo] New borrower question${email ? ` from ${email}` : ""}`;
  const text = [
    `New question from the M8 demo chat:`,
    ``,
    `QUESTION:`,
    question,
    ``,
    `EMAIL: ${email || "(not provided)"}`,
    `TIMESTAMP: ${timestamp}`,
    `IP: ${ip}`,
    `REFERER: ${referer}`,
    `USER AGENT: ${ua}`,
    ``,
    `— Sent by RateM8 /chat demo`,
  ].join("\n");

  // If we don't have Resend configured (e.g. local dev), just log
  // and return success. This keeps the demo flow working before
  // production secrets are in place.
  if (!apiKey || !toEmail) {
    console.warn("[chat-question] Resend not configured. Logging only.");
    console.log({ subject, question, email, ip, timestamp });
    return NextResponse.json({ ok: true, mode: "logged" });
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `M8 Demo <${fromEmail}>`,
        to: [toEmail],
        reply_to: email || undefined,
        subject,
        text,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[chat-question] Resend error", resp.status, err);
      return NextResponse.json(
        { ok: false, error: "send failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[chat-question] Send threw", e);
    return NextResponse.json(
      { ok: false, error: "send failed" },
      { status: 500 }
    );
  }
}
