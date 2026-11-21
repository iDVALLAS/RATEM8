/**
 * lib/contacts/store.ts — Command Center contacts and consent (D2).
 * SERVER-ONLY. Neon when DATABASE_URL is set (tables made on first use),
 * in memory otherwise.
 *
 * Contacts belong to the loan officer who imported them (owner_user_id):
 * "no lead is ever sold" and a loan officer's book leaves with them.
 * Consent is an append-only log per contact, channel and purpose; the
 * current answer is the latest entry. Nothing here ever sends anything.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { ImportRecord } from "./mapping";

export const CHANNELS = ["call", "ai_call", "text", "email"] as const;
export type Channel = (typeof CHANNELS)[number];
export const PURPOSES = ["service", "marketing"] as const;
export type Purpose = (typeof PURPOSES)[number];
/**
 * How a consent was obtained. "attested" = the loan officer said so on import; weaker than proof.
 * D77: "reset" = set back to nothing on file (not a stop): their phone or email changed, so
 * permission given for the old one doesn't carry over, or a merge kept the stricter answer.
 */
export const EVIDENCE = ["written", "recorded_call", "web_form", "text_reply", "attested", "revoked", "reset"] as const;
export type Evidence = (typeof EVIDENCE)[number];

/**
 * D2 (research 2026-11-18, idea 1): where a list came from. Lists from a
 * prior employer's system are held ("locked") until the loan officer signs
 * an attestation (wording by counsel); the send gate never contacts a
 * locked person. Poaching suits turn on lists taken from employers.
 */
export const PROVENANCE = ["personal", "own_closings", "prior_employer", "agent_partner", "lead_vendor", "unknown"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export type Contact = Omit<ImportRecord, "attestedOptIns" | "optOuts"> & {
  id: string;
  provenance: Provenance;
  /** True while the loan officer hasn't cleared a prior-employer list. Nothing is sent to a locked contact. */
  locked: boolean;
  /** D4: the last do-not-call check of their phone (national, state or vendor scrub). */
  dnc?: { onList: boolean; checkedAt: string; source: string } | null;
  /**
   * D21: the FCC Reassigned Numbers Database answer for this number. "yes"
   * means it was permanently disconnected after `since`, so old permission
   * may now reach someone else.
   */
  rnd?: { result: "no" | "yes" | "no_data"; since: string; checkedAt: string; source: string } | null;
  /** D4: line type from Twilio Lookup. */
  line?: { type: string; carrier: string | null; checkedAt: string } | null;
  /** D26: the version of their own-page link (a new link raises it; old links stop working). */
  linkVersion?: number;
  /** D10: the client's say-so for their agent to hear how the loan is going (revocable). */
  partnerUpdates?: { allowed: boolean; agentContactId: string | null; proof: string; at: string; by: string } | null;
  /** D53: they asked for no cards by mail. */
  noMail?: boolean;
  ownerUserId: string;
  kind: "contact" | "agent";
  source: string;
  createdAt: string;
  updatedAt: string;
  /** D75: the import that created this person (undo deletes them while untouched). */
  importId?: string | null;
  /** D75: an undo kept this person (messaged, permission recorded or a stop since); the import it came from. */
  keptFrom?: string | null;
  /** D75: each recent import that changed this person, with every field's value before and after (undo puts them back). */
  imports?: ImportSnap[];
  /** D77: records merged into this one (their messages, notes and permission history moved here). */
  mergedFrom?: { id: string; name: string; at: string }[];
};

/**
 * D75: what one import changed on someone already in the book. `before` and
 * `after` hold only the fields it changed; undo restores a field only while it
 * still holds the import's value (a later edit wins). Consent is never here:
 * it's the append-only log.
 */
export type ImportSnap = { id: string; at: string; before: Record<string, unknown>; after: Record<string, unknown>; addedTags: string[]; droppedTags: string[] };

export type ConsentEntry = {
  contactId: string;
  channel: Channel;
  purpose: Purpose;
  granted: boolean;
  evidence: Evidence;
  /** Free text: the form, the recording id, the message, the file name. */
  proof: string;
  at: string;
  actor: string;
  /** D75: the import that wrote this entry (undo reads it; the entry itself is never changed or removed). */
  importId?: string | null;
  /**
   * D77: a copy of an entry from a record merged into this one (its id). History only:
   * the current answer comes from this record's own entries (a merge appends what it keeps).
   */
  mergedFrom?: string | null;
};

/** D73: `tag` is an exact match on one tag (the spelling as stored), unlike `q`, which searches inside words. */
export type ContactFilter = { ownerUserId?: string; kind?: "contact" | "agent"; q?: string; relationship?: string; state?: string; tag?: string; importId?: string; limit?: number; offset?: number };
export type TagCount = { tag: string; count: number };

export interface ContactStore {
  readonly kind: string;
  findDuplicate(ownerUserId: string, phone: string | null, email: string | null): Promise<Contact | null>;
  /** D75: everyone in a book sharing any of these phones (main or other) or emails. */
  findMatches(ownerUserId: string, phones: string[], emails: string[]): Promise<Contact[]>;
  /** D75: the people an import created or changed in a book. */
  byImport(ownerUserId: string, importId: string, limit?: number): Promise<Contact[]>;
  /** D75: people on hold (a previous employer's list) in a book, and releasing them all in one go. */
  countLocked(ownerUserId: string): Promise<number>;
  unlockAll(ownerUserId: string, at: string): Promise<number>;
  /** Every contact with this phone, across all loan officers (for inbound texts and opt-outs). */
  findByPhone(phone: string): Promise<Contact[]>;
  put(c: Contact): Promise<void>;
  get(id: string): Promise<Contact | null>;
  list(f: ContactFilter): Promise<{ contacts: Contact[]; total: number }>;
  /** D73: each tag in a book (or every book, owner undefined) with how many people have it, most used first. */
  tagCounts(ownerUserId: string | undefined, kind?: "contact" | "agent"): Promise<TagCount[]>;
  addConsent(e: ConsentEntry): Promise<void>;
  consents(contactId: string): Promise<ConsentEntry[]>;
  consentsFor(contactIds: string[]): Promise<ConsentEntry[]>;
  /** D75: `keepConsents` leaves the consent log as it is (append-only; an undone import never erases a record). */
  remove(id: string, opts?: { keepConsents?: boolean }): Promise<void>;
}

/** D77: the entries that decide the current answer (copies from a merged record are history only). */
export const liveEntries = (entries: ConsentEntry[]) => entries.filter((e) => !e.mergedFrom);

/** D75: whether a contact was created or changed by an import. */
export const fromImport = (c: Contact, importId: string) => c.importId === importId || (c.imports ?? []).some((s) => s.id === importId);

const matches = (c: Contact, f: ContactFilter) => {
  if (f.ownerUserId && c.ownerUserId !== f.ownerUserId) return false;
  if (f.kind && c.kind !== f.kind) return false;
  if (f.relationship && c.relationship !== f.relationship) return false;
  if (f.state && c.state !== f.state) return false;
  if (f.tag && !(c.tags ?? []).includes(f.tag)) return false;
  if (f.importId && !fromImport(c, f.importId)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [c.firstName, c.lastName, c.email, c.phone, c.city, c.agent?.brokerage, ...c.tags].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
};
const byName = (a: Contact, b: Contact) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
const byCount = (a: TagCount, b: TagCount) => b.count - a.count || a.tag.localeCompare(b.tag);
export const MAX_TAG_COUNTS = 500;

export class MemoryContactStore implements ContactStore {
  readonly kind = "memory";
  private rows = new Map<string, Contact>();
  private log: ConsentEntry[] = [];
  async findDuplicate(owner: string, phone: string | null, email: string | null) {
    return [...this.rows.values()].find((c) => c.ownerUserId === owner && ((phone && c.phone === phone) || (email && c.email === email))) ?? null;
  }
  async findMatches(owner: string, phones: string[], emails: string[]) {
    const p = new Set(phones.filter(Boolean));
    const e = new Set(emails.filter(Boolean));
    return [...this.rows.values()].filter((c) => c.ownerUserId === owner && ((c.phone && p.has(c.phone)) || (c.phone2 && p.has(c.phone2)) || (c.email && e.has(c.email)))).map((c) => structuredClone(c));
  }
  async byImport(owner: string, importId: string, limit = 5000) {
    return [...this.rows.values()].filter((c) => c.ownerUserId === owner && fromImport(c, importId)).slice(0, limit).map((c) => structuredClone(c));
  }
  async countLocked(owner: string) {
    return [...this.rows.values()].filter((c) => c.ownerUserId === owner && c.locked).length;
  }
  async unlockAll(owner: string, at: string) {
    let n = 0;
    for (const c of this.rows.values()) {
      if (c.ownerUserId !== owner || !c.locked) continue;
      c.locked = false;
      c.updatedAt = at;
      n++;
    }
    return n;
  }
  async findByPhone(phone: string) {
    return [...this.rows.values()].filter((c) => c.phone === phone || c.phone2 === phone).map((c) => structuredClone(c));
  }
  async put(c: Contact) {
    this.rows.set(c.id, structuredClone(c));
  }
  async get(id: string) {
    const c = this.rows.get(id);
    return c ? structuredClone(c) : null;
  }
  async list(f: ContactFilter) {
    const all = [...this.rows.values()].filter((c) => matches(c, f)).sort(byName);
    const off = f.offset ?? 0;
    return { contacts: all.slice(off, off + (f.limit ?? 50)).map((c) => structuredClone(c)), total: all.length };
  }
  async tagCounts(owner: string | undefined, kind?: "contact" | "agent") {
    const n = new Map<string, number>();
    for (const c of this.rows.values()) {
      if ((owner && c.ownerUserId !== owner) || (kind && c.kind !== kind)) continue;
      for (const t of new Set(c.tags ?? [])) n.set(t, (n.get(t) ?? 0) + 1);
    }
    return [...n].map(([tag, count]) => ({ tag, count })).sort(byCount).slice(0, MAX_TAG_COUNTS);
  }
  async addConsent(e: ConsentEntry) {
    this.log.push({ ...e });
  }
  async consents(id: string) {
    return this.log.filter((e) => e.contactId === id);
  }
  async consentsFor(ids: string[]) {
    const s = new Set(ids);
    return this.log.filter((e) => s.has(e.contactId));
  }
  async remove(id: string, opts: { keepConsents?: boolean } = {}) {
    this.rows.delete(id);
    if (!opts.keepConsents) this.log = this.log.filter((e) => e.contactId !== id);
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const toContact = (r: Row): Contact => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as Contact;

/** Contacts are stored as a JSON body plus the indexed columns used to find them. */
export class NeonContactStore implements ContactStore {
  readonly kind = "neon";
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_contacts (id text PRIMARY KEY, owner_user_id text NOT NULL, kind text NOT NULL, relationship text NOT NULL, state text, phone text, email text, sort_name text NOT NULL, search text NOT NULL, body jsonb NOT NULL, updated_at timestamptz NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_contacts_owner ON cc_contacts (owner_user_id, kind, sort_name)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_contacts_phone ON cc_contacts (owner_user_id, phone)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_contacts_email ON cc_contacts (owner_user_id, email)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_consents (id bigserial PRIMARY KEY, contact_id text NOT NULL, channel text NOT NULL, purpose text NOT NULL, granted boolean NOT NULL, evidence text NOT NULL, proof text NOT NULL, at timestamptz NOT NULL, actor text NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_consents_contact ON cc_consents (contact_id, at)`);
        // D75: which import wrote an entry (so undo can tell the import's own answers from later ones).
        await this.q(`ALTER TABLE cc_consents ADD COLUMN IF NOT EXISTS import_id text`);
        // D77: a copy from a record merged into this one (history only).
        await this.q(`ALTER TABLE cc_consents ADD COLUMN IF NOT EXISTS merged_from text`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async findDuplicate(owner: string, phone: string | null, email: string | null) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_contacts WHERE owner_user_id = $1 AND ((phone IS NOT NULL AND phone = $2) OR (email IS NOT NULL AND email = $3)) LIMIT 1`, [owner, phone, email]);
    return r[0] ? toContact(r[0]) : null;
  }
  async findMatches(owner: string, phones: string[], emails: string[]) {
    await this.init();
    const p = [...new Set(phones.filter(Boolean))];
    const e = [...new Set(emails.filter(Boolean))];
    if (!p.length && !e.length) return [];
    const r = await this.q(`SELECT body FROM cc_contacts WHERE owner_user_id = $1 AND (phone = ANY($2) OR body->>'phone2' = ANY($2) OR email = ANY($3)) LIMIT 5000`, [owner, p, e]);
    return r.map(toContact);
  }
  async byImport(owner: string, importId: string, limit = 5000) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_contacts WHERE owner_user_id = $1 AND (body->>'importId' = $2 OR body->'imports' @> $3::jsonb) ORDER BY sort_name LIMIT ${Math.max(1, Math.min(limit, 25_000))}`, [owner, importId, JSON.stringify([{ id: importId }])]);
    return r.map(toContact);
  }
  async countLocked(owner: string) {
    await this.init();
    return Number((await this.q(`SELECT count(*)::int AS n FROM cc_contacts WHERE owner_user_id = $1 AND body->>'locked' = 'true'`, [owner]))[0]?.n ?? 0);
  }
  /** One UPDATE for the whole book (the old way read 500 people and released only those). */
  async unlockAll(owner: string, at: string) {
    await this.init();
    const r = await this.q(
      `WITH u AS (UPDATE cc_contacts SET body = jsonb_set(jsonb_set(body, '{locked}', 'false'::jsonb), '{updatedAt}', to_jsonb($2::text)), updated_at = $2::timestamptz WHERE owner_user_id = $1 AND body->>'locked' = 'true' RETURNING 1) SELECT count(*)::int AS n FROM u`,
      [owner, at],
    );
    return Number(r[0]?.n ?? 0);
  }
  async findByPhone(phone: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_contacts WHERE phone = $1 OR body->>'phone2' = $1`, [phone]);
    return r.map(toContact);
  }
  async put(c: Contact) {
    await this.init();
    const search = [c.firstName, c.lastName, c.email, c.phone, c.city, c.agent?.brokerage, ...c.tags].filter(Boolean).join(" ").toLowerCase();
    await this.q(
      `INSERT INTO cc_contacts (id, owner_user_id, kind, relationship, state, phone, email, sort_name, search, body, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET relationship = EXCLUDED.relationship, state = EXCLUDED.state, phone = EXCLUDED.phone, email = EXCLUDED.email, sort_name = EXCLUDED.sort_name, search = EXCLUDED.search, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
      [c.id, c.ownerUserId, c.kind, c.relationship, c.state, c.phone, c.email, `${c.lastName} ${c.firstName}`.toLowerCase(), search, JSON.stringify(c), c.updatedAt],
    );
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_contacts WHERE id = $1`, [id]);
    return r[0] ? toContact(r[0]) : null;
  }
  async list(f: ContactFilter) {
    await this.init();
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      p.push(v);
      where.push(sql.replace("?", `$${p.length}`));
    };
    if (f.ownerUserId) add("owner_user_id = ?", f.ownerUserId);
    if (f.kind) add("kind = ?", f.kind);
    if (f.relationship) add("relationship = ?", f.relationship);
    if (f.state) add("state = ?", f.state);
    if (f.q) add("search LIKE ?", `%${f.q.toLowerCase().replace(/[%_]/g, "")}%`);
    // D73: exact tag (jsonb "has this string element"), written out because `?` is also the operator.
    if (f.tag) {
      p.push(f.tag);
      where.push(`body->'tags' ? $${p.length}`);
    }
    // D75: the people one import created or changed.
    if (f.importId) {
      p.push(f.importId);
      p.push(JSON.stringify([{ id: f.importId }]));
      where.push(`(body->>'importId' = $${p.length - 1} OR body->'imports' @> $${p.length}::jsonb)`);
    }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number((await this.q(`SELECT count(*)::int AS n FROM cc_contacts ${w}`, p))[0]?.n ?? 0);
    const rows = await this.q(`SELECT body FROM cc_contacts ${w} ORDER BY sort_name LIMIT ${Math.min(f.limit ?? 50, 500)} OFFSET ${Math.max(0, f.offset ?? 0)}`, p);
    return { contacts: rows.map(toContact), total };
  }
  async tagCounts(owner: string | undefined, kind?: "contact" | "agent") {
    await this.init();
    const where: string[] = [];
    const p: unknown[] = [];
    if (owner) where.push(`owner_user_id = $${p.push(owner)}`);
    if (kind) where.push(`kind = $${p.push(kind)}`);
    const r = await this.q(
      `SELECT t AS tag, count(DISTINCT id)::int AS n FROM cc_contacts, jsonb_array_elements_text(CASE WHEN jsonb_typeof(body->'tags') = 'array' THEN body->'tags' ELSE '[]'::jsonb END) AS t ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY t ORDER BY n DESC, t LIMIT ${MAX_TAG_COUNTS}`,
      p,
    );
    return r.map((x) => ({ tag: String(x.tag), count: Number(x.n) })).sort(byCount);
  }
  async addConsent(e: ConsentEntry) {
    await this.init();
    await this.q(`INSERT INTO cc_consents (contact_id, channel, purpose, granted, evidence, proof, at, actor, import_id, merged_from) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [e.contactId, e.channel, e.purpose, e.granted, e.evidence, e.proof, e.at, e.actor, e.importId ?? null, e.mergedFrom ?? null]);
  }
  async consents(id: string) {
    return this.consentsFor([id]);
  }
  async consentsFor(ids: string[]) {
    await this.init();
    if (!ids.length) return [];
    const r = await this.q(`SELECT * FROM cc_consents WHERE contact_id = ANY($1) ORDER BY at, id`, [ids]);
    return r.map((x) => ({ contactId: x.contact_id as string, channel: x.channel as Channel, purpose: x.purpose as Purpose, granted: x.granted as boolean, evidence: x.evidence as Evidence, proof: x.proof as string, at: new Date(x.at as string).toISOString(), actor: x.actor as string, ...(x.import_id ? { importId: x.import_id as string } : {}), ...(x.merged_from ? { mergedFrom: x.merged_from as string } : {}) }));
  }
  async remove(id: string, opts: { keepConsents?: boolean } = {}) {
    await this.init();
    if (!opts.keepConsents) await this.q(`DELETE FROM cc_consents WHERE contact_id = $1`, [id]);
    await this.q(`DELETE FROM cc_contacts WHERE id = $1`, [id]);
  }
}

let override: ContactStore | null = null;
let neonStore: NeonContactStore | null = null;
// One copy per server process, shared by pages, actions and routes (Next bundles them separately).
const g = globalThis as unknown as { __lm8ContactMemory?: MemoryContactStore };
const memory = (g.__lm8ContactMemory ??= new MemoryContactStore());

export function setContactStoreForTests(s: ContactStore | null) {
  override = s;
}

export function contactStore(): ContactStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonContactStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
