/**
 * lib/leads/events.ts — D83: the lead-event log. SERVER-ONLY.
 * Neon when DATABASE_URL is set (table made on first use), in memory otherwise.
 *
 * One event per delivered lead, so a vendor that sends someone you already
 * have still gets the lead counted (a "repeat"), while the contact keeps its
 * first source. Every delivery is a lead; repeats are a subset. Imported
 * leads (a file with a Lead source, owner decisions 4 and 5) get one event
 * each, dated by the file's own dates.
 *
 * No personal data: an event holds ids, the source, a time and two flags.
 * Deleting a contact keeps its events (the count stays true); merging two
 * contacts points the other record's events at the kept one. An undone
 * import takes back the events of the people it removed.
 *
 * Private to the loan officer, like their book and their spend. Never sent
 * to the AI (D85's pack will carry counts only).
 */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

/** Where an event came from: a delivery to the lead address, the log before D83 (audit rows and `lead:` contacts), or an import. */
export type EventOrigin = "delivery" | "history" | "import";
/**
 * What dates it (decision 5): the delivery itself; for an import, the file's
 * application date, else its closed or funded date, else (a lead-vendor file
 * only) the day of the import. "none": an import with no date of its own,
 * counted as a lead but in no period.
 */
export type DatedBy = "delivery" | "application" | "closed" | "import" | "none";

export type LeadEvent = {
  id: string;
  ownerUserId: string;
  /** `sourceKey()` of the vendor or Lead source. */
  sourceKey: string;
  /** The source as it was named at delivery ("Zillow"), for keys that aren't one of the named sources. */
  sourceLabel: string;
  contactId: string;
  at: string;
  /** The person was already in the book (merged into them). */
  duplicate: boolean;
  /**
   * "You can call": that delivery's consent wording named the loan officer or their company (frozen at delivery,
   * decision 1); for an imported lead, the import recorded the person's yes to texts or calls (D87.3, decision 6).
   */
  namesYou: boolean;
  /** The vendor's own lead id, when it sends one: a webhook retry with the same id is not a new event. */
  externalId: string | null;
  origin: EventOrigin;
  datedBy: DatedBy;
};

/** One id per delivery, the same whether the intake writes it or the backfill rebuilds it from the audit log. */
export const eventId = (owner: string, contactId: string, at: string) => `le_${createHash("sha256").update(`${owner}\n${contactId}\n${at}`).digest("base64url").slice(0, 22)}`;

export interface LeadEventStore {
  /** Adds the event unless one with its id, or with its owner, source and external id, is on file. True when added. */
  add(e: LeadEvent): Promise<boolean>;
  /** Several at once (the backfill); returns how many were added. */
  addMany(es: LeadEvent[]): Promise<number>;
  list(owner: string): Promise<LeadEvent[]>;
  count(owner: string): Promise<number>;
  /** D77 merge: the other record's events now belong to the kept one. */
  repoint(owner: string, fromContactId: string, toContactId: string): Promise<number>;
  /** D75 undo: an import's own events for a person it removed. */
  removeImported(owner: string, contactId: string): Promise<number>;
  /**
   * D87.3: the one-time re-read of imported leads' `namesYou` (owner decision 6). Only events of this owner
   * with origin "import" change; a delivered lead's `namesYou` stays frozen. Returns how many changed.
   */
  setImportedNamesYou(owner: string, changes: readonly { id: string; namesYou: boolean }[]): Promise<number>;
  /** The one-time backfill of the log before D83 (per owner). */
  marked(owner: string, mark: string): Promise<boolean>;
  mark(owner: string, mark: string, at: string): Promise<void>;
}

export class MemoryLeadEventStore implements LeadEventStore {
  private e = new Map<string, LeadEvent>();
  private marks = new Set<string>();
  async add(x: LeadEvent) {
    if (this.e.has(x.id)) return false;
    if (x.externalId && [...this.e.values()].some((o) => o.ownerUserId === x.ownerUserId && o.sourceKey === x.sourceKey && o.externalId === x.externalId)) return false;
    this.e.set(x.id, { ...x });
    return true;
  }
  async addMany(es: LeadEvent[]) {
    let n = 0;
    for (const x of es) if (await this.add(x)) n++;
    return n;
  }
  async list(owner: string) {
    return [...this.e.values()].filter((x) => x.ownerUserId === owner).map((x) => ({ ...x })).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  async count(owner: string) {
    return [...this.e.values()].filter((x) => x.ownerUserId === owner).length;
  }
  async repoint(owner: string, from: string, to: string) {
    let n = 0;
    for (const x of this.e.values()) if (x.ownerUserId === owner && x.contactId === from) {
      x.contactId = to;
      n++;
    }
    return n;
  }
  async removeImported(owner: string, contactId: string) {
    let n = 0;
    for (const [id, x] of this.e) if (x.ownerUserId === owner && x.contactId === contactId && x.origin === "import") {
      this.e.delete(id);
      n++;
    }
    return n;
  }
  async setImportedNamesYou(owner: string, changes: readonly { id: string; namesYou: boolean }[]) {
    let n = 0;
    for (const c of changes) {
      const x = this.e.get(c.id);
      if (!x || x.ownerUserId !== owner || x.origin !== "import" || x.namesYou === c.namesYou) continue;
      x.namesYou = c.namesYou;
      n++;
    }
    return n;
  }
  async marked(owner: string, mark: string) {
    return this.marks.has(`${owner}\n${mark}`);
  }
  async mark(owner: string, mark: string) {
    this.marks.add(`${owner}\n${mark}`);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export class NeonLeadEventStore implements LeadEventStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_lead_events (id text PRIMARY KEY, owner_user_id text NOT NULL, source_key text NOT NULL, source_label text NOT NULL, contact_id text NOT NULL, at timestamptz NOT NULL, duplicate boolean NOT NULL, names_you boolean NOT NULL, external_id text, origin text NOT NULL, dated_by text NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_lead_events_owner ON cc_lead_events (owner_user_id, at)`);
        // A webhook retry (same owner, source and the vendor's lead id) is not a new event.
        await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS cc_lead_events_external ON cc_lead_events (owner_user_id, source_key, external_id) WHERE external_id IS NOT NULL`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_lead_event_marks (owner_user_id text NOT NULL, mark text NOT NULL, at timestamptz NOT NULL, PRIMARY KEY (owner_user_id, mark))`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  private toEvent = (r: Row): LeadEvent => ({ id: r.id as string, ownerUserId: r.owner_user_id as string, sourceKey: r.source_key as string, sourceLabel: r.source_label as string, contactId: r.contact_id as string, at: new Date(r.at as string).toISOString(), duplicate: !!r.duplicate, namesYou: !!r.names_you, externalId: (r.external_id as string | null) ?? null, origin: r.origin as EventOrigin, datedBy: r.dated_by as DatedBy });
  async add(e: LeadEvent) {
    return (await this.addMany([e])) === 1;
  }
  async addMany(es: LeadEvent[]) {
    if (!es.length) return 0;
    await this.init();
    let n = 0;
    for (let i = 0; i < es.length; i += 200) {
      const part = es.slice(i, i + 200);
      const cols = ["id", "owner_user_id", "source_key", "source_label", "contact_id", "at", "duplicate", "names_you", "external_id", "origin", "dated_by"] as const;
      const params: unknown[] = [];
      const rows = part.map((e) => {
        const vals = [e.id, e.ownerUserId, e.sourceKey, e.sourceLabel, e.contactId, e.at, e.duplicate, e.namesYou, e.externalId, e.origin, e.datedBy];
        const ph = vals.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${ph.join(",")})`;
      });
      const r = await this.q(`INSERT INTO cc_lead_events (${cols.join(", ")}) VALUES ${rows.join(", ")} ON CONFLICT DO NOTHING RETURNING id`, params);
      n += r.length;
    }
    return n;
  }
  async list(owner: string) {
    await this.init();
    return (await this.q(`SELECT * FROM cc_lead_events WHERE owner_user_id = $1 ORDER BY at, id LIMIT 50000`, [owner])).map(this.toEvent);
  }
  async count(owner: string) {
    await this.init();
    const r = await this.q(`SELECT count(*)::int AS n FROM cc_lead_events WHERE owner_user_id = $1`, [owner]);
    return Number(r[0]?.n ?? 0);
  }
  async repoint(owner: string, from: string, to: string) {
    await this.init();
    return (await this.q(`UPDATE cc_lead_events SET contact_id = $3 WHERE owner_user_id = $1 AND contact_id = $2 RETURNING id`, [owner, from, to])).length;
  }
  async removeImported(owner: string, contactId: string) {
    await this.init();
    return (await this.q(`DELETE FROM cc_lead_events WHERE owner_user_id = $1 AND contact_id = $2 AND origin = 'import' RETURNING id`, [owner, contactId])).length;
  }
  async setImportedNamesYou(owner: string, changes: readonly { id: string; namesYou: boolean }[]) {
    if (!changes.length) return 0;
    await this.init();
    let n = 0;
    for (const value of [true, false]) {
      const ids = changes.filter((c) => c.namesYou === value).map((c) => c.id);
      for (let i = 0; i < ids.length; i += 500) {
        n += (await this.q(`UPDATE cc_lead_events SET names_you = $3 WHERE owner_user_id = $1 AND origin = 'import' AND id = ANY($2::text[]) AND names_you <> $3 RETURNING id`, [owner, ids.slice(i, i + 500), value])).length;
      }
    }
    return n;
  }
  async marked(owner: string, mark: string) {
    await this.init();
    return (await this.q(`SELECT 1 FROM cc_lead_event_marks WHERE owner_user_id = $1 AND mark = $2`, [owner, mark])).length > 0;
  }
  async mark(owner: string, mark: string, at: string) {
    await this.init();
    await this.q(`INSERT INTO cc_lead_event_marks (owner_user_id, mark, at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [owner, mark, at]);
  }
}

let override: LeadEventStore | null = null;
let neonStore: NeonLeadEventStore | null = null;
const g = globalThis as unknown as { __lm8LeadEventMemory?: MemoryLeadEventStore };
const memory = (g.__lm8LeadEventMemory ??= new MemoryLeadEventStore());

export function setLeadEventStoreForTests(s: LeadEventStore | null) {
  override = s;
}

export function leadEventStore(): LeadEventStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonLeadEventStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
