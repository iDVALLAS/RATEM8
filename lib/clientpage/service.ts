/**
 * lib/clientpage/service.ts — what a client can see and do on their own
 * page (D26). SERVER-ONLY.
 *
 * From the research spec's "consent passport" and "the client's own view"
 * (§1.2, §4.5). With their private link, a client can:
 *  - see who has their information (their loan officer, the sponsoring
 *    company) and what permission is on file, by channel, with how and when
 *  - stop texts and calls, or email, in one tap. That's a revocation by any
 *    reasonable means (47 CFR 64.1200(a)(10)–(11)); a phone stop goes on the
 *    platform-wide list, so no one on the platform can text or call that
 *    number.
 *  - give permission for texts themselves, with consent wording that names
 *    the company and the loan officer (the web-form proof the gate needs)
 *  - see what their loan officer's Concierge noted from what they said,
 *    and delete any of it
 * The page shows first names, a masked phone and plain words only: no loan
 * amounts, rates or documents.
 */
import { createHash } from "node:crypto";
import { accountStore } from "@/lib/accounts/store";
import { contactStore, type Contact, type Purpose } from "@/lib/contacts/store";
import { summarize, type ConsentSummary } from "@/lib/contacts/service";
import { touchStore } from "@/lib/messaging/store";
import { conciergeStore, type MemoryNote } from "@/lib/concierge/store";
import { mloById, type Mlo } from "@/lib/config";
import { readToken } from "./link";

export type ClientView = { contact: Contact; mlo: Mlo | null; company: string | null; consent: ConsentSummary; notes: MemoryNote[]; phoneStopped: boolean };

export async function loadClient(token: string, now = new Date()): Promise<ClientView | null> {
  const t = readToken(token);
  if (!t) return null;
  const c = await contactStore().get(t.contactId);
  if (!c || (c.linkVersion ?? 0) !== t.version || c.kind !== "contact") return null;
  const owner = await accountStore().userById(c.ownerUserId);
  const mlo = mloById(owner?.mloId ?? null);
  const [log, notes, phoneStopped] = await Promise.all([contactStore().consents(c.id), conciergeStore().memory(c.ownerUserId, c.id, now.toISOString()), c.phone ? touchStore().optedOut(c.phone) : Promise.resolve(false)]);
  return { contact: c, mlo: mlo ?? null, company: mlo?.licenses[0]?.sponsor.name ?? null, consent: summarize(log), notes, phoneStopped };
}

/** The consent wording shown next to the opt-in boxes. Saved, word for word, as the proof. */
export function consentWording(v: Pick<ClientView, "company" | "mlo">, masked: string): string {
  return `I agree that ${v.company ?? "my loan officer's company"} and my loan officer${v.mlo ? `, ${v.mlo.name}` : ""}, may text me at ${masked} about the boxes I checked. Messages may be sent with automated technology. Consent isn't a condition of any loan or service. Message frequency varies; message and data rates may apply. I can reply STOP or use this page to stop at any time.`;
}

export type ClientAction = { ok: true; message: string } | { ok: false; error: string };

/** Stop texts and calls (all phone channels) or email. Never needs anything else from them. */
export async function clientStop(token: string, scope: "phone" | "email", now = new Date()): Promise<ClientAction> {
  const v = await loadClient(token, now);
  if (!v) return { ok: false, error: "This link isn't working anymore. Ask your loan officer for a new one, or reply STOP to any text." };
  const at = now.toISOString();
  const channels = scope === "phone" ? (["call", "ai_call", "text"] as const) : (["email"] as const);
  for (const channel of channels) for (const purpose of ["service", "marketing"] as const) await contactStore().addConsent({ contactId: v.contact.id, channel, purpose, granted: false, evidence: "revoked", proof: "On their own page", at, actor: "client" });
  if (scope === "phone" && v.contact.phone) await touchStore().optOut(v.contact.phone, "client-page", at, "client page");
  for (const p of await conciergeStore().proposals(v.contact.ownerUserId, "pending")) if (p.contactId === v.contact.id) await conciergeStore().putProposal({ ...p, status: "stale" });
  await accountStore().audit({ at, actor: "client", action: "client.stop", detail: { contactId: v.contact.id, scope } });
  return { ok: true, message: scope === "phone" ? "Done. You won't get texts or calls about this from anyone here." : "Done. You won't get email from us." };
}

/** Permission for texts, given on the page with the wording above. */
export async function clientOptIn(token: string, purposes: Purpose[], agreed: boolean, now = new Date()): Promise<ClientAction> {
  const v = await loadClient(token, now);
  if (!v) return { ok: false, error: "This link isn't working anymore. Ask your loan officer for a new one." };
  const ps = [...new Set(purposes)].filter((p) => p === "service" || p === "marketing");
  if (!ps.length) return { ok: false, error: "Check at least one box." };
  if (!agreed) return { ok: false, error: "Check the agreement box to give permission." };
  if (!v.contact.phone) return { ok: false, error: "There's no phone number on file for you. Ask your loan officer to add it." };
  const at = now.toISOString();
  const wording = consentWording(v, `(•••) •••-${v.contact.phone.slice(-4)}`);
  const proof = `Their own page, ${at.slice(0, 16)}Z: "${wording}" (sha256 ${createHash("sha256").update(wording).digest("hex").slice(0, 12)})`;
  for (const purpose of ps) await contactStore().addConsent({ contactId: v.contact.id, channel: "text", purpose, granted: true, evidence: "web_form", proof, at, actor: "client" });
  await touchStore().clear(v.contact.phone, "client-page");
  await accountStore().audit({ at, actor: "client", action: "client.opt_in", detail: { contactId: v.contact.id, purposes: ps.join(",") } });
  const stillStopped = await touchStore().optedOut(v.contact.phone);
  return { ok: true, message: stillStopped ? "Saved. You'd replied STOP to a text earlier, so reply START to that number too." : "Saved. Thank you." };
}

/** Delete one note their loan officer's Concierge kept. */
export async function clientForget(token: string, noteId: string, now = new Date()): Promise<ClientAction> {
  const v = await loadClient(token, now);
  if (!v) return { ok: false, error: "This link isn't working anymore." };
  if (!v.notes.some((n) => n.id === noteId)) return { ok: false, error: "That note is already gone." };
  await conciergeStore().deleteMemory(v.contact.ownerUserId, noteId);
  await accountStore().audit({ at: now.toISOString(), actor: "client", action: "client.forget", detail: { contactId: v.contact.id } });
  return { ok: true, message: "Deleted." };
}

/** The loan officer makes a new link; the old one stops working. */
export async function rotateLink(contact: Contact, now = new Date()): Promise<number> {
  const version = (contact.linkVersion ?? 0) + 1;
  await contactStore().put({ ...contact, linkVersion: version, updatedAt: now.toISOString() });
  return version;
}
