/**
 * lib/contacts/cleanup-service.ts — D88 "Clean up my contacts". SERVER-ONLY.
 *
 *  - `scanBook`: reads the whole book (`listAll`, never one 500-person
 *    page), runs the rules (lib/contacts/cleanup.ts), hides skipped groups
 *    whose fingerprint hasn't changed, and saves the counts for Home and the
 *    morning email. The page does it on every view (the on-demand check).
 *  - `weeklyScan`: the morning run's, at most once per ISO week per book
 *    (the week is claimed first, so two runs never both scan).
 *  - `approve`: re-reads the book, finds the suggestion and refuses when its
 *    fingerprint changed since the loan officer saw it; applies the fix to
 *    everyone in it, or only to the people ticked; records a run with each
 *    person's before and after for undo (30 days).
 *  - `mergePair`: one pair from the duplicates group, through D77's
 *    `mergeContacts` exactly; `keepSeparate` remembers a pair.
 *  - `undoRun`: type UNDO; puts back what wasn't edited since.
 * Own book only: the book is the loan officer's own (an assistant's is the
 * officer's they assist), and every id is checked with `canSee`. Nothing
 * here writes or reads a consent entry, a stop, a phone check, the hold or
 * provenance; a move to Agents ends the person's campaigns.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { campaignStore } from "@/lib/campaigns/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { contactCleanupCopy as cc } from "@/lib/content/contact-cleanup";
import { importStore } from "./imports";
import { mergeContacts } from "./manage";
import { nameOf } from "./merge";
import { canSee } from "./service";
import { contactStore, listAll, type Contact } from "./store";
import { tagBook } from "./tagging";
import { cleanSource, cleanupUndoOpen, findSuggestions, fixFor, isoWeek, pairKey, undoChange, type Change, type RuleKey, type Suggestion } from "./cleanup";
import { cleanupStore, type CleanupRun, type CleanupState } from "./cleanup-store";

export type Scan = {
  book: string;
  suggestions: Suggestion[];
  /** Hidden because they were skipped and nothing changed since. */
  skipped: number;
  /** Everyone read, and whether the cap stopped the read. */
  read: number;
  total: number;
  capped: boolean;
  people: Contact[];
  state: CleanupState;
};

const audit = (actor: User | null, at: string, action: string, detail: Record<string, string | number | boolean | null>) => accountStore().audit({ at, actor: actor?.email ?? "concierge", action, detail });

/** The book a user cleans: their own, or for an assistant the officer's they assist. */
export const cleanupBook = (user: User) => tagBook(user);

/** Everything in the book the rules need, read whole. */
async function readBook(book: string, actor: User | null) {
  const [whole, loans, imports, state] = await Promise.all([listAll({ ownerUserId: book }), pipelineStore().list(book).catch(() => []), importStore().list(book, 200).catch(() => []), cleanupStore().state(book)]);
  const contacts = whole.contacts.filter((c) => c.ownerUserId === book && (!actor || canSee(actor, c)));
  return { whole, contacts, loans, imports, state };
}

/** The suggestions for a book now, with skipped ones hidden. `save` keeps the counts for Home and the email. */
export async function scanBook(actor: User | null, book: string, now = new Date(), opts: { save?: boolean } = {}): Promise<Scan> {
  const { whole, contacts, loans, imports, state } = await readBook(book, actor);
  const all = findSuggestions({ contacts, loans: loans.map((l) => ({ contactId: l.contactId, closed: l.closed, dead: l.dead })), imports: imports.map((r) => ({ id: r.id, files: r.files })), separate: state.separate, ai: state.ai });
  const skips = new Set(state.skipped.map((s) => `${s.id}#${s.fp}`));
  const suggestions = all.filter((s) => !skips.has(`${s.id}#${s.fingerprint}`));
  if (opts.save !== false) {
    const byRule: Partial<Record<RuleKey, number>> = {};
    for (const s of suggestions) byRule[s.rule] = (byRule[s.rule] ?? 0) + 1;
    await cleanupStore().saveScan(book, { scannedAt: now.toISOString(), count: suggestions.length, people: new Set(suggestions.flatMap((s) => s.people)).size, byRule });
  }
  return { book, suggestions, skipped: all.length - suggestions.length, read: contacts.length, total: whole.total, capped: whole.capped, people: contacts, state };
}

/** The page's scan for a signed-in user (null when they have no book). */
export async function scanFor(actor: User, now = new Date()): Promise<Scan | null> {
  const book = cleanupBook(actor);
  return book ? scanBook(actor, book, now) : null;
}

/** The morning run: one scan per book per ISO week. "skipped" when this week's already ran. */
export async function weeklyScan(user: User, now = new Date()): Promise<"scanned" | "skipped"> {
  if (user.status !== "active" || user.role === "assistant") return "skipped";
  if (!(await cleanupStore().claimWeek(user.id, isoWeek(now), now.toISOString()))) return "skipped";
  await scanBook(null, user.id, now);
  await audit(null, now.toISOString(), "contacts.cleanup.weekly", { owner: user.id });
  return "scanned";
}

/**
 * What Home shows: the saved count, unless this user hid it this week. Also
 * says whether a scan is due (none this week, or an import finished after
 * the last scan), so Home can run one after the page is sent.
 */
export async function homeCleanup(user: User, now = new Date()): Promise<{ count: number; people: number; due: "weekly" | "import" | null } | null> {
  const book = cleanupBook(user);
  if (!book) return null;
  const s = await cleanupStore().state(book);
  const week = isoWeek(now);
  const last = (await importStore().list(book, 1).catch(() => []))[0];
  const due = s.week !== week && user.role !== "assistant" ? "weekly" : last?.finishedAt && (!s.scan || last.finishedAt > s.scan.scannedAt) ? "import" : null;
  const count = s.dismissed[user.id] === week ? 0 : (s.scan?.count ?? 0);
  return { count, people: count ? (s.scan?.people ?? 0) : 0, due };
}

/** Home's after-the-page scan: the weekly one when due, else a fresh look after an import. */
export async function homeScan(user: User, due: "weekly" | "import" | null, now = new Date()): Promise<void> {
  const book = cleanupBook(user);
  if (!book || !due) return;
  if (due === "weekly" && (await weeklyScan(user, now)) === "scanned") return;
  await scanBook(null, book, now);
}

/** "Not this week" on Home. */
export async function dismissWeek(user: User, now = new Date()): Promise<void> {
  const book = cleanupBook(user);
  if (book) await cleanupStore().dismiss(book, user.id, isoWeek(now));
}

/** The morning email's line (counts only), or "". */
export async function cleanupDigestLine(user: User, url: string, now = new Date()): Promise<string> {
  const h = await homeCleanup(user, now).catch(() => null);
  return h && h.count > 0 ? cc.digest(h.count, url) : "";
}

// ---- Acting on a suggestion ----

export type ActResult = { ok: true; changed: number; runId: string | null } | { ok: false; error: "book" | "changed" | "source" | "nobody" | "merge_only" };

async function find(actor: User, id: string, fp: string, now: Date): Promise<{ scan: Scan; s: Suggestion } | { error: "book" | "changed" }> {
  const book = cleanupBook(actor);
  if (!book) return { error: "book" };
  const scan = await scanBook(actor, book, now, { save: false });
  const s = scan.suggestions.find((x) => x.id === id);
  if (!s || s.fingerprint !== fp) return { error: "changed" };
  return { scan, s };
}

/**
 * Applies one suggestion to everyone in it (`picked` null) or to the people
 * ticked (only ids in the group count; anyone outside it is ignored).
 */
export async function approve(actor: User, id: string, fp: string, picked: readonly string[] | null, input: { leadSource?: string } = {}, now = new Date()): Promise<ActResult> {
  const f = await find(actor, id, fp, now);
  if ("error" in f) return { ok: false, error: f.error };
  const { s, scan } = f;
  if (s.fix === "merge_pairs") return { ok: false, error: "merge_only" };
  if (s.fix === "set_source" && !cleanSource(input.leadSource)) return { ok: false, error: "source" };
  const members = new Set(s.people);
  const ids = picked ? [...new Set(picked)].filter((x) => members.has(x)) : s.people;
  if (!ids.length) return { ok: false, error: "nobody" };
  const store = contactStore();
  const at = now.toISOString();
  const changes: Change[] = [];
  let ended = 0;
  for (const c of await store.getMany(ids)) {
    if (c.ownerUserId !== scan.book || !canSee(actor, c)) continue;
    const r = fixFor(s, c, input, at);
    if (!r) continue;
    await store.put(r.next);
    changes.push(r.change);
    // Agents never get client messages: whatever campaign they were in as a client ends.
    if (s.fix === "to_agents") {
      for (const e of await campaignStore().activeForContact(c.id)) {
        await campaignStore().putEnrollment({ ...e, status: "stopped", endedAt: at, reason: "Moved to Agents." });
        ended++;
      }
    }
  }
  let runId: string | null = null;
  if (changes.length) {
    runId = `cln_${randomBytes(9).toString("base64url")}`;
    const run: CleanupRun = { id: runId, owner: scan.book, by: actor.email, at, rule: s.rule, suggestionId: s.id, title: cc.titleOf(s).slice(0, 200), count: changes.length, changes, ended, undoable: true, undone: null };
    await cleanupStore().putRun(run);
  }
  await audit(actor, at, "contacts.cleanup.approve", { rule: s.rule, picked: picked ? ids.length : null, changed: changes.length, ended, ...(scan.book !== actor.id ? { book: scan.book } : {}) });
  await scanBook(actor, scan.book, now).catch(() => null);
  return { ok: true, changed: changes.length, runId };
}

/** Skip: hidden until the people in it change (its fingerprint). */
export async function skip(actor: User, id: string, fp: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: "book" | "changed" }> {
  const f = await find(actor, id, fp, now);
  if ("error" in f) return { ok: false, error: f.error };
  await cleanupStore().addSkip(f.scan.book, { id, fp, at: now.toISOString(), by: actor.email });
  await audit(actor, now.toISOString(), "contacts.cleanup.skip", { rule: f.s.rule, people: f.s.count });
  await scanBook(actor, f.scan.book, now).catch(() => null);
  return { ok: true };
}

/** Two people in the same book the loan officer says are different: never suggested as a pair again. */
export async function keepSeparate(actor: User, a: string, b: string, now = new Date()): Promise<{ ok: boolean }> {
  const book = cleanupBook(actor);
  if (!book || a === b) return { ok: false };
  const both = await contactStore().getMany([a, b]);
  if (both.length !== 2 || both.some((c) => c.ownerUserId !== book || !canSee(actor, c))) return { ok: false };
  await cleanupStore().addSeparate(book, pairKey(a, b));
  await audit(actor, now.toISOString(), "contacts.cleanup.separate", { pairs: 1 });
  await scanBook(actor, book, now).catch(() => null);
  return { ok: true };
}

/** One pair from the duplicates group, merged by D77's merge exactly (confirmed on the page first). Recorded, not undoable. */
export async function mergePair(actor: User, keepId: string, dropId: string, now = new Date()): Promise<{ ok: true; name: string; keptId: string } | { ok: false; error: "book" | "changed" | "refused" }> {
  const book = cleanupBook(actor);
  if (!book) return { ok: false, error: "book" };
  const scan = await scanBook(actor, book, now, { save: false });
  const dup = scan.suggestions.find((s) => s.fix === "merge_pairs");
  if (!dup?.pairs?.some((p) => pairKey(p.a, p.b) === pairKey(keepId, dropId))) return { ok: false, error: "changed" };
  const r = await mergeContacts(actor, keepId, dropId, now);
  if (!r.ok) return { ok: false, error: "refused" };
  const at = now.toISOString();
  await cleanupStore().putRun({ id: `cln_${randomBytes(9).toString("base64url")}`, owner: book, by: actor.email, at, rule: "duplicates", suggestionId: dup.id, title: cc.merged(r.name).slice(0, 200), count: 1, changes: [], ended: 0, undoable: false, undone: null });
  await scanBook(actor, book, now).catch(() => null);
  return { ok: true, name: r.name, keptId: r.keptId };
}

export type UndoCleanup = { ok: true; restored: number; kept: number } | { ok: false; error: "type" | "gone" | "expired" | "undone" | "merge" };

/** Undo one applied clean-up (30 days, type UNDO). Never touches consent. */
export async function undoRun(actor: User, runId: string, confirm: string, now = new Date()): Promise<UndoCleanup> {
  if (confirm.trim() !== "UNDO") return { ok: false, error: "type" };
  const book = cleanupBook(actor);
  const run = await cleanupStore().getRun(runId);
  if (!book || !run || run.owner !== book) return { ok: false, error: "gone" };
  if (!run.undoable) return { ok: false, error: "merge" };
  if (run.undone) return { ok: false, error: "undone" };
  if (!cleanupUndoOpen(run.at, now)) return { ok: false, error: "expired" };
  const store = contactStore();
  const at = now.toISOString();
  const byId = new Map((await store.getMany(run.changes.map((c) => c.id))).map((c) => [c.id, c]));
  let restored = 0;
  let kept = 0;
  for (const ch of run.changes) {
    const c = byId.get(ch.id);
    if (!c || c.ownerUserId !== book || !canSee(actor, c)) {
      kept++;
      continue;
    }
    const u = undoChange(c, ch, at);
    if (u.restored) {
      await store.put(u.next);
      restored++;
    }
    else kept++;
  }
  run.undone = { at, by: actor.email, restored, kept };
  await cleanupStore().putRun(run);
  await audit(actor, at, "contacts.cleanup.undo", { rule: run.rule, restored, kept });
  await scanBook(actor, book, now).catch(() => null);
  return { ok: true, restored, kept };
}

/** The book's recent clean-ups, newest first. */
export async function recentRuns(actor: User, limit = 20): Promise<CleanupRun[]> {
  const book = cleanupBook(actor);
  return book ? cleanupStore().runs(book, limit) : [];
}

/** Names for a review list (the loan officer's own book, by id). */
export async function peopleFor(actor: User, ids: readonly string[]): Promise<Contact[]> {
  const book = cleanupBook(actor);
  if (!book) return [];
  const got = await contactStore().getMany(ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  return got.filter((c) => c.ownerUserId === book && canSee(actor, c)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export { nameOf };
