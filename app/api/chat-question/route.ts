import { NextResponse } from "next/server";
import { containsSensitive } from "@/lib/prep/machine";

/**
 * POST /api/chat-question
 *
 * Captures a borrower question from the scripted /chat demo's input bar
 * and forwards it to the loan officer via Resend.
 *
 * Body: { question: string, email: string | null }
 *
 * Env required (server only):
 *   RESEND_API_KEY          — from resend.com
 *   MLO_NOTIFICATION_EMAIL  — where the question goes
 *   LOANM8_FROM_EMAIL       — a verified sending address
 *
 * v21: restored from main (dropped by the one-shot rebuild), with three
 * fixes:
 *  - Nothing the borrower typed (question, email, IP) is ever logged.
 *    The v7 route logged all of it when Resend wasn't configured.
 *  - Not configured → 503, so the UI never says "Sent" when nothing was
 *    sent (v7 returned ok and the UI said it was sent).
 *  - The old name-bearing notification env var is replaced by
 *    MLO_NOTIFICATION_EMAIL, and there is no fallback sending address.
 * Sensitive numbers (SSN, DOB, account numbers) are refused, using the
 * same screen as the prep flow.
 */

type Body = {
  question?: unknown;
  email?: unknown;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const email = typeof body.email === "string" && body.email.trim().length > 0 ? body.email.trim() : null;

  if (!question || question.length < 2 || question.length > 4000) {
    return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
  }
  if (email && (email.length > 254 || !EMAIL.test(email))) {
    return NextResponse.json({ ok: false, error: "check the email address" }, { status: 400 });
  }
  if (containsSensitive(question)) {
    return NextResponse.json(
      { ok: false, error: "That looks like it includes a Social Security number, a date of birth, or an account number. M8 never needs those. Please rephrase." },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.MLO_NOTIFICATION_EMAIL;
  const fromEmail = process.env.LOANM8_FROM_EMAIL;
  if (!apiKey || !toEmail || !fromEmail) {
    console.warn("[chat-question] email delivery is not configured; nothing was sent.");
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }

  const subject = `[M8 Demo] New borrower question${email ? " (reply-to included)" : ""}`;
  const text = [
    "New question from the M8 demo chat:",
    "",
    "QUESTION:",
    question,
    "",
    `EMAIL: ${email || "(not provided)"}`,
    `TIMESTAMP: ${new Date().toISOString()}`,
    "",
    "— Sent by the LoanM8 /chat demo",
  ].join("\n");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `M8 Demo <${fromEmail}>`, to: [toEmail], reply_to: email || undefined, subject, text }),
    });
    if (!resp.ok) {
      console.error("[chat-question] Resend error", resp.status);
      return NextResponse.json({ ok: false, error: "send failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[chat-question] Resend request failed");
    return NextResponse.json({ ok: false, error: "send failed" }, { status: 502 });
  }
}
