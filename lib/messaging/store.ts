/**
 * lib/messaging/store.ts — every text, call and email in or out (D4).
 * SERVER-ONLY. Neon when DATABASE_URL is set, in memory otherwise.
 *
 * Message text is stored with SSNs, dates of birth and account numbers
 * removed (lib/m8/redact.ts), like chat transcripts.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { Channel, Purpose } from "@/lib/contacts/store";

export type Touch = {
  id: string;
  contactId: string;
  ownerUserId: string;
  channel: Channel;
  purpose: Purpose;
  direction: "out" | "in";
  body: string;
  /** queued, sent, delivered, undelivered, failed, received, blocked */
  status: string;
  providerId: string | null;
  /** The gate's basis (out) or what the system did (in: "opt-out recorded"). */
  note: string | null;
  at: string;
  actor: string;
};

/**
 * Numbers that replied STOP (or similar) to our texting number. Kept apart
 * from contacts so a revocation is honored even for someone imported later.
 */
export interface OptOutStore {
  optOut(phone: string, at: string, source: string): Promise<void>;
  clear(phone: string): Promise<void>;
  optedOut(phone: string): Promise<boolean>;
}

export interface TouchStore extends OptOutStore {
  add(t: Touch): Promise<void>;
  setStatus(providerId: string, status: string): Promise<void>;
  forContact(contactId: string, limit?: number): Promise<Touch[]>;
  /** Latest touch per contact, newest first. */
  threads(ownerUserId: string | undefined, limit?: number): Promise<Touch[]>;
  /** Marketing touches out to this contact since a time, by channel. */
  sentSince(contactId: string, since: string): Promise<Touch[]>;
}

export class MemoryTouchStore implements TouchStore {
  private rows: Touch[] = [];
  private outs = new Map<string, string>();
  async optOut(phone: string, at: string) {
    this.outs.set(phone, at);
  }
  async clear(phone: string) {
    this.outs.delete(phone);
  }
  async optedOut(phone: string) {
    return this.outs.has(phone);
  }
  async add(t: Touch) {
    this.rows.push({ ...t });
  }
  async setStatus(pid: string, status: string) {
    for (const r of this.rows) if (r.providerId === pid) r.status = status;
  }
  async forContact(id: string, limit = 100) {
    return this.rows.filter((r) => r.contactId === id).sort((a, b) => a.at.localeCompare(b.at)).slice(-limit);
  }
  async threads(owner: string | undefined, limit = 50) {
    const latest = new Map<string, Touch>();
    for (const r of this.rows) if (!owner || r.ownerUserId === owner) if (!latest.has(r.contactId) || latest.get(r.contactId)!.at < r.at) latest.set(r.contactId, r);
    return [...latest.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
  async sentSince(id: string, since: string) {
    return this.rows.filter((r) => r.contactId === id && r.direction === "out" && r.purpose === "marketing" && r.status !== "blocked" && r.at >= since);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const toTouch = (r: Row): Touch => ({
  id: r.id as string, contactId: r.contact_id as string, ownerUserId: r.owner_user_id as string, channel: r.channel as Channel, purpose: r.purpose as Purpose,
  direction: r.direction as Touch["direction"], body: r.body as string, status: r.status as string, providerId: (r.provider_id as string | null) ?? null,
  note: (r.note as string | null) ?? null, at: new Date(r.at as string).toISOString(), actor: r.actor as string,
});

export class NeonTouchStore implements TouchStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_touches (id text PRIMARY KEY, contact_id text NOT NULL, owner_user_id text NOT NULL, channel text NOT NULL, purpose text NOT NULL, direction text NOT NULL, body text NOT NULL, status text NOT NULL, provider_id text, note text, at timestamptz NOT NULL, actor text NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_touches_contact ON cc_touches (contact_id, at)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_touches_owner ON cc_touches (owner_user_id, at DESC)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_touches_provider ON cc_touches (provider_id)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_optouts (phone text PRIMARY KEY, at timestamptz NOT NULL, source text NOT NULL)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async optOut(phone: string, at: string, source: string) {
    await this.init();
    await this.q(`INSERT INTO cc_optouts (phone, at, source) VALUES ($1,$2,$3) ON CONFLICT (phone) DO UPDATE SET at = EXCLUDED.at, source = EXCLUDED.source`, [phone, at, source]);
  }
  async clear(phone: string) {
    await this.init();
    await this.q(`DELETE FROM cc_optouts WHERE phone = $1`, [phone]);
  }
  async optedOut(phone: string) {
    await this.init();
    return (await this.q(`SELECT 1 FROM cc_optouts WHERE phone = $1`, [phone])).length > 0;
  }
  async add(t: Touch) {
    await this.init();
    await this.q(`INSERT INTO cc_touches VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [t.id, t.contactId, t.ownerUserId, t.channel, t.purpose, t.direction, t.body, t.status, t.providerId, t.note, t.at, t.actor]);
  }
  async setStatus(pid: string, status: string) {
    await this.init();
    await this.q(`UPDATE cc_touches SET status = $2 WHERE provider_id = $1`, [pid, status]);
  }
  async forContact(id: string, limit = 100) {
    await this.init();
    return (await this.q(`SELECT * FROM (SELECT * FROM cc_touches WHERE contact_id = $1 ORDER BY at DESC LIMIT $2) t ORDER BY at`, [id, limit])).map(toTouch);
  }
  async threads(owner: string | undefined, limit = 50) {
    await this.init();
    const r = owner
      ? await this.q(`SELECT DISTINCT ON (contact_id) * FROM cc_touches WHERE owner_user_id = $1 ORDER BY contact_id, at DESC`, [owner])
      : await this.q(`SELECT DISTINCT ON (contact_id) * FROM cc_touches ORDER BY contact_id, at DESC`);
    return r.map(toTouch).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
  async sentSince(id: string, since: string) {
    await this.init();
    return (await this.q(`SELECT * FROM cc_touches WHERE contact_id = $1 AND direction = 'out' AND purpose = 'marketing' AND status <> 'blocked' AND at >= $2`, [id, since])).map(toTouch);
  }
}

let override: TouchStore | null = null;
let neonStore: NeonTouchStore | null = null;
const g = globalThis as unknown as { __lm8TouchMemory?: MemoryTouchStore };
const memory = (g.__lm8TouchMemory ??= new MemoryTouchStore());

export function setTouchStoreForTests(s: TouchStore | null) {
  override = s;
}

export function touchStore(): TouchStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonTouchStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
