import { cookies, headers } from "next/headers";
import { CONFIG } from "@/lib/config";
import { decodeRoute, ROUTE_HEADER } from "@/lib/routing";
import { nameableMlo } from "@/lib/mlo-match";
import { emailConfig, m8Model } from "@/lib/m8/server";
import { hashIp } from "@/lib/m8/limits";
import { incr } from "@/lib/m8/kv";
import { decodeLoanEstimate, isLeType } from "@/lib/second-look/decode";
import { SECOND_LOOK_DISCLAIMER } from "@/lib/second-look/schema";

/**
 * POST /api/m8-loan-estimate — the "Upload your Loan Estimate" box in M8
 * chat (C20; owner 2026-11-16: "both" — M8 explains it and the loan officer
 * gets a copy).
 *
 * multipart/form-data with `file`: a PDF, PNG, JPG or WebP up to 4 MB.
 * In parallel:
 *  1. M8 reads it (lib/second-look/decode.ts: Second Look's explain-only
 *     prompt and schema; the document is data, never instructions).
 *  2. The file is emailed to the loan officer through Resend as an
 *     attachment, with the borrower's state and chat session.
 * The file is never stored on LoanM8 and nothing about its content is
 * logged. Needs SECOND_LOOK_LIVE=true and ANTHROPIC_API_KEY (503 without).
 * 4 per hour and 10 per day per hashed IP.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const SESSION_COOKIE = "lm8_chat_sid";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ ...body, disclaimer: SECOND_LOOK_DISCLAIMER }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.SECOND_LOOK_LIVE !== "true" || !apiKey) return json(503, { ok: false, error: "Loan Estimate reading isn't turned on yet." });
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES + 64 * 1024) return json(413, { ok: false, error: "That file is over 4 MB. Try a PDF or a smaller photo." });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const h = await hashIp(ip);
  const [perHour, perDay] = await Promise.all([
    incr(`m8:le:${h}:${Math.floor(Date.now() / 3_600_000)}`, 4000),
    incr(`m8:le:d:${h}:${new Date().toISOString().slice(0, 10)}`, 90_000),
  ]);
  if (perHour > 4 || perDay > 10) return json(429, { ok: false, error: "That's a few uploads already. Try again later." });

  let file: File | null = null;
  try {
    const f = (await req.formData()).get("file");
    file = f instanceof File ? f : null;
  } catch {
    return json(400, { ok: false, error: "Couldn't read the upload. Try again." });
  }
  if (!file || file.size === 0) return json(400, { ok: false, error: "Choose your Loan Estimate file first." });
  if (file.size > MAX_BYTES) return json(413, { ok: false, error: "That file is over 4 MB. Try a PDF or a smaller photo." });
  const type = file.type;
  if (!isLeType(type)) return json(400, { ok: false, error: "Upload a PDF or a photo (PNG, JPG or WebP)." });
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const route = CONFIG.pricing.mloRouting ? decodeRoute((await headers()).get(ROUTE_HEADER)) : null;
  const mlo = route ? nameableMlo(route) : null;
  const state = route?.stateCode ?? null;
  const sid = (await cookies()).get(SESSION_COOKIE)?.value ?? "no-chat-session";

  const emailCopy = async (): Promise<boolean> => {
    const cfg = emailConfig();
    if (!cfg) return false;
    try {
      const ext = type === "application/pdf" ? "pdf" : type.split("/")[1];
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `M8 <${cfg.from}>`,
          to: [cfg.to],
          subject: `Loan Estimate uploaded in M8 chat${mlo ? ` for ${mlo.name}` : ""}${state ? `, ${state}` : ""}`,
          text: `A borrower uploaded their Loan Estimate in M8 chat. It's attached; LoanM8 didn't store it.\n\nState: ${state ?? "unknown"}\nChat session: ${sid}\n\nM8 explained it in the chat without comparing pricing. If they want you to price against it, they can use the call box in the chat.`,
          attachments: [{ filename: `loan-estimate.${ext}`, content: base64 }],
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const [read, emailed] = await Promise.all([decodeLoanEstimate({ base64, type }, { apiKey, model: m8Model() }), emailCopy()]);
  console.log("[m8-loan-estimate]", { bytes: file.size, type, ok: read.ok, emailed });
  if (!read.ok) return json(502, { ok: false, error: read.message, emailed });
  return json(200, { ok: true, result: read.result, emailed });
}
