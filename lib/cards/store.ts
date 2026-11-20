/**
 * lib/cards/store.ts — Thanks.io connections and card orders (D53).
 * SERVER-ONLY. Neon tables cc_card_accounts and cc_card_orders when
 * DATABASE_URL is set, else memory. Tokens are stored sealed.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type CardAccount = {
  userId: string;
  refreshSealed: string;
  accessSealed: string | null;
  accessExpiresAt: string | null;
  connectedAt: string;
  status: "connected" | "needs_reconnect";
  lastError: string;
};

export type CardKind = "notecard" | "postcard";
export type PostcardSize = "4x6" | "6x9";
export type Skipped = { contactId: string; name: string; reason: string };

export type CardOrder = {
  id: string;
  ownerUserId: string;
  kind: CardKind;
  size: PostcardSize | null;
  imageTemplateId: number;
  imageUrl: string;
  styleId: number | null;
  /** As the loan officer wrote it (with {first}). */
  message: string;
  /** What goes to Thanks.io: fields filled, %FIRST_NAME%, and the sign-off. */
  finalMessage: string;
  contactIds: string[];
  skipped: Skipped[];
  estimateCents: number;
  balanceCents: number | null;
  coveredByBalance: boolean | null;
  testMode: boolean;
  status: "draft" | "sending" | "sent" | "failed" | "discarded";
  orderId: number | null;
  error: string;
  createdAt: string;
  sentAt: string | null;
};

export interface CardStore {
  account(userId: string): Promise<CardAccount | null>;
  putAccount(a: CardAccount): Promise<void>;
  removeAccount(userId: string): Promise<void>;
  order(id: string): Promise<CardOrder | null>;
  putOrder(o: CardOrder): Promise<void>;
  ordersFor(ownerUserId: string, limit?: number): Promise<CardOrder[]>;
  /** Sent orders that included this person, newest first. */
  ordersForContact(contactId: string, limit?: number): Promise<CardOrder[]>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryCardStore implements CardStore {
  private a = new Map<string, CardAccount>();
  private o = new Map<string, CardOrder>();
  async account(u: string) {
    const x = this.a.get(u);
    return x ? clone(x) : null;
  }
  async putAccount(x: CardAccount) {
    this.a.set(x.userId, clone(x));
  }
  async removeAccount(u: string) {
    this.a.delete(u);
  }
  async order(id: string) {
    const x = this.o.get(id);
    return x ? clone(x) : null;
  }
  async putOrder(x: CardOrder) {
    this.o.set(x.id, clone(x));
  }
  async ordersFor(owner: string, limit = 50) {
    return [...this.o.values()].filter((x) => x.ownerUserId === owner && x.status !== "discarded").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone);
  }
  async ordersForContact(contactId: string, limit = 20) {
    return [...this.o.values()].filter((x) => x.status === "sent" && x.contactIds.includes(contactId)).sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "")).slice(0, limit).map(clone);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
class NeonCardStore implements CardStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= Promise.all([
      this.q(`CREATE TABLE IF NOT EXISTS cc_card_accounts (user_id text PRIMARY KEY, data jsonb NOT NULL, updated_at text NOT NULL)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_card_orders (id text PRIMARY KEY, owner_user_id text NOT NULL, status text NOT NULL, created_at text NOT NULL, data jsonb NOT NULL)`),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async account(u: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_card_accounts WHERE user_id = $1`, [u]);
    return r[0] ? parse<CardAccount>(r[0].data) : null;
  }
  async putAccount(x: CardAccount) {
    await this.init();
    await this.q(`INSERT INTO cc_card_accounts (user_id, data, updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [x.userId, JSON.stringify(x), new Date().toISOString()]);
  }
  async removeAccount(u: string) {
    await this.init();
    await this.q(`DELETE FROM cc_card_accounts WHERE user_id = $1`, [u]);
  }
  async order(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_card_orders WHERE id = $1`, [id]);
    return r[0] ? parse<CardOrder>(r[0].data) : null;
  }
  async putOrder(x: CardOrder) {
    await this.init();
    await this.q(`INSERT INTO cc_card_orders (id, owner_user_id, status, created_at, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data`, [x.id, x.ownerUserId, x.status, x.createdAt, JSON.stringify(x)]);
  }
  async ordersFor(owner: string, limit = 50) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_card_orders WHERE owner_user_id = $1 AND status <> 'discarded' ORDER BY created_at DESC LIMIT $2`, [owner, limit]);
    return r.map((x) => parse<CardOrder>(x.data));
  }
  async ordersForContact(contactId: string, limit = 20) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_card_orders WHERE status = 'sent' AND data->'contactIds' ? $1 ORDER BY created_at DESC LIMIT $2`, [contactId, limit]);
    return r.map((x) => parse<CardOrder>(x.data));
  }
}

let override: CardStore | null = null;
let neonStore: NeonCardStore | null = null;
const g = globalThis as unknown as { __lm8CardMemory?: MemoryCardStore };
const memory = (g.__lm8CardMemory ??= new MemoryCardStore());
export const setCardStoreForTests = (s: CardStore | null) => void (override = s);
export const newMemoryCardStore = (): CardStore => new MemoryCardStore();
export function cardStore(): CardStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonCardStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
