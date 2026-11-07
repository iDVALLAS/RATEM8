/**
 * lib/m8/alerts.ts — alerts to the owner by email through Resend (C4).
 * Needs RESEND_API_KEY, LOANM8_FROM_EMAIL and M8_ALERT_EMAIL (or
 * MLO_NOTIFICATION_EMAIL). Without them the alert goes to the server log
 * only. Alerts never contain chat text.
 */
import { alertEmail, emailConfig } from "./server";
import { report } from "@/lib/monitoring";

export async function sendAlert(subject: string, body: string): Promise<void> {
  const cfg = emailConfig();
  const to = alertEmail();
  console.error(`[m8-alert] ${subject}`);
  await report("warning", new Error(subject), { route: "m8-chat", stage: "budget" });
  if (!cfg || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `LoanM8 alerts <${cfg.from}>`, to: [to], subject: `[LoanM8] ${subject}`, text: body }),
    });
  } catch {
    // The log line above is the fallback.
  }
}
