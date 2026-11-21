"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { DOC_KINDS, MAX_DOC_BYTES, type DocKind } from "@/lib/loa/readers";
import { answerFact, applyPreset, approveLoaDraft as approveDraft, confirmParty, discardDraft, makeDraft, readIntoFile, resolveReview, saveAutonomy, sendDraft, setCheck, setCondition, setLoanAutonomy, setLoanPaused, setParty, setPurpose, setTitleItem, DRAFT_KINDS, type DraftKind } from "@/lib/loa/service";
import { CAP_KEYS, PRESETS, PURPOSES, type Preset, type Purpose } from "@/lib/loa/autonomy";
import { loaQueueWords, loaSwitches, type FactKey } from "@/lib/content/loa";
import { addOverlay, removeOverlay } from "@/lib/loa/chat";
import { CHECKS, PARTY_ROLES, type CheckKey, type Condition, type PartyRole, type TitleItem } from "@/lib/loa/store";

const go = (path: string, ok: boolean, lines: string[]): never => {
  const [p, hash] = path.split("#");
  redirect(`${p}${p.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}${hash ? `#${hash}` : ""}`);
};
const me = async () => (await currentUser()) ?? redirect("/sign-in");
const back = (loanId: string) => `/mlo/pipeline/${encodeURIComponent(loanId)}#loa`;

async function fileBytes(fd: FormData, field: string): Promise<Uint8Array | null> {
  const f = fd.get(field);
  if (!(f instanceof Blob) || f.size === 0) return null;
  if (f.size > MAX_DOC_BYTES) return new Uint8Array(MAX_DOC_BYTES + 1);
  if (f.type && f.type !== "application/pdf") return null;
  return new Uint8Array(await f.arrayBuffer());
}

/** D62: drop a document on the loan; the LOA reads it into the file. */
export async function readDocAction(loanId: string, fd: FormData): Promise<void> {
  const u = await me();
  const kind = String(fd.get("kind") ?? "") as DocKind;
  if (!(DOC_KINDS as readonly string[]).includes(kind)) return go(back(loanId), false, ["Pick what kind of document it is."]);
  const r = await readIntoFile(u, loanId, kind, { pdf: await fileBytes(fd, "doc"), text: String(fd.get("text") ?? "") });
  go(back(loanId), r.ok, [r.ok ? r.summary : r.error]);
}

export async function checkAction(loanId: string, key: CheckKey, done: boolean): Promise<void> {
  const ok = CHECKS.some((c) => c.key === key) && (await setCheck(await me(), loanId, key, done));
  go(back(loanId), ok, [ok ? "Updated." : "Couldn't change that."]);
}

export async function partyAction(loanId: string, fd: FormData): Promise<void> {
  const role = String(fd.get("role") ?? "") as PartyRole;
  if (!(PARTY_ROLES as readonly string[]).includes(role)) return go(back(loanId), false, ["Pick who they are."]);
  const r = await setParty(await me(), loanId, { role, company: String(fd.get("company") ?? ""), name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), phone: String(fd.get("phone") ?? "") });
  go(back(loanId), r.ok, [r.ok ? "Saved." : r.error]);
}

export async function titleItemAction(loanId: string, itemId: string, status: TitleItem["status"]): Promise<void> {
  const ok = await setTitleItem(await me(), loanId, itemId, status);
  go(back(loanId), ok, [ok ? "Updated." : "Couldn't change that."]);
}

export async function conditionAction(loanId: string, condId: string, status: Condition["status"]): Promise<void> {
  const ok = await setCondition(await me(), loanId, condId, status);
  go(back(loanId), ok, [ok ? "Updated." : "Couldn't change that."]);
}

export async function makeDraftAction(loanId: string, kind: DraftKind): Promise<void> {
  if (!DRAFT_KINDS.includes(kind)) return go(back(loanId), false, ["Pick a draft."]);
  const r = await makeDraft(await me(), loanId, kind);
  go(`${back(loanId).split("#")[0]}#drafts`, r.ok, [r.ok ? "Drafted. Check it, add the address if it's missing, and send." : r.error]);
}

export async function sendDraftAction(loanId: string, draftId: string, fd: FormData): Promise<void> {
  const r = await sendDraft(await me(), loanId, draftId, { to: String(fd.get("to") ?? ""), subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? "") });
  go(`${back(loanId).split("#")[0]}#drafts`, r.ok, [r.ok ? `Sent, from ${r.via}.` : r.error]);
}

export async function discardDraftAction(loanId: string, draftId: string): Promise<void> {
  const ok = await discardDraft(await me(), loanId, draftId);
  go(`${back(loanId).split("#")[0]}#drafts`, ok, [ok ? "Set aside." : "Couldn't change that."]);
}

/** The overlay library on Your LOA. */
export async function addOverlayAction(fd: FormData): Promise<void> {
  const u = await me();
  const r = await addOverlay(u, { lender: String(fd.get("lender") ?? ""), title: String(fd.get("title") ?? ""), pdf: await fileBytes(fd, "doc"), text: String(fd.get("text") ?? "") });
  go("/mlo/loa#overlays", r.ok, [r.ok ? `Read ${r.overlay.lender}'s overlays (${r.overlay.chars.toLocaleString("en-US")} characters of rules). Your LOA checks them from now on.` : r.error]);
}

export async function removeOverlayAction(id: string): Promise<void> {
  await removeOverlay(await me(), id);
  go("/mlo/loa#overlays", true, ["Removed."]);
}

// ---- D70: the switches ----

const AUTO = "/mlo/loa#autopilot";

/** The officer's grid: radio groups named "purchase.<task>" and "refi.<task>". */
export async function saveAutonomyAction(fd: FormData): Promise<void> {
  const u = await me();
  const input: Record<Purpose, Record<string, unknown>> = { purchase: {}, refi: {} };
  for (const t of PURPOSES) for (const k of CAP_KEYS) {
    const v = fd.get(`${t}.${k}`);
    if (typeof v === "string") input[t][k] = v;
  }
  const r = await saveAutonomy(u, input);
  go(AUTO, r.ok, [r.ok ? loaSwitches.flash.saved(r.changed) : r.error]);
}

export async function presetAction(preset: Preset): Promise<void> {
  const u = await me();
  if (!PRESETS.includes(preset)) return go(AUTO, false, ["Pick a starting point."]);
  const r = await applyPreset(u, preset);
  go(AUTO, r.ok, [r.ok ? `${loaSwitches.flash.preset(loaSwitches.presets[preset])} ${loaSwitches.flash.saved(r.changed)}` : r.error]);
}

export async function loanAutonomyAction(loanId: string, fd: FormData): Promise<void> {
  const input: Record<string, unknown> = {};
  for (const k of CAP_KEYS) {
    const v = fd.get(`loan.${k}`);
    if (typeof v === "string") input[k] = v;
  }
  const r = await setLoanAutonomy(await me(), loanId, input);
  go(back(loanId), r.ok, [r.ok ? loaSwitches.flash.saved(r.changed) : r.error]);
}

export async function pauseLoanAction(loanId: string, paused: boolean): Promise<void> {
  const r = await setLoanPaused(await me(), loanId, paused === true);
  go(back(loanId), r.ok, [r.ok ? (paused ? "Paused on this loan." : "Resumed on this loan.") : r.error]);
}

export async function purposeAction(loanId: string, purpose: Purpose): Promise<void> {
  const ok = await setPurpose(await me(), loanId, purpose);
  go(back(loanId), ok, [ok ? "Saved." : "Couldn't change that."]);
}

/** "What the contract didn't answer": one typed answer. */
export async function factAction(loanId: string, key: FactKey, fd: FormData): Promise<void> {
  const r = await answerFact(await me(), loanId, key, String(fd.get("value") ?? ""));
  go(`${back(loanId).split("#")[0]}#gaps`, r.ok, [r.ok ? "Saved." : r.error]);
}

export async function hoaAction(loanId: string, yes: boolean): Promise<void> {
  const r = await answerFact(await me(), loanId, "hoa", yes);
  go(`${back(loanId).split("#")[0]}#gaps`, r.ok, [r.ok ? "Saved." : r.error]);
}

export async function confirmPartyAction(loanId: string, role: PartyRole): Promise<void> {
  const ok = (PARTY_ROLES as readonly string[]).includes(role) && (await confirmParty(await me(), loanId, role));
  go(back(loanId), ok, [ok ? "Confirmed." : "Couldn't confirm that."]);
}

export async function reviewAction(loanId: string, reviewId: string, useNew: boolean): Promise<void> {
  const ok = await resolveReview(await me(), loanId, reviewId, useNew);
  go(back(loanId), ok, [ok ? "Updated." : "Couldn't change that."]);
}

/** The approval queue on Your LOA: send the draft as it stands. */
export async function approveLoaDraft(loanId: string, draftId: string): Promise<void> {
  const r = await approveDraft(await me(), loanId, draftId);
  go("/mlo/loa#needs", r.ok, [r.ok ? loaQueueWords.flash.sent(r.via) : r.error]);
}

export async function notThisTimeAction(loanId: string, draftId: string): Promise<void> {
  const ok = await discardDraft(await me(), loanId, draftId);
  go("/mlo/loa#needs", ok, [ok ? loaQueueWords.flash.dropped : "Couldn't change that."]);
}
