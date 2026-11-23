/**
 * lib/contacts/cleanup-store.ts — D88: what "Clean up my contacts" keeps.
 * SERVER-ONLY. Neon (`cc_cleanup`, `cc_cleanup_runs`, made on first use)
 * when DATABASE_URL is set, in memory otherwise; both behave the same.
 *
 *  - One state row per book: the last scan's counts (the Home card and the
 *    morning email read them), the ISO week the weekly scan last ran (claimed
 *    once, so two runs in one week never both scan), who hid the card this
 *    week, skipped groups (by fingerprint), pairs kept separate, and M8's
 *    label groups.
 *  - One run row per applied clean-up: what each person's fields and tags
 *    were before and after (undo reads it). Names, phones and emails are
 *    never kept here; consent never is.
 * Every value is bound ($1…); each write changes only its own keys.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { AiGroup, Change, RuleKey } from "./cleanup";

export type ScanCounts = { scannedAt: string; count: number; people: number; byRule: Partial<Record<RuleKey, number>> };
export type Skip = { id: string; fp: string; at: string; by: string };
export type CleanupState = {
  owner: string;
  /** The ISO week the weekly scan last ran in. */
  week: string | null;
  scan: ScanCounts | null;
  /** userId → the ISO week they hid the Home card for. */
  dismissed: Record<string, string>;
  skipped: Skip[];
  /** `pairKey`s the loan officer marked "Keep separate". */
  separate: string[];
  ai: (AiGroup & { at: string })[];
};

export type CleanupRun = {
  id: string;
  owner: string;
  by: string;
  at: string;
  rule: RuleKey;
  suggestionId: string;
  /** The plain title as shown when it was approved. */
  title: string;
  count: number;
  changes: Change[];
  /** Enrollments a move to Agents ended (stay ended after an undo). */
  ended: number;
  /** False for merges (D77 merges aren't undone). */
  undoable: boolean;
  undone: { at: string; by: string; restored: number; kept: number } | null;
};

export const MAX_SKIPS = 500;
export const MAX_SEPARATE = 5000;
export const MAX_AI_GROUPS = 40;

export const emptyState = (owner: string): CleanupState => ({ owner, week: null, scan: null, dismissed: {}, skipped: [], separate: [], ai: [] });

export interface CleanupStore {
  state(owner: string): Promise<CleanupState>;
  /** True for the one caller that claims this week's weekly scan. */
  claimWeek(owner: string, week: string, at: string): Promise<boolean>;
  saveScan(owner: string, scan: ScanCounts): Promise<void>;
  addSkip(owner: string, s: Skip): Promise<void>;
  addSeparate(owner: string, key: string): Promise<void>;
  dismiss(owner: string, userId: string, week: string): Promise<void>;
  setAi(owner: string, groups: (AiGroup & { at: string })[]): Promise<void>;
  putRun(r: CleanupRun): Promise<void>;
  getRun(id: string): Promise<CleanupRun | null>;
  /** Newest first. */
  runs(owner: string, limit?: number): Promise<CleanupRun[]>;
}

/** The state with every list cut to its limit (oldest dropped first). */
function capped(s: CleanupState): CleanupState {
  return { ...s, skipped: s.skipped.slice(-MAX_SKIPS), separate: [...new Set(s.separate)].slice(-MAX_SEPARATE), ai: s.ai.slice(0, MAX_AI_GROUPS) };
}

export class MemoryCleanupStore implements CleanupStore {
  private states = new Map<string, CleanupState>();
  private runRows = new Map<string, CleanupRun>();
  private get(owner: string): CleanupState {
    if (!this.states.has(owner)) this.states.set(owner, emptyState(owner));
    return this.states.get(owner)!;
  }
  async state(owner: string) {
    return structuredClone(capped(this.get(owner)));
  }
  async claimWeek(owner: string, week: string) {
    const s = this.get(owner);
    if (s.week === week) return false;
    s.week = week;
    return true;
  }
  async saveScan(owner: string, scan: ScanCounts) {
    this.get(owner).scan = structuredClone(scan);
  }
  async addSkip(owner: string, sk: Skip) {
    this.get(owner).skipped.push({ ...sk });
  }
  async addSeparate(owner: string, key: string) {
    this.get(owner).separate.push(key);
  }
  async dismiss(owner: string, userId: string, week: string) {
    this.get(owner).dismissed[userId] = week;
  }
  async setAi(owner: string, groups: (AiGroup & { at: string })[]) {
    this.get(owner).ai = structuredClone(groups).slice(0, MAX_AI_GROUPS);
  }
  async putRun(r: CleanupRun) {
    this.runRows.set(r.id, structuredClone(r));
  }
  async getRun(id: string) {
    const r = this.runRows.get(id);
    return r ? structuredClone(r) : null;
  }
  async runs(owner: string, limit = 20) {
    return [...this.runRows.values()].filter((r) => r.owner === owner).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map((r) => structuredClone(r));
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const parse = <T,>(v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as T;

/** `cc_cleanup (owner_user_id, body, updated_at)` and `cc_cleanup_runs (id, owner_user_id, at, body)`. */
export class NeonCleanupStore implements CleanupStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_cleanup (owner_user_id text PRIMARY KEY, body jsonb NOT NULL, updated_at timestamptz NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_cleanup_runs (id text PRIMARY KEY, owner_user_id text NOT NULL, at timestamptz NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_cleanup_runs_owner ON cc_cleanup_runs (owner_user_id, at DESC)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  /** Makes the book's row when it's missing, then runs one bound UPDATE on it. */
  private async update(owner: string, set: string, params: unknown[]): Promise<Row[]> {
    await this.init();
    await this.q(`INSERT INTO cc_cleanup (owner_user_id, body, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (owner_user_id) DO NOTHING`, [owner, JSON.stringify(emptyState(owner))]);
    return this.q(`UPDATE cc_cleanup SET body = ${set}, updated_at = now() WHERE owner_user_id = $1`, [owner, ...params]);
  }
  async state(owner: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_cleanup WHERE owner_user_id = $1`, [owner]);
    return capped({ ...emptyState(owner), ...(r[0] ? parse<Partial<CleanupState>>(r[0].body) : {}), owner });
  }
  async claimWeek(owner: string, week: string) {
    await this.init();
    await this.q(`INSERT INTO cc_cleanup (owner_user_id, body, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (owner_user_id) DO NOTHING`, [owner, JSON.stringify(emptyState(owner))]);
    const r = await this.q(`UPDATE cc_cleanup SET body = body || jsonb_build_object('week', $2::text), updated_at = now() WHERE owner_user_id = $1 AND (body->>'week') IS DISTINCT FROM $2::text RETURNING 1 AS ok`, [owner, week]);
    return r.length > 0;
  }
  async saveScan(owner: string, scan: ScanCounts) {
    await this.update(owner, `body || jsonb_build_object('scan', $2::jsonb)`, [JSON.stringify(scan)]);
  }
  async addSkip(owner: string, sk: Skip) {
    await this.update(owner, `jsonb_set(body, '{skipped}', COALESCE(body->'skipped', '[]'::jsonb) || jsonb_build_array($2::jsonb))`, [JSON.stringify(sk)]);
  }
  async addSeparate(owner: string, key: string) {
    await this.update(owner, `jsonb_set(body, '{separate}', COALESCE(body->'separate', '[]'::jsonb) || jsonb_build_array($2::text))`, [key]);
  }
  async dismiss(owner: string, userId: string, week: string) {
    await this.update(owner, `body || jsonb_build_object('dismissed', COALESCE(body->'dismissed', '{}'::jsonb) || jsonb_build_object($2::text, $3::text))`, [userId, week]);
  }
  async setAi(owner: string, groups: (AiGroup & { at: string })[]) {
    await this.update(owner, `body || jsonb_build_object('ai', $2::jsonb)`, [JSON.stringify(groups.slice(0, MAX_AI_GROUPS))]);
  }
  async putRun(r: CleanupRun) {
    await this.init();
    await this.q(`INSERT INTO cc_cleanup_runs (id, owner_user_id, at, body) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`, [r.id, r.owner, r.at, JSON.stringify(r)]);
  }
  async getRun(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_cleanup_runs WHERE id = $1`, [id]);
    return r[0] ? parse<CleanupRun>(r[0].body) : null;
  }
  async runs(owner: string, limit = 20) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_cleanup_runs WHERE owner_user_id = $1 ORDER BY at DESC LIMIT $2`, [owner, Math.max(1, Math.min(limit, 200))]);
    return r.map((x) => parse<CleanupRun>(x.body));
  }
}

let override: CleanupStore | null = null;
let neonStore: NeonCleanupStore | null = null;
const g = globalThis as unknown as { __lm8CleanupMemory?: MemoryCleanupStore };
const memory = (g.__lm8CleanupMemory ??= new MemoryCleanupStore());

export function setCleanupStoreForTests(s: CleanupStore | null) {
  override = s;
}

export function cleanupStore(): CleanupStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonCleanupStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
