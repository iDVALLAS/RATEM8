/**
 * lib/quotes/email.ts — transactional email through Resend (v37, L4).
 *
 * Same env as /api/chat-question: RESEND_API_KEY and LOANM8_FROM_EMAIL.
 * Not configured → { ok: false } and nothing pretends it was sent.
 * Bodies are never logged.
 */
export type SendResult = { ok: boolean; detail: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.LOANM8_FROM_EMAIL);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; fromName?: string }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LOANM8_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, detail: "email not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${msg.fromName ?? "LoanM8"} <${from}>`, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    return r.ok ? { ok: true, detail: "sent" } : { ok: false, detail: `resend ${r.status}` };
  } catch {
    return { ok: false, detail: "resend request failed" };
  }
}
