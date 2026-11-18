/**
 * lib/scripts/store.ts — scripts the builder made, and how each call went
 * (D9). SERVER-ONLY. Neon when DATABASE_URL is set (table made on first
 * use), in memory otherwise.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { Script } from "./script";

export const OUTCOMES = ["reached", "voicemail", "no_answer", "booked", "not_now", "asked_to_stop"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABELS: Record<Outcome, string> = { reached: "Talked", voicemail: "Left a voicemail", no_answer: "No answer", booked: "Set a next step", not_now: "Not interested now", asked_to_stop: "Asked not to be contacted" };

export type SavedScript = {
  id: string;
  ownerUserId: string;
  /** null for a practice script built from a described situation. */
  contactId: string | null;
  contactName: string;
  script: Script;
  createdAt: string;
  outcome: { result: Outcome; helpful: boolean | null; note: string; at: string } | null;
};

export interface ScriptStore {
  put(s: SavedScript): Promise<void>;
  get(id: string): Promise<SavedScript | null>;
  forContact(owner: string, contactId: string, limit?: number): Promise<SavedScript[]>;
  recent(owner: string, limit?: number): Promise<SavedScript[]>;
}

export class MemoryScriptStore implements ScriptStore {
  private rows = new Map<string, SavedScript>();
  async put(s: SavedScript) {
    this.rows.set(s.id, structuredClone(s));
  }
  async get(id: string) {
    const s = this.rows.get(id);
    return s ? structuredClone(s) : null;
  }
  async forContact(owner: string, contactId: string, limit = 5) {
    return (await this.recent(owner, 1000)).filter((s) => s.contactId === contactId).slice(0, limit);
  }
  async recent(owner: string, limit = 20) {
    return [...this.rows.values()].filter((s) => s.ownerUserId === owner).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((s) => structuredClone(s));
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const body = (r: Row) => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as SavedScript;

export class NeonScriptStore implements ScriptStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_scripts (id text PRIMARY KEY, owner_user_id text NOT NULL, contact_id text, created_at timestamptz NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_scripts_owner ON cc_scripts (owner_user_id, created_at DESC)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async put(s: SavedScript) {
    await this.init();
    await this.q(`INSERT INTO cc_scripts (id, owner_user_id, contact_id, created_at, body) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`, [s.id, s.ownerUserId, s.contactId, s.createdAt, JSON.stringify(s)]);
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_scripts WHERE id = $1`, [id]);
    return r[0] ? body(r[0]) : null;
  }
  async forContact(owner: string, contactId: string, limit = 5) {
    await this.init();
    return (await this.q(`SELECT body FROM cc_scripts WHERE owner_user_id = $1 AND contact_id = $2 ORDER BY created_at DESC LIMIT $3`, [owner, contactId, limit])).map(body);
  }
  async recent(owner: string, limit = 20) {
    await this.init();
    return (await this.q(`SELECT body FROM cc_scripts WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT $2`, [owner, limit])).map(body);
  }
}

let override: ScriptStore | null = null;
let neonStore: NeonScriptStore | null = null;
const g = globalThis as unknown as { __lm8ScriptMemory?: MemoryScriptStore };
const memory = (g.__lm8ScriptMemory ??= new MemoryScriptStore());

export function setScriptStoreForTests(s: ScriptStore | null) {
  override = s;
}

export function scriptStore(): ScriptStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonScriptStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
