/**
 * lib/messaging/store.ts — every text, call and email in or out (D4).
 * SERVER-ONLY. Neon when DATABASE_URL is set, in memory otherwise.
 *
 * Message text is stored with SSNs, dates of birth and account numbers
 * removed (lib/m8/redact.ts), like chat transcripts.
 */
import { createHash } from "node:crypto";
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
  /** D6: the contact's number, and our number that sent or received it (Twilio "From"/"To"). */
  phone?: string | null;
  sender?: string | null;
  /** The gate's basis (out) or what the system did (in: "opt-out recorded"). */
  note: string | null;
  at: string;
  actor: string;
  /** D8.1: who wrote an outbound message. Only "human" (or missing) is shown to a model as the loan officer's own words. */
  origin?: "human" | "concierge" | "template" | "campaign" | "agent";
};

/**
 * Numbers that replied STOP (or similar), per our number they replied to.
 * D6 (overnight review): one-way. A STOP to any of our numbers blocks that
 * phone everywhere; a START clears only the entry for the number it was
 * sent to, so it can never cancel a STOP given to another sender. Phones
 * are stored hashed.
 */
export interface OptOutStore {
  optOut(phone: string, sender: string, at: string, source: string): Promise<void>;
  clear(phone: string, sender: string): Promise<void>;
  optedOut(phone: string): Promise<boolean>;
}

export const phoneHash = (p: string) => createHash("sha256").update(`lm8-optout:${p}`).digest("hex");

/**
 * D87.3: the most touches one `since`/`sincePage` call returns, in both stores. Neon has always stopped
 * here (D27's `LIMIT 5000`); the memory store now does too, so tests and browser QA see what production does.
 */
export const TOUCH_PAGE_MAX = 5_000;
/** D87.3: the most touches `allSince` reads for one caller unless it asks for fewer. */
export const TOUCH_CAP = 50_000;

/**
 * D87.3: where a keyset page stopped: the last row's `at` and id. In Neon `at` is the stored value to the
 * microsecond (a touch's own `at` is rounded to the millisecond), so a page never repeats or skips a row.
 */
export type TouchCursor = { at: string; id: string };
export type TouchPage = { touches: Touch[]; next: TouchCursor | null };

const pageLimit = (limit: number | undefined) => Math.max(1, Math.min(Math.floor(limit ?? TOUCH_PAGE_MAX), TOUCH_PAGE_MAX));
/** Newest first, then id descending: the one order both stores page in. */
const newestFirst = (a: Touch, b: Touch) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export interface TouchStore extends OptOutStore {
  add(t: Touch): Promise<void>;
  setStatus(providerId: string, status: string): Promise<void>;
  forContact(contactId: string, limit?: number): Promise<Touch[]>;
  /** Latest touch per contact, newest first. */
  threads(ownerUserId: string | undefined, limit?: number): Promise<Touch[]>;
  /** Marketing touches out to this contact since a time, by channel. */
  sentSince(contactId: string, since: string): Promise<Touch[]>;
  /**
   * D27: one loan officer's touches since a time, newest first (`at`, then id). D87.3: at most
   * TOUCH_PAGE_MAX in both stores. To read everything use `allSince` (below).
   */
  since(ownerUserId: string, since: string): Promise<Touch[]>;
  /**
   * D87.3: one keyset page of one loan officer's touches with `since <= at < until`, newest first
   * (`at` DESC, id DESC), strictly after `after` in that order. At most TOUCH_PAGE_MAX rows, whatever
   * `limit` asks. `next` is the cursor for the following page, or null when this page was the last.
   */
  sincePage(ownerUserId: string, since: string, opts?: { until?: string; after?: TouchCursor | null; limit?: number }): Promise<TouchPage>;
  /** D6: loan officers who have texted this phone from this sender number. */
  ownersWhoTexted(phone: string, sender: string): Promise<string[]>;
  /** D77: a merge moves one record's messages onto the record kept (same book). Returns how many moved. */
  moveContact(fromId: string, toId: string): Promise<number>;
}

export class MemoryTouchStore implements TouchStore {
  private rows: Touch[] = [];
  private outs = new Map<string, string>();
  async optOut(phone: string, sender: string, at: string) {
    this.outs.set(`${phoneHash(phone)}|${sender}`, at);
  }
  async clear(phone: string, sender: string) {
    this.outs.delete(`${phoneHash(phone)}|${sender}`);
  }
  async optedOut(phone: string) {
    const h = `${phoneHash(phone)}|`;
    return [...this.outs.keys()].some((k) => k.startsWith(h));
  }
  async ownersWhoTexted(phone: string, sender: string) {
    return [...new Set(this.rows.filter((r) => r.direction === "out" && r.phone === phone && r.sender === sender).map((r) => r.ownerUserId))];
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
  async since(owner: string, since: string) {
    return (await this.sincePage(owner, since)).touches;
  }
  async sincePage(owner: string, since: string, opts: { until?: string; after?: TouchCursor | null; limit?: number } = {}) {
    const lim = pageLimit(opts.limit);
    const a = opts.after ?? null;
    const rows = this.rows
      .filter((r) => r.ownerUserId === owner && r.at >= since && (opts.until === undefined || r.at < opts.until) && (!a || r.at < a.at || (r.at === a.at && r.id < a.id)))
      .sort(newestFirst)
      .slice(0, lim)
      .map((r) => ({ ...r }));
    const last = rows[rows.length - 1];
    return { touches: rows, next: rows.length === lim && last ? { at: last.at, id: last.id } : null };
  }
  async moveContact(from: string, to: string) {
    let n = 0;
    for (const r of this.rows) {
      if (r.contactId !== from) continue;
      r.contactId = to;
      n++;
    }
    return n;
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const toTouch = (r: Row): Touch => ({
  id: r.id as string, contactId: r.contact_id as string, ownerUserId: r.owner_user_id as string, channel: r.channel as Channel, purpose: r.purpose as Purpose,
  direction: r.direction as Touch["direction"], body: r.body as string, status: r.status as string, providerId: (r.provider_id as string | null) ?? null,
  note: (r.note as string | null) ?? null, at: new Date(r.at as string).toISOString(), actor: r.actor as string,
  phone: (r.phone as string | null) ?? null, sender: (r.sender as string | null) ?? null,
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
        await this.q(`ALTER TABLE cc_touches ADD COLUMN IF NOT EXISTS phone text`);
        await this.q(`ALTER TABLE cc_touches ADD COLUMN IF NOT EXISTS sender text`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_touches_phone ON cc_touches (phone, sender)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_optouts_v2 (phone_hash text NOT NULL, sender text NOT NULL, at timestamptz NOT NULL, source text NOT NULL, PRIMARY KEY (phone_hash, sender))`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async optOut(phone: string, sender: string, at: string, source: string) {
    await this.init();
    await this.q(`INSERT INTO cc_optouts_v2 (phone_hash, sender, at, source) VALUES ($1,$2,$3,$4) ON CONFLICT (phone_hash, sender) DO UPDATE SET at = EXCLUDED.at, source = EXCLUDED.source`, [phoneHash(phone), sender, at, source]);
  }
  async clear(phone: string, sender: string) {
    await this.init();
    await this.q(`DELETE FROM cc_optouts_v2 WHERE phone_hash = $1 AND sender = $2`, [phoneHash(phone), sender]);
  }
  async optedOut(phone: string) {
    await this.init();
    return (await this.q(`SELECT 1 FROM cc_optouts_v2 WHERE phone_hash = $1 LIMIT 1`, [phoneHash(phone)])).length > 0;
  }
  async ownersWhoTexted(phone: string, sender: string) {
    await this.init();
    return (await this.q(`SELECT DISTINCT owner_user_id FROM cc_touches WHERE direction = 'out' AND phone = $1 AND sender = $2`, [phone, sender])).map((r) => r.owner_user_id as string);
  }
  async add(t: Touch) {
    await this.init();
    await this.q(`INSERT INTO cc_touches (id, contact_id, owner_user_id, channel, purpose, direction, body, status, provider_id, note, at, actor, phone, sender) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [t.id, t.contactId, t.ownerUserId, t.channel, t.purpose, t.direction, t.body, t.status, t.providerId, t.note, t.at, t.actor, t.phone ?? null, t.sender ?? null]);
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
  async since(owner: string, since: string) {
    return (await this.sincePage(owner, since)).touches;
  }
  async sincePage(owner: string, since: string, opts: { until?: string; after?: TouchCursor | null; limit?: number } = {}) {
    await this.init();
    const lim = pageLimit(opts.limit);
    // Every value is a bound parameter; only the placeholder numbers are built here.
    const p: unknown[] = [owner, since];
    let w = `owner_user_id = $1 AND at >= $2::timestamptz`;
    if (opts.until !== undefined) {
      p.push(opts.until);
      w += ` AND at < $${p.length}::timestamptz`;
    }
    if (opts.after) {
      p.push(opts.after.at, opts.after.id);
      w += ` AND (at, id) < ($${p.length - 1}::timestamptz, $${p.length}::text)`;
    }
    p.push(lim);
    const rows = await this.q(
      `SELECT *, to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_key FROM cc_touches WHERE ${w} ORDER BY at DESC, id DESC LIMIT $${p.length}`,
      p,
    );
    const last = rows[rows.length - 1];
    return { touches: rows.map(toTouch), next: rows.length === lim && last ? { at: last.at_key as string, id: last.id as string } : null };
  }
  async moveContact(from: string, to: string) {
    await this.init();
    const r = await this.q(`WITH u AS (UPDATE cc_touches SET contact_id = $2 WHERE contact_id = $1 RETURNING 1) SELECT count(*)::int AS n FROM u`, [from, to]);
    return Number(r[0]?.n ?? 0);
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

/** D87.3: what `allSince` read. `capped` means the cap stopped it while older touches were still there. */
export type AllTouches = { touches: Touch[]; capped: boolean };

/**
 * D87.3: every touch in one loan officer's book with `since <= at < until`, newest first, read
 * TOUCH_PAGE_MAX at a time by keyset (`at`, then id) until the range ends or `cap` is reached
 * (TOUCH_CAP at most). Own book only: every page is scoped to `ownerUserId`. When the cap stops it,
 * the newest `cap` are kept and `capped` is true (a one-row check, so exactly `cap` touches is not capped).
 */
export async function allSince(ownerUserId: string, since: string, opts: { until?: string; cap?: number; store?: TouchStore } = {}): Promise<AllTouches> {
  const store = opts.store ?? touchStore();
  const cap = Math.max(1, Math.min(Math.floor(opts.cap ?? TOUCH_CAP), TOUCH_CAP));
  const out: Touch[] = [];
  const seen = new Set<string>();
  let after: TouchCursor | null = null;
  for (;;) {
    const page: TouchPage = await store.sincePage(ownerUserId, since, { until: opts.until, after, limit: Math.min(TOUCH_PAGE_MAX, cap - out.length) });
    for (const t of page.touches) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    if (!page.next || page.touches.length === 0) return { touches: out, capped: false };
    after = page.next;
    if (out.length >= cap) {
      const more = await store.sincePage(ownerUserId, since, { until: opts.until, after, limit: 1 });
      return { touches: out.slice(0, cap), capped: more.touches.length > 0 };
    }
  }
}
