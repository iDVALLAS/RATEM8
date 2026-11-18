/**
 * lib/concierge/store.ts — the Concierge's state (D8). SERVER-ONLY.
 * Neon when DATABASE_URL is set (tables made on first use), memory otherwise.
 *
 *  - settings: per loan officer, what the Concierge may do on its own.
 *  - proposals: drafts and suggestions waiting for the loan officer.
 *  - tasks: reminders the Concierge set ("call Ann about the remodel").
 *  - memory: facts a client stated themselves, with the quote they came
 *    from, an expiry, and who can delete them. Never protected traits.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { Purpose } from "@/lib/contacts/store";

export type ConciergeSettings = {
  ownerUserId: string;
  enabled: boolean;
  /** How texts are handled: always a draft for approval in v1 (auto-send waits for counsel). */
  texts: "approve";
  /** Remember facts clients state, and set reminders, without asking each time. */
  memory: boolean;
  tasks: boolean;
  /** How the loan officer likes to sound (their words), used for drafts. */
  voice: string;
  updatedAt: string;
};

export const defaultSettings = (ownerUserId: string): ConciergeSettings => ({ ownerUserId, enabled: false, texts: "approve", memory: true, tasks: true, voice: "", updatedAt: "" });

export type Proposal = {
  id: string;
  ownerUserId: string;
  contactId: string;
  kind: "text";
  purpose: Purpose;
  body: string;
  why: string;
  /** "model" when drafted by the AI, "template" when written from a rule. */
  source: "model" | "template";
  status: "pending" | "sent" | "dismissed" | "blocked";
  /** The send gate's answer when it was drafted. */
  gate: { allowed: boolean; reason: string | null };
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

export type Task = { id: string; ownerUserId: string; contactId: string; title: string; why: string; due: string | null; done: boolean; createdAt: string };

export const MEMORY_KINDS = ["need", "plan", "preference", "timing", "relationship"] as const;
export type MemoryNote = {
  id: string;
  ownerUserId: string;
  contactId: string;
  kind: (typeof MEMORY_KINDS)[number];
  fact: string;
  /** The client's own words it came from, and where. */
  quote: string;
  source: string;
  expiresAt: string | null;
  createdAt: string;
};

export interface ConciergeStore {
  settings(owner: string): Promise<ConciergeSettings>;
  putSettings(s: ConciergeSettings): Promise<void>;
  enabledOwners(): Promise<string[]>;
  putProposal(p: Proposal): Promise<void>;
  proposal(id: string): Promise<Proposal | null>;
  proposals(owner: string, status?: Proposal["status"]): Promise<Proposal[]>;
  putTask(t: Task): Promise<void>;
  tasks(owner: string, open?: boolean): Promise<Task[]>;
  addMemory(m: MemoryNote): Promise<void>;
  memory(contactId: string, now: string): Promise<MemoryNote[]>;
  deleteMemory(owner: string, id: string): Promise<void>;
}

export class MemoryConciergeStore implements ConciergeStore {
  private s = new Map<string, ConciergeSettings>();
  private p = new Map<string, Proposal>();
  private t = new Map<string, Task>();
  private m = new Map<string, MemoryNote>();
  async settings(owner: string) {
    return structuredClone(this.s.get(owner) ?? defaultSettings(owner));
  }
  async putSettings(x: ConciergeSettings) {
    this.s.set(x.ownerUserId, structuredClone(x));
  }
  async enabledOwners() {
    return [...this.s.values()].filter((x) => x.enabled).map((x) => x.ownerUserId);
  }
  async putProposal(x: Proposal) {
    this.p.set(x.id, structuredClone(x));
  }
  async proposal(id: string) {
    const x = this.p.get(id);
    return x ? structuredClone(x) : null;
  }
  async proposals(owner: string, status?: Proposal["status"]) {
    return [...this.p.values()].filter((x) => x.ownerUserId === owner && (!status || x.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => structuredClone(x));
  }
  async putTask(x: Task) {
    this.t.set(x.id, structuredClone(x));
  }
  async tasks(owner: string, open = true) {
    return [...this.t.values()].filter((x) => x.ownerUserId === owner && (!open || !x.done)).sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
  }
  async addMemory(x: MemoryNote) {
    this.m.set(x.id, structuredClone(x));
  }
  async memory(contactId: string, now: string) {
    return [...this.m.values()].filter((x) => x.contactId === contactId && (!x.expiresAt || x.expiresAt > now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteMemory(owner: string, id: string) {
    if (this.m.get(id)?.ownerUserId === owner) this.m.delete(id);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const body = <T>(r: Row) => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as T;

/** Each record is a JSON body plus the columns used to find it. */
export class NeonConciergeStore implements ConciergeStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_concierge_settings (owner_user_id text PRIMARY KEY, enabled boolean NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_concierge_proposals (id text PRIMARY KEY, owner_user_id text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_concierge_proposals_owner ON cc_concierge_proposals (owner_user_id, status, created_at DESC)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_concierge_tasks (id text PRIMARY KEY, owner_user_id text NOT NULL, done boolean NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_concierge_memory (id text PRIMARY KEY, owner_user_id text NOT NULL, contact_id text NOT NULL, expires_at timestamptz, created_at timestamptz NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_concierge_memory_contact ON cc_concierge_memory (contact_id)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async settings(owner: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_concierge_settings WHERE owner_user_id = $1`, [owner]);
    return r[0] ? body<ConciergeSettings>(r[0]) : defaultSettings(owner);
  }
  async putSettings(x: ConciergeSettings) {
    await this.init();
    await this.q(`INSERT INTO cc_concierge_settings (owner_user_id, enabled, body) VALUES ($1,$2,$3) ON CONFLICT (owner_user_id) DO UPDATE SET enabled = EXCLUDED.enabled, body = EXCLUDED.body`, [x.ownerUserId, x.enabled, JSON.stringify(x)]);
  }
  async enabledOwners() {
    await this.init();
    return (await this.q(`SELECT owner_user_id FROM cc_concierge_settings WHERE enabled`)).map((r) => r.owner_user_id as string);
  }
  async putProposal(x: Proposal) {
    await this.init();
    await this.q(`INSERT INTO cc_concierge_proposals (id, owner_user_id, status, created_at, body) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, body = EXCLUDED.body`, [x.id, x.ownerUserId, x.status, x.createdAt, JSON.stringify(x)]);
  }
  async proposal(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_concierge_proposals WHERE id = $1`, [id]);
    return r[0] ? body<Proposal>(r[0]) : null;
  }
  async proposals(owner: string, status?: Proposal["status"]) {
    await this.init();
    const r = status ? await this.q(`SELECT body FROM cc_concierge_proposals WHERE owner_user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 200`, [owner, status]) : await this.q(`SELECT body FROM cc_concierge_proposals WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 200`, [owner]);
    return r.map((x) => body<Proposal>(x));
  }
  async putTask(x: Task) {
    await this.init();
    await this.q(`INSERT INTO cc_concierge_tasks (id, owner_user_id, done, body) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET done = EXCLUDED.done, body = EXCLUDED.body`, [x.id, x.ownerUserId, x.done, JSON.stringify(x)]);
  }
  async tasks(owner: string, open = true) {
    await this.init();
    const r = open ? await this.q(`SELECT body FROM cc_concierge_tasks WHERE owner_user_id = $1 AND NOT done`, [owner]) : await this.q(`SELECT body FROM cc_concierge_tasks WHERE owner_user_id = $1`, [owner]);
    return r.map((x) => body<Task>(x)).sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
  }
  async addMemory(x: MemoryNote) {
    await this.init();
    await this.q(`INSERT INTO cc_concierge_memory (id, owner_user_id, contact_id, expires_at, created_at, body) VALUES ($1,$2,$3,$4,$5,$6)`, [x.id, x.ownerUserId, x.contactId, x.expiresAt, x.createdAt, JSON.stringify(x)]);
  }
  async memory(contactId: string, now: string) {
    await this.init();
    return (await this.q(`SELECT body FROM cc_concierge_memory WHERE contact_id = $1 AND (expires_at IS NULL OR expires_at > $2) ORDER BY created_at DESC`, [contactId, now])).map((x) => body<MemoryNote>(x));
  }
  async deleteMemory(owner: string, id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_concierge_memory WHERE owner_user_id = $1 AND id = $2`, [owner, id]);
  }
}

let override: ConciergeStore | null = null;
let neonStore: NeonConciergeStore | null = null;
const g = globalThis as unknown as { __lm8ConciergeMemory?: MemoryConciergeStore };
const memory = (g.__lm8ConciergeMemory ??= new MemoryConciergeStore());

export function setConciergeStoreForTests(s: ConciergeStore | null) {
  override = s;
}

export function conciergeStore(): ConciergeStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonConciergeStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
