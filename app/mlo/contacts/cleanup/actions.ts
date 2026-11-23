"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash, type Flash } from "@/lib/mlo/flash";
import { contactCleanupCopy as cc } from "@/lib/content/contact-cleanup";
import { approve, dismissWeek, keepSeparate, mergePair, scanFor, skip, undoRun } from "@/lib/contacts/cleanup-service";
import { groupLabels } from "@/lib/contacts/cleanup-ai";

/**
 * D88 "Clean up your contacts". Every value that picks what to change is
 * bound (`action.bind(null, id, fingerprint)`); the form only carries the
 * ticked people (`ids`), a typed lead source, the merge confirm box and the
 * UNDO box. The service re-reads the book and checks `canSee` on every id.
 */
const PAGE = "/mlo/contacts/cleanup";
const to = (f: Flash, extra: Record<string, string> = {}, hash = "") => `${PAGE}?${new URLSearchParams({ ...extra, f: encodeFlash(f) })}${hash}`;

async function actor() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

const ERR: Record<string, string> = { book: cc.noBook, changed: cc.changed, source: cc.needSource, nobody: cc.pickSomeone, merge_only: cc.pairs.lead };

/** "Check again now": the page reads the whole book on every view; this says what it found. */
export async function rescanCleanupAction(): Promise<void> {
  const u = await actor();
  const s = await scanFor(u);
  redirect(to(s ? { ok: true, lines: [cc.checked(s.suggestions.length)] } : { ok: false, lines: [cc.noBook] }));
}

/** Approve a whole suggestion (bound: id, fingerprint). A lead-source group also carries the typed source. */
export async function approveCleanupAction(id: string, fp: string, fd: FormData): Promise<void> {
  const u = await actor();
  const r = await approve(u, String(id), String(fp), null, { leadSource: String(fd.get("leadSource") ?? "") });
  revalidatePath("/mlo");
  redirect(r.ok ? to({ ok: true, lines: [r.changed ? cc.done(r.changed) : cc.doneNone] }, {}, r.runId ? "#history" : "") : to({ ok: false, lines: [ERR[r.error] ?? cc.changed] }));
}

/** Approve only the people ticked in the review (bound: id, fingerprint). */
export async function approvePickedAction(id: string, fp: string, fd: FormData): Promise<void> {
  const u = await actor();
  const picked = fd.getAll("ids").map(String).slice(0, 5000);
  const r = await approve(u, String(id), String(fp), picked, { leadSource: String(fd.get("leadSource") ?? "") });
  revalidatePath("/mlo");
  if (r.ok) redirect(to({ ok: true, lines: [r.changed ? cc.done(r.changed) : cc.doneNone] }, {}, r.runId ? "#history" : ""));
  redirect(to({ ok: false, lines: [ERR[r.error] ?? cc.changed] }, { g: String(id) }));
}

/** Skip (bound: id, fingerprint): hidden until the people in it change. */
export async function skipCleanupAction(id: string, fp: string): Promise<void> {
  const u = await actor();
  const r = await skip(u, String(id), String(fp));
  revalidatePath("/mlo");
  redirect(to(r.ok ? { ok: true, lines: [cc.skipped] } : { ok: false, lines: [ERR[r.error] ?? cc.changed] }));
}

/** Keep a pair separate (bound: the two ids). */
export async function keepSeparateAction(a: string, b: string): Promise<void> {
  const u = await actor();
  const r = await keepSeparate(u, String(a), String(b));
  redirect(to(r.ok ? { ok: true, lines: [cc.separated] } : { ok: false, lines: [cc.mergeRefused] }, { g: "duplicates" }));
}

/** Merge one pair through D77's merge (bound: keep, drop), after the confirm box. */
export async function mergePairAction(keepId: string, dropId: string, fd: FormData): Promise<void> {
  const u = await actor();
  if (fd.get("same") !== "yes") redirect(to({ ok: false, lines: [cc.confirmFirst] }, { g: "duplicates" }));
  const r = await mergePair(u, String(keepId), String(dropId));
  revalidatePath("/mlo");
  redirect(r.ok ? to({ ok: true, lines: [cc.merged(r.name)] }, { g: "duplicates" }) : to({ ok: false, lines: [r.error === "book" ? cc.noBook : r.error === "changed" ? cc.changed : cc.mergeRefused] }, { g: "duplicates" }));
}

/** Undo one clean-up (bound: its id), after typing UNDO. */
export async function undoCleanupAction(runId: string, fd: FormData): Promise<void> {
  const u = await actor();
  const r = await undoRun(u, String(runId), String(fd.get("confirm") ?? ""));
  revalidatePath("/mlo");
  const err = { type: cc.undoType, gone: cc.undoGone, expired: cc.undoExpired, undone: cc.undoDone, merge: cc.undoMerge };
  redirect(to(r.ok ? { ok: true, lines: [cc.undone(r.restored, r.kept)] } : { ok: false, lines: [err[r.error]] }, {}, "#history"));
}

/** "Ask M8 to group similar labels": labels and counts only. */
export async function groupLabelsAction(): Promise<void> {
  const u = await actor();
  const r = await groupLabels(u);
  const line = r.ok ? (r.groups ? cc.ai.found(r.groups) : cc.ai.none) : r.reason === "few" ? cc.ai.few : r.reason === "book" ? cc.noBook : cc.ai.off(r.why ?? "the AI isn't available right now");
  redirect(to({ ok: r.ok, lines: [line] }, {}, "#m8"));
}

/** Home's "Not this week". */
export async function dismissCleanupAction(): Promise<void> {
  const u = await actor();
  await dismissWeek(u);
  revalidatePath("/mlo");
  redirect(`/mlo?f=${encodeFlash({ ok: true, lines: [cc.home.hidden] })}`);
}
