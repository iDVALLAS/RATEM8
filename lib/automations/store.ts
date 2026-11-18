/**
 * lib/automations/store.ts — which recipes each loan officer turned on, and
 * what has already fired (D10). SERVER-ONLY. Neon when DATABASE_URL is set,
 * memory otherwise.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type AutomationSettings = { ownerUserId: string; enabled: string[]; updatedAt: string };
export type Firing = { key: string; ownerUserId: string; recipeId: string; contactId: string | null; loanId: string | null; outcome: string; at: string };

export interface AutomationStore {
  settings(owner: string): Promise<AutomationSettings>;
  putSettings(s: AutomationSettings): Promise<void>;
  owners(): Promise<string[]>;
  /** Records a firing once; false if this key already fired. */
  claim(f: Firing): Promise<boolean>;
  recent(owner: string, limit?: number): Promise<Firing[]>;
}

export class MemoryAutomationStore implements AutomationStore {
  private s = new Map<string, AutomationSettings>();
  private f = new Map<string, Firing>();
  async settings(owner: string) {
    return structuredClone(this.s.get(owner) ?? { ownerUserId: owner, enabled: [], updatedAt: "" });
  }
  async putSettings(x: AutomationSettings) {
    this.s.set(x.ownerUserId, structuredClone(x));
  }
  async owners() {
    return [...this.s.values()].filter((x) => x.enabled.length).map((x) => x.ownerUserId);
  }
  async claim(x: Firing) {
    if (this.f.has(x.key)) return false;
    this.f.set(x.key, structuredClone(x));
    return true;
  }
  async recent(owner: string, limit = 30) {
    return [...this.f.values()].filter((x) => x.ownerUserId === owner).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export class NeonAutomationStore implements AutomationStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_auto_settings (owner_user_id text PRIMARY KEY, body jsonb NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_auto_fired (key text PRIMARY KEY, owner_user_id text NOT NULL, at timestamptz NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_auto_fired_owner ON cc_auto_fired (owner_user_id, at DESC)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async settings(owner: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_auto_settings WHERE owner_user_id = $1`, [owner]);
    return r[0] ? ((typeof r[0].body === "string" ? JSON.parse(r[0].body) : r[0].body) as AutomationSettings) : { ownerUserId: owner, enabled: [], updatedAt: "" };
  }
  async putSettings(x: AutomationSettings) {
    await this.init();
    await this.q(`INSERT INTO cc_auto_settings (owner_user_id, body) VALUES ($1, $2) ON CONFLICT (owner_user_id) DO UPDATE SET body = EXCLUDED.body`, [x.ownerUserId, JSON.stringify(x)]);
  }
  async owners() {
    await this.init();
    return (await this.q(`SELECT owner_user_id FROM cc_auto_settings WHERE jsonb_array_length(body->'enabled') > 0`)).map((r) => r.owner_user_id as string);
  }
  async claim(x: Firing) {
    await this.init();
    const r = await this.q(`INSERT INTO cc_auto_fired (key, owner_user_id, at, body) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING RETURNING key`, [x.key, x.ownerUserId, x.at, JSON.stringify(x)]);
    return r.length > 0;
  }
  async recent(owner: string, limit = 30) {
    await this.init();
    return (await this.q(`SELECT body FROM cc_auto_fired WHERE owner_user_id = $1 ORDER BY at DESC LIMIT $2`, [owner, limit])).map((r) => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as Firing);
  }
}

let override: AutomationStore | null = null;
let neonStore: NeonAutomationStore | null = null;
const g = globalThis as unknown as { __lm8AutoMemory?: MemoryAutomationStore };
const memory = (g.__lm8AutoMemory ??= new MemoryAutomationStore());

export function setAutomationStoreForTests(s: AutomationStore | null) {
  override = s;
}

export function automationStore(): AutomationStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonAutomationStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
