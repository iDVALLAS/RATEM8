/**
 * lib/aicalls/store.ts — M8's loan-update calls (D58). SERVER-ONLY.
 * Neon table cc_ai_calls when DATABASE_URL is set, else memory. What the
 * client said is stored redacted (SSN, dates of birth, account numbers).
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type AiCallStatus = "queued" | "verifying" | "talking" | "done" | "voicemail" | "no-answer" | "busy" | "failed" | "wrong-person";

export type AiCall = {
  id: string;
  ownerUserId: string;
  contactId: string;
  contactName: string;
  phone: string;
  from: string;
  callSid: string | null;
  status: AiCallStatus;
  /** What happened, for the loan officer: "callback", "message", "stop" or "". */
  outcome: string;
  note: string;
  turns: { who: "m8" | "client"; text: string; at: string }[];
  /** Times we asked "am I speaking with…". */
  asked: number;
  at: string;
  endedAt: string | null;
};

export interface AiCallStore {
  get(id: string): Promise<AiCall | null>;
  put(c: AiCall): Promise<void>;
  forContact(contactId: string, limit?: number): Promise<AiCall[]>;
  forOwner(owner: string, limit?: number): Promise<AiCall[]>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryAiCallStore implements AiCallStore {
  private m = new Map<string, AiCall>();
  async get(id: string) {
    const x = this.m.get(id);
    return x ? clone(x) : null;
  }
  async put(c: AiCall) {
    this.m.set(c.id, clone(c));
  }
  async forContact(contactId: string, limit = 10) {
    return [...this.m.values()].filter((x) => x.contactId === contactId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
  }
  async forOwner(owner: string, limit = 50) {
    return [...this.m.values()].filter((x) => x.ownerUserId === owner).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

class NeonAiCallStore implements AiCallStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_ai_calls (id text PRIMARY KEY, owner_user_id text NOT NULL, contact_id text NOT NULL, at text NOT NULL, data jsonb NOT NULL)`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_ai_calls WHERE id = $1`, [id]);
    return r[0] ? parse<AiCall>(r[0].data) : null;
  }
  async put(c: AiCall) {
    await this.init();
    await this.q(`INSERT INTO cc_ai_calls (id, owner_user_id, contact_id, at, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [c.id, c.ownerUserId, c.contactId, c.at, JSON.stringify(c)]);
  }
  async forContact(contactId: string, limit = 10) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_ai_calls WHERE contact_id = $1 ORDER BY at DESC LIMIT $2`, [contactId, limit])).map((x) => parse<AiCall>(x.data));
  }
  async forOwner(owner: string, limit = 50) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_ai_calls WHERE owner_user_id = $1 ORDER BY at DESC LIMIT $2`, [owner, limit])).map((x) => parse<AiCall>(x.data));
  }
}

let override: AiCallStore | null = null;
let neonStore: NeonAiCallStore | null = null;
const g = globalThis as unknown as { __lm8AiCallMemory?: MemoryAiCallStore };
const memory = (g.__lm8AiCallMemory ??= new MemoryAiCallStore());
export const setAiCallStoreForTests = (s: AiCallStore | null) => void (override = s);
export const newMemoryAiCallStore = (): AiCallStore => new MemoryAiCallStore();
export function aiCallStore(): AiCallStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonAiCallStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
