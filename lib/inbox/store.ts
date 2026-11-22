/**
 * lib/inbox/store.ts — Done and Snooze on Inbox conversations (D79).
 * SERVER-ONLY. Neon table cc_inbox_marks when DATABASE_URL is set, else
 * memory. One row per person (a conversation is one person's messages);
 * reads are always for one book's people.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { InboxMark } from "./state";

export interface InboxStore {
  get(contactId: string): Promise<InboxMark | null>;
  /** Marks for these people (missing ones are left out). */
  many(contactIds: string[]): Promise<InboxMark[]>;
  put(m: InboxMark): Promise<void>;
  /** D77-style merges and deletes: the mark goes with the person. */
  remove(contactId: string): Promise<void>;
}

export class MemoryInboxStore implements InboxStore {
  private m = new Map<string, InboxMark>();
  async get(id: string) {
    const x = this.m.get(id);
    return x ? { ...x } : null;
  }
  async many(ids: string[]) {
    return ids.flatMap((id) => (this.m.has(id) ? [{ ...this.m.get(id)! }] : []));
  }
  async put(x: InboxMark) {
    this.m.set(x.contactId, { ...x });
  }
  async remove(id: string) {
    this.m.delete(id);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
const toMark = (r: Row): InboxMark => ({ contactId: String(r.contact_id), ownerUserId: String(r.owner_user_id), doneAt: iso(r.done_at), snoozedAt: iso(r.snoozed_at), snoozeUntil: iso(r.snooze_until), by: String(r.by_user), updatedAt: iso(r.updated_at)! });

export class NeonInboxStore implements InboxStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_inbox_marks (contact_id text PRIMARY KEY, owner_user_id text NOT NULL, done_at timestamptz, snoozed_at timestamptz, snooze_until timestamptz, by_user text NOT NULL, updated_at timestamptz NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_inbox_marks_owner ON cc_inbox_marks (owner_user_id)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_inbox_marks WHERE contact_id = $1`, [id]);
    return r[0] ? toMark(r[0]) : null;
  }
  async many(ids: string[]) {
    if (!ids.length) return [];
    await this.init();
    return (await this.q(`SELECT * FROM cc_inbox_marks WHERE contact_id = ANY($1::text[])`, [ids])).map(toMark);
  }
  async put(m: InboxMark) {
    await this.init();
    await this.q(
      `INSERT INTO cc_inbox_marks (contact_id, owner_user_id, done_at, snoozed_at, snooze_until, by_user, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (contact_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, done_at = EXCLUDED.done_at, snoozed_at = EXCLUDED.snoozed_at, snooze_until = EXCLUDED.snooze_until, by_user = EXCLUDED.by_user, updated_at = EXCLUDED.updated_at`,
      [m.contactId, m.ownerUserId, m.doneAt, m.snoozedAt, m.snoozeUntil, m.by, m.updatedAt],
    );
  }
  async remove(id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_inbox_marks WHERE contact_id = $1`, [id]);
  }
}

let override: InboxStore | null = null;
let neonStore: NeonInboxStore | null = null;
const g = globalThis as unknown as { __lm8InboxMemory?: MemoryInboxStore };
const memory = (g.__lm8InboxMemory ??= new MemoryInboxStore());

export const setInboxStoreForTests = (s: InboxStore | null) => void (override = s);

export function inboxStore(): InboxStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonInboxStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
