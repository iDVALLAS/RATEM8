/**
 * lib/contacts/bulk-consent.ts — record the permission a loan officer
 * already holds for their past clients, in one step (D12.2). SERVER-ONLY.
 *
 * Owner, 2026-11-19: "i have permission" (for texts and M8 calls to past
 * clients). Many loan applications carry a signed consent to calls and
 * texts; this puts that permission on file so the send gate can see it,
 * with where the proof lives.
 *
 * Guardrails:
 *  - only the loan officer's own past clients
 *  - never contacts on hold, or from a previous employer's system
 *    (permission given to another company doesn't carry over)
 *  - never anyone who said stop: a revocation always wins
 *  - the loan officer confirms each point that makes the permission valid,
 *    and every entry names where the proof is
 *  - AI-voice calls need permission that covers an artificial or AI voice,
 *    confirmed separately
 *  - each entry is in the consent log and the audit log, so it can be
 *    reviewed or undone
 *  - D93: from an import's "Record permission for this import" (or people
 *    picked on Contacts), only those people are covered
 */
import { accountStore, type User } from "@/lib/accounts/store";
import { contactStore, listAll, type Contact, type Evidence, type Purpose } from "./store";
import { summarize } from "./service";

export type BulkConsentInput = {
  /** "text" and/or "ai_call". */
  channels: ("text" | "ai_call")[];
  purposes: Purpose[];
  evidence: Extract<Evidence, "written" | "web_form">;
  /** Where the signed permission lives (for example, "TCPA consent in our application, signed at application, copies in ARIVE"). */
  proof: string;
  /** The loan officer confirms each of these. */
  confirms: { namesUs: boolean; canProduce: boolean; coversAiVoice: boolean };
  /** Only clients whose loan closed in or after this year (optional). */
  sinceYear?: number | null;
  /** D93: only these people (an import's, or the ones picked on Contacts). */
  onlyIds?: ReadonlySet<string> | null;
};

export type BulkPreview = { eligible: Contact[]; skipped: { stopped: number; held: number; priorEmployer: number; notPastClient: number } };

export async function previewBulk(actor: User, sinceYear: number | null = null, onlyIds?: ReadonlySet<string> | null): Promise<BulkPreview> {
  const { contacts: all } = await listAll({ ownerUserId: actor.id, kind: "contact" });
  const contacts = onlyIds ? all.filter((c) => onlyIds.has(c.id)) : all;
  const consents = await contactStore().consentsFor(contacts.map((c) => c.id));
  const out: BulkPreview = { eligible: [], skipped: { stopped: 0, held: 0, priorEmployer: 0, notPastClient: 0 } };
  for (const c of contacts) {
    if (c.ownerUserId !== actor.id) continue;
    if (c.relationship !== "past_client") {
      out.skipped.notPastClient++;
      continue;
    }
    if (sinceYear && !(c.loan?.closedOn && Number(c.loan.closedOn.slice(0, 4)) >= sinceYear)) continue;
    if (c.locked) {
      out.skipped.held++;
      continue;
    }
    if (c.provenance === "prior_employer") {
      out.skipped.priorEmployer++;
      continue;
    }
    const s = summarize(consents.filter((e) => e.contactId === c.id));
    if (Object.values(s).some((p) => p.service.evidence === "revoked" || p.marketing.evidence === "revoked")) {
      out.skipped.stopped++;
      continue;
    }
    out.eligible.push(c);
  }
  return out;
}

export async function recordBulkConsent(actor: User, input: BulkConsentInput, now = new Date()): Promise<{ ok: true; people: number; entries: number } | { ok: false; error: string }> {
  if (actor.role === "assistant") return { ok: false, error: "Only the loan officer can record permission for their clients." };
  const channels = [...new Set(input.channels)].filter((c) => c === "text" || c === "ai_call");
  const purposes = [...new Set(input.purposes)].filter((p) => p === "service" || p === "marketing");
  const proof = input.proof.trim();
  if (!channels.length || !purposes.length) return { ok: false, error: "Pick what the permission covers." };
  if (input.evidence !== "written" && input.evidence !== "web_form") return { ok: false, error: "Pick how they gave it." };
  if (proof.length < 12) return { ok: false, error: "Say where the signed permission is (the form, and where copies are kept)." };
  if (!input.confirms.namesUs || !input.confirms.canProduce) return { ok: false, error: "Confirm both points before recording." };
  if (channels.includes("ai_call") && !input.confirms.coversAiVoice) return { ok: false, error: "For M8 calls, confirm the permission covers calls with an artificial or AI voice." };
  const { eligible } = await previewBulk(actor, input.sinceYear ?? null, input.onlyIds ?? null);
  const at = now.toISOString();
  const store = contactStore();
  const stamp = `${proof.slice(0, 400)} (recorded for past clients by ${actor.email}, ${at.slice(0, 10)})`;
  let entries = 0;
  for (const c of eligible) for (const channel of channels) for (const purpose of purposes) {
    await store.addConsent({ contactId: c.id, channel, purpose, granted: true, evidence: input.evidence, proof: stamp, at, actor: actor.email });
    entries++;
  }
  await accountStore().audit({ at, actor: actor.email, action: "consent.bulk_grant", detail: { people: eligible.length, entries, channels: channels.join(","), purposes: purposes.join(","), evidence: input.evidence, aiVoice: channels.includes("ai_call"), sinceYear: input.sinceYear ?? null, ...(input.onlyIds ? { scoped: input.onlyIds.size } : {}), proof: proof.slice(0, 200) } });
  return { ok: true, people: eligible.length, entries };
}
