/**
 * lib/mail/store.ts — each person's connected mailbox (D52). SERVER-ONLY.
 * Neon table cc_mailboxes when DATABASE_URL is set, else memory. Tokens are
 * stored sealed (lib/mail/seal.ts), never in the clear.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type MailProvider = "google" | "microsoft";
export type Mailbox = {
  userId: string;
  provider: MailProvider;
  email: string;
  refreshSealed: string;
  accessSealed: string | null;
  accessExpiresAt: string | null;
  connectedAt: string;
  /** "needs_reconnect" after the provider refuses the saved connection. */
  status: "connected" | "needs_reconnect";
  lastError: string;
  lastSentAt: string | null;
};

export interface MailboxStore {
  get(userId: string): Promise<Mailbox | null>;
  put(m: Mailbox): Promise<void>;
  remove(userId: string): Promise<void>;
}

class MemoryMailboxStore implements MailboxStore {
  private m = new Map<string, Mailbox>();
  async get(u: string) {
    const x = this.m.get(u);
    return x ? { ...x } : null;
  }
  async put(x: Mailbox) {
    this.m.set(x.userId, { ...x });
  }
  async remove(u: string) {
    this.m.delete(u);
  }
}
type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
class NeonMailboxStore implements MailboxStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_mailboxes (user_id text PRIMARY KEY, data jsonb NOT NULL, updated_at text NOT NULL)`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async get(u: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_mailboxes WHERE user_id = $1`, [u]);
    return r[0] ? ((typeof r[0].data === "string" ? JSON.parse(r[0].data) : r[0].data) as Mailbox) : null;
  }
  async put(x: Mailbox) {
    await this.init();
    await this.q(`INSERT INTO cc_mailboxes (user_id, data, updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [x.userId, JSON.stringify(x), new Date().toISOString()]);
  }
  async remove(u: string) {
    await this.init();
    await this.q(`DELETE FROM cc_mailboxes WHERE user_id = $1`, [u]);
  }
}
let override: MailboxStore | null = null;
let neonStore: NeonMailboxStore | null = null;
const g = globalThis as unknown as { __lm8MailboxMemory?: MemoryMailboxStore };
const memory = (g.__lm8MailboxMemory ??= new MemoryMailboxStore());
export const setMailboxStoreForTests = (s: MailboxStore | null) => void (override = s);
export const newMemoryMailboxStore = (): MailboxStore => new MemoryMailboxStore();
export function mailboxStore(): MailboxStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonMailboxStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
