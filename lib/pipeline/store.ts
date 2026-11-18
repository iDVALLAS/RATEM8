/**
 * lib/pipeline/store.ts — loans synced from the loan officer's POS/LOS
 * (D6). SERVER-ONLY. Neon when DATABASE_URL is set, in memory otherwise.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type KeyDates = { application: string | null; lockExpires: string | null; appraisal: string | null; clearToClose: string | null; closing: string | null };

export type Loan = {
  id: string;
  ownerUserId: string;
  /** The loan number in the loan officer's system. */
  externalId: string;
  source: string;
  contactId: string | null;
  borrowerName: string;
  purpose: string | null;
  loanType: string | null;
  amount: number | null;
  noteRate: number | null;
  /** The stage as the loan system names it. */
  milestone: string;
  milestoneAt: string;
  history: { milestone: string; at: string }[];
  keyDates: KeyDates;
  agentName: string | null;
  closed: boolean;
  dead: boolean;
  updatedAt: string;
};

export type PipelineKey = { hash: string; ownerUserId: string; label: string; createdAt: string };

export interface PipelineStore {
  byExternal(owner: string, externalId: string): Promise<Loan | null>;
  put(l: Loan): Promise<void>;
  list(owner: string | undefined): Promise<Loan[]>;
  putKey(k: PipelineKey): Promise<void>;
  keyOwner(hash: string): Promise<string | null>;
  keys(owner: string): Promise<PipelineKey[]>;
  deleteKey(owner: string, hash: string): Promise<void>;
}

export class MemoryPipelineStore implements PipelineStore {
  private loans = new Map<string, Loan>();
  private ks = new Map<string, PipelineKey>();
  async byExternal(owner: string, ext: string) {
    const l = [...this.loans.values()].find((x) => x.ownerUserId === owner && x.externalId === ext);
    return l ? structuredClone(l) : null;
  }
  async put(l: Loan) {
    this.loans.set(l.id, structuredClone(l));
  }
  async list(owner: string | undefined) {
    return [...this.loans.values()].filter((l) => !owner || l.ownerUserId === owner).map((l) => structuredClone(l)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async putKey(k: PipelineKey) {
    this.ks.set(k.hash, k);
  }
  async keyOwner(hash: string) {
    return this.ks.get(hash)?.ownerUserId ?? null;
  }
  async keys(owner: string) {
    return [...this.ks.values()].filter((k) => k.ownerUserId === owner);
  }
  async deleteKey(owner: string, hash: string) {
    if (this.ks.get(hash)?.ownerUserId === owner) this.ks.delete(hash);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const body = (r: Row) => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as Loan;

export class NeonPipelineStore implements PipelineStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_loans (id text PRIMARY KEY, owner_user_id text NOT NULL, external_id text NOT NULL, body jsonb NOT NULL, updated_at timestamptz NOT NULL, UNIQUE (owner_user_id, external_id))`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_pipeline_keys (hash text PRIMARY KEY, owner_user_id text NOT NULL, label text NOT NULL, created_at timestamptz NOT NULL)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async byExternal(owner: string, ext: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_loans WHERE owner_user_id = $1 AND external_id = $2`, [owner, ext]);
    return r[0] ? body(r[0]) : null;
  }
  async put(l: Loan) {
    await this.init();
    await this.q(`INSERT INTO cc_loans (id, owner_user_id, external_id, body, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`, [l.id, l.ownerUserId, l.externalId, JSON.stringify(l), l.updatedAt]);
  }
  async list(owner: string | undefined) {
    await this.init();
    const r = owner ? await this.q(`SELECT body FROM cc_loans WHERE owner_user_id = $1 ORDER BY updated_at DESC LIMIT 1000`, [owner]) : await this.q(`SELECT body FROM cc_loans ORDER BY updated_at DESC LIMIT 1000`);
    return r.map(body);
  }
  async putKey(k: PipelineKey) {
    await this.init();
    await this.q(`INSERT INTO cc_pipeline_keys (hash, owner_user_id, label, created_at) VALUES ($1,$2,$3,$4)`, [k.hash, k.ownerUserId, k.label, k.createdAt]);
  }
  async keyOwner(hash: string) {
    await this.init();
    return ((await this.q(`SELECT owner_user_id FROM cc_pipeline_keys WHERE hash = $1`, [hash]))[0]?.owner_user_id as string | undefined) ?? null;
  }
  async keys(owner: string) {
    await this.init();
    return (await this.q(`SELECT * FROM cc_pipeline_keys WHERE owner_user_id = $1 ORDER BY created_at`, [owner])).map((r) => ({ hash: r.hash as string, ownerUserId: r.owner_user_id as string, label: r.label as string, createdAt: new Date(r.created_at as string).toISOString() }));
  }
  async deleteKey(owner: string, hash: string) {
    await this.init();
    await this.q(`DELETE FROM cc_pipeline_keys WHERE owner_user_id = $1 AND hash = $2`, [owner, hash]);
  }
}

let override: PipelineStore | null = null;
let neonStore: NeonPipelineStore | null = null;
const g = globalThis as unknown as { __lm8PipelineMemory?: MemoryPipelineStore };
const memory = (g.__lm8PipelineMemory ??= new MemoryPipelineStore());

export function setPipelineStoreForTests(s: PipelineStore | null) {
  override = s;
}

export function pipelineStore(): PipelineStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonPipelineStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
