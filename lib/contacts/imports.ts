/**
 * lib/contacts/imports.ts — every import, its history and its undo (D75).
 * SERVER-ONLY. Neon (`cc_imports`) when DATABASE_URL is set, in memory
 * otherwise.
 *
 *  - An import is one run of the wizard: `startImport` makes its id, each
 *    batch adds its counts, `finishImport` stores the totals and the skipped
 *    rows (formula-safe CSV, made in the browser) for the history page.
 *  - `checkExisting` tells the preview who is already in the book, with the
 *    same rules the import uses (`lib/contacts/reimport.ts`).
 *  - `undoImport` (30 days): deletes the people the import created that are
 *    untouched since (no message, no consent entry but the import's own, no
 *    stop of any kind, not changed by a later import), and puts back what it
 *    changed on people already in the book. Nothing is ever erased from a
 *    consent log: a stop always stays, and an import's own "yes" on someone
 *    kept is taken back with a new entry, never deleted.
 *  - Every contact read or written is checked with `canSee`; an assistant
 *    works in the book of the loan officer they assist.
 */
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { campaignStore } from "@/lib/campaigns/store";
import { touchStore } from "@/lib/messaging/store";
import { leadEventStore } from "@/lib/leads/events";
import type { ImportKind, ImportRecord } from "./mapping";
import { applyImport, changeLabels, classify, undoOpen, undoSnapshot, type MatchKind, type ReimportMode } from "./reimport";
import { bookOf, canSee, importOwner, isUndoneYes } from "./service";
import { CHANNELS, contactStore, liveEntries, PURPOSES, type Contact, type ConsentEntry, type Provenance } from "./store";

export type ImportCounts = { created: number; merged: number; updated: number; skipped: number; optedOut: number; possible: number; inFile: number };
export type UndoResult = { deleted: number; restored: number; kept: number; keptStops: number; keptTouched: number };
export type ImportRun = {
  id: string;
  /** The book it landed in. */
  owner: string;
  by: string;
  byName: string;
  kind: ImportKind;
  files: string[];
  provenance: Provenance;
  mode: ReimportMode;
  tags: string[];
  at: string;
  finishedAt: string | null;
  counts: ImportCounts;
  /** The skipped rows as CSV (made formula-safe in the browser, re-checked here), for the history's download. */
  skippedCsv: string | null;
  undone: (UndoResult & { at: string; by: string }) | null;
  /** An undo that ran out of time part way: what it did so far. */
  undoing?: UndoResult | null;
};

export const MAX_SKIPPED_CSV = 256 * 1024;
const UNDO_PASS = 1500;
const ZERO: ImportCounts = { created: 0, merged: 0, updated: 0, skipped: 0, optedOut: 0, possible: 0, inFile: 0 };

export interface ImportStore {
  put(r: ImportRun): Promise<void>;
  get(id: string): Promise<ImportRun | null>;
  /** Newest first; owner undefined = every book. */
  list(owner: string | undefined, limit?: number): Promise<ImportRun[]>;
}

export class MemoryImportStore implements ImportStore {
  private rows = new Map<string, ImportRun>();
  async put(r: ImportRun) {
    this.rows.set(r.id, structuredClone(r));
  }
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }
  async list(owner: string | undefined, limit = 100) {
    return [...this.rows.values()].filter((r) => !owner || r.owner === owner).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map((r) => structuredClone(r));
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const toRun = (r: Row) => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as ImportRun;

/** `cc_imports (id, owner, files, counts, provenance, at, by)` plus the whole run as JSON. */
export class NeonImportStore implements ImportStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_imports (id text PRIMARY KEY, owner_user_id text NOT NULL, files jsonb NOT NULL, counts jsonb NOT NULL, provenance text NOT NULL, at timestamptz NOT NULL, by_email text NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_imports_owner ON cc_imports (owner_user_id, at DESC)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async put(r: ImportRun) {
    await this.init();
    await this.q(
      `INSERT INTO cc_imports (id, owner_user_id, files, counts, provenance, at, by_email, body) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET files = EXCLUDED.files, counts = EXCLUDED.counts, body = EXCLUDED.body`,
      [r.id, r.owner, JSON.stringify(r.files), JSON.stringify(r.counts), r.provenance, r.at, r.by, JSON.stringify(r)],
    );
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_imports WHERE id = $1`, [id]);
    return r[0] ? toRun(r[0]) : null;
  }
  async list(owner: string | undefined, limit = 100) {
    await this.init();
    const n = Math.max(1, Math.min(limit, 500));
    const r = owner ? await this.q(`SELECT body FROM cc_imports WHERE owner_user_id = $1 ORDER BY at DESC LIMIT ${n}`, [owner]) : await this.q(`SELECT body FROM cc_imports ORDER BY at DESC LIMIT ${n}`);
    return r.map(toRun);
  }
}

let override: ImportStore | null = null;
let neonStore: NeonImportStore | null = null;
const g = globalThis as unknown as { __lm8ImportMemory?: MemoryImportStore };
const memory = (g.__lm8ImportMemory ??= new MemoryImportStore());

export function setImportStoreForTests(s: ImportStore | null) {
  override = s;
}

export function importStore(): ImportStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonImportStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}

// ---- Who may see and change a run ----

/** A run in a book this user sees (the owner's whole team while there's one sponsor; an assistant's officer's). */
export function seesRun(actor: User, run: ImportRun): boolean {
  if (actor.status !== "active") return false;
  const book = bookOf(actor);
  return book === undefined || book === run.owner;
}

/** A run this user adds batches to: one they started, in the book they import into. */
function writesRun(actor: User, run: ImportRun): boolean {
  return actor.status === "active" && run.by === actor.email && run.owner === importOwner(actor) && !run.undone;
}

// ---- Running an import ----

export async function startImport(actor: User, input: { kind: ImportKind; files: string[]; provenance: Provenance; mode: ReimportMode; tags: string[] }, now = new Date()): Promise<ImportRun> {
  const run: ImportRun = {
    id: `imp_${randomBytes(9).toString("base64url")}`,
    owner: importOwner(actor),
    by: actor.email,
    byName: actor.name.slice(0, 80),
    kind: input.kind,
    files: input.files.map((f) => f.slice(0, 160)).slice(0, 20),
    provenance: input.provenance,
    mode: input.mode,
    tags: input.tags.slice(0, 10),
    at: now.toISOString(),
    finishedAt: null,
    counts: { ...ZERO },
    skippedCsv: null,
    undone: null,
  };
  await importStore().put(run);
  return run;
}

/** The run a batch belongs to, if this user may add to it. */
export async function runForBatch(actor: User, id: string): Promise<ImportRun | null> {
  const run = await importStore().get(id);
  return run && writesRun(actor, run) ? run : null;
}

export async function addBatchCounts(run: ImportRun, c: Partial<ImportCounts>): Promise<void> {
  const fresh = (await importStore().get(run.id)) ?? run;
  for (const k of Object.keys(ZERO) as (keyof ImportCounts)[]) fresh.counts[k] += c[k] ?? 0;
  await importStore().put(fresh);
}

/** A formula-safe CSV: every cell that would start a formula is already quoted with '. Anything else is refused. */
function safeCsv(text: string): string | null {
  if (!text || text.length > MAX_SKIPPED_CSV) return null;
  const cells = text.replace(/^﻿/, "").split(/,|\r?\n/);
  return cells.some((c) => /^"?[=+\-@\t\r]/.test(c)) ? null : text;
}

/** The end of a run: the totals the browser knows (duplicates in the files, rows skipped there) and the skipped rows. */
export async function finishImport(actor: User, id: string, input: { inFile: number; skipped: number; skippedCsv: string | null }, now = new Date()): Promise<{ run: ImportRun; people: number; withPhone: number } | null> {
  const run = await importStore().get(id);
  if (!run || !writesRun(actor, run)) return null;
  run.counts.inFile = Math.max(0, Math.floor(input.inFile));
  if (!run.finishedAt) run.counts.skipped += Math.max(0, Math.floor(input.skipped));
  run.skippedCsv = input.skippedCsv ? safeCsv(input.skippedCsv) : null;
  run.finishedAt = now.toISOString();
  await importStore().put(run);
  const people = (await contactStore().byImport(run.owner, run.id)).filter((c) => canSee(actor, c));
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contacts.import.finish", detail: { importId: run.id, ...run.counts } });
  return { run, people: people.length, withPhone: people.filter((c) => c.phone).length };
}

export async function listImports(actor: User, limit = 100): Promise<ImportRun[]> {
  if (actor.status !== "active") return [];
  const book = bookOf(actor);
  return importStore().list(book, limit);
}

export async function getImport(actor: User, id: string): Promise<ImportRun | null> {
  const run = await importStore().get(id);
  return run && seesRun(actor, run) ? run : null;
}

/** The people an import created or changed, that this user may see. */
export async function importPeople(actor: User, id: string): Promise<Contact[]> {
  const run = await getImport(actor, id);
  if (!run) return [];
  return (await contactStore().byImport(run.owner, run.id)).filter((c) => canSee(actor, c));
}

// ---- People you already have (the preview) ----

export type ExistingCheck = { i: number; kind: MatchKind; matches: { id: string; name: string }[]; by: "phone" | "email" | null; fill: string[]; newer: string[] };

const nameOf = (c: Contact) => `${c.firstName} ${c.lastName}`.trim() || "(no name)";

/**
 * Who each row is in the book (the import's own rules), and what each choice
 * would change, as field names only. Nothing is saved. `importId`: a resumed
 * run (people it already created don't count as "already yours").
 */
export async function checkExisting(actor: User, records: ImportRecord[], importId?: string, now = new Date()): Promise<ExistingCheck[]> {
  const owner = importOwner(actor);
  const phones = records.flatMap((r) => [r.phone, r.phone2]).filter(Boolean) as string[];
  const emails = records.map((r) => r.email).filter(Boolean) as string[];
  const pool = (phones.length || emails.length ? await contactStore().findMatches(owner, phones, emails) : []).filter((c) => canSee(actor, c) && (!importId || c.importId !== importId));
  const at = now.toISOString();
  return records.map((r, i) => {
    const mine = pool.filter((c) => (r.email && c.email === r.email) || [r.phone, r.phone2].some((p) => p && (c.phone === p || c.phone2 === p)));
    const m = classify(r, mine);
    const all = m.contact ? [m.contact, ...m.others] : m.others;
    const diff = (mode: ReimportMode) => (m.contact && m.kind !== "shares" ? changeLabels(applyImport(m.contact, r, m.kind === "possible" ? "fill" : mode, { at }).changed) : []);
    return { i, kind: m.kind, matches: all.slice(0, 4).map((c) => ({ id: c.id, name: nameOf(c) })), by: m.by, fill: diff("fill"), newer: diff("newer") };
  });
}

// ---- Undo ----

export type UndoOutcome = { ok: true; done: boolean; result: UndoResult } | { ok: false; error: "gone" | "expired" | "undone" };

/**
 * Undo an import (30 days). Runs in passes of 1,500 people; `done: false`
 * means press Undo again to finish. People kept: anyone messaged since,
 * anyone with a consent entry that isn't the import's own "yes", anyone with
 * a stop (the import's own opt-out included: a stop is never undone), and
 * anyone a later import changed.
 */
export async function undoImport(actor: User, id: string, now = new Date()): Promise<UndoOutcome> {
  const imports = importStore();
  const run = await imports.get(id);
  if (!run || !seesRun(actor, run)) return { ok: false, error: "gone" };
  if (run.undone) return { ok: false, error: "undone" };
  if (!undoOpen(run.at, now)) return { ok: false, error: "expired" };
  const store = contactStore();
  const at = now.toISOString();
  const r: UndoResult = { ...(run.undoing ?? { deleted: 0, restored: 0, kept: 0, keptStops: 0, keptTouched: 0 }) };
  const people = (await store.byImport(run.owner, run.id, UNDO_PASS + 1)).filter((c) => canSee(actor, c));
  const done = people.length <= UNDO_PASS;
  for (const c of people.slice(0, UNDO_PASS)) {
    const log = await store.consents(c.id);
    if (c.importId === run.id) {
      const stop = log.some((e) => !e.granted && e.evidence === "revoked");
      const touched = (await touchStore().forContact(c.id, 1)).length > 0 || log.some((e) => e.importId !== run.id) || (c.imports ?? []).some((s) => s.id !== run.id);
      if (stop || touched) {
        // Kept as they are, no longer counted as this import's (so a second pass doesn't count them twice).
        await store.put({ ...c, importId: null, keptFrom: run.id, updatedAt: at });
        await takeBackYes(c.id, log, run, actor, at);
        r.kept++;
        if (stop) r.keptStops++;
        else r.keptTouched++;
        continue;
      }
      // The consent log stays as it was (append-only); the person goes.
      await store.remove(c.id, { keepConsents: true });
      // D83: an undone import never happened, so its leads aren't counted (a person deleted any other way keeps theirs).
      await leadEventStore().removeImported(run.owner, c.id);
      for (const e of await campaignStore().activeForContact(c.id)) await campaignStore().putEnrollment({ ...e, status: "stopped", endedAt: at, reason: "Import undone." });
      r.deleted++;
      continue;
    }
    const u = undoSnapshot(c, run.id, at);
    if (u) await store.put(u.next);
    await takeBackYes(c.id, log, run, actor, at);
    r.restored++;
  }
  if (done) {
    run.undone = { ...r, at, by: actor.email };
    run.undoing = null;
  } else run.undoing = r;
  await imports.put(run);
  await accountStore().audit({ at, actor: actor.email, action: "contacts.import.undo", detail: { importId: run.id, done, ...r } });
  return { ok: true, done, result: r };
}

/**
 * The import's own "yes" (still the latest answer for that channel and
 * purpose) is taken back with a new entry. Stops, and anything recorded
 * since, are left exactly as they are.
 */
async function takeBackYes(contactId: string, log: ConsentEntry[], run: ImportRun, actor: User, at: string) {
  for (const channel of CHANNELS) {
    for (const purpose of PURPOSES) {
      const last = liveEntries(log).filter((e) => e.channel === channel && e.purpose === purpose).sort((a, b) => a.at.localeCompare(b.at)).pop();
      if (!last || last.importId !== run.id || !last.granted || last.evidence !== "attested" || isUndoneYes(last)) continue;
      await contactStore().addConsent({ contactId, channel, purpose, granted: false, evidence: "attested", proof: `import undone: ${run.files.join(", ")}`.slice(0, 200), at, actor: actor.email, importId: run.id });
    }
  }
}
