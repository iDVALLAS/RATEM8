import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { canSee } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { redactChatInput } from "@/lib/m8/redact";
import { isOptOut } from "@/lib/messaging/twilio";
import { recordInbound } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";

/**
 * POST /api/cc/dev-inbound — LOCAL TESTING ONLY (D79). A pretend text from
 * one of the signed-in loan officer's own contacts, so the QA scripts can
 * see a reply land in the Inbox without a carrier. It takes the same path a
 * real reply does after the signature check (recordInbound: stale drafts,
 * STOP, campaigns). Off unless CC_DEV_LOGIN="1", and never on Vercel (the
 * same guard as /api/cc/dev-login). Body: { contactId, body }.
 */
export async function POST(req: Request) {
  if (process.env.CC_DEV_LOGIN !== "1" || process.env.VERCEL) return new NextResponse("Not found", { status: 404 });
  const user = await currentUser().catch(() => null);
  if (!user) return new NextResponse("Sign in", { status: 401 });
  const raw = (await req.json().catch(() => null)) as { contactId?: unknown; body?: unknown } | null;
  const c = await contactStore().get(String(raw?.contactId ?? ""));
  if (!c || !canSee(user, c) || !c.phone) return new NextResponse("No such contact", { status: 404 });
  const body = redactChatInput(String(raw?.body ?? "")).text.slice(0, 2000);
  if (!body.trim()) return new NextResponse("Empty", { status: 400 });
  const out = isOptOut(body);
  const sender = "dev:qa";
  if (out) await touchStore().optOut(c.phone, sender, new Date().toISOString(), "text reply");
  await recordInbound(c, c.phone, sender, body, out);
  return NextResponse.json({ ok: true, optedOut: out });
}
