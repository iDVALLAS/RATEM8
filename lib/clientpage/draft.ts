/**
 * lib/clientpage/draft.ts — a text that sends a client their own page link,
 * drafted for the loan officer's approval (D26). SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { contactStore } from "@/lib/contacts/store";
import { gateFor } from "@/lib/messaging/service";
import { conciergeStore } from "@/lib/concierge/store";
import { checkDraft } from "@/lib/concierge/guard";
import { laneFor } from "@/lib/concierge/agent";
import { clientLink } from "./link";

export async function draftClientLink(user: User, contactId: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await contactStore().get(contactId);
  if (!c || c.ownerUserId !== user.id) return { ok: false, error: "No such contact." };
  const link = clientLink(c.id, c.linkVersion ?? 0);
  if (!link) return { ok: false, error: "Client pages aren't turned on yet." };
  const lane = await laneFor(user, c, now);
  if (lane.kind === "skip") return { ok: false, error: `Can't draft: ${lane.why}.` };
  const me = (user.name || "").trim().split(/\s+/)[0] ?? "";
  const d = checkDraft(`${c.firstName ? `Hi ${c.firstName}` : "Hi"}, here's your own page, where you can see and change how I contact you: ${link}${me ? ` -${me}` : ""}`, { names: [c.firstName, c.lastName, me] });
  if (!d.ok) return { ok: false, error: `The text didn't pass the checks: ${d.reason}.` };
  const g = await gateFor(user, c, "text", "service", now);
  await conciergeStore().putProposal({ id: `p_${randomBytes(9).toString("base64url")}`, ownerUserId: user.id, contactId: c.id, kind: "text", purpose: "service", body: d.text, why: "Their own page link", source: "automation", status: "pending", gate: { allowed: g.allowed, reason: g.reasons[0] ?? null }, createdAt: now.toISOString(), decidedAt: null, decidedBy: null });
  return { ok: true };
}
