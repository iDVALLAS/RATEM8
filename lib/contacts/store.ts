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
/** How a consent was obtained. "attested" = the loan officer said so on import; weaker than proof. */
export const EVIDENCE = ["written", "recorded_call", "web_form", "text_reply", "attested", "revoked"] as const;
export type Evidence = (typeof EVIDENCE)[number];

/**
 * D2 (research 2026-11-18, idea 1): where a list came from. Lists from a
 * prior employer's system are held ("locked") until the loan officer signs
 * an attestation (wording by counsel); the send gate never contacts a
 * locked person. Poaching suits turn on lists taken from employers.
 */
export const PROVENANCE = ["personal", "own_closings", "prior_employer", "agent_partner", "lead_vendor", "unknown"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export type Contact = Omit<ImportRecord, "attestedOptIns"> & {
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
  ownerUserId: string;
  kind: "contact" | "agent";
  source: string;
  createdAt: string;
  updatedAt: string;
};

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
};

export type ContactFilter = { ownerUserId?: string; kind?: "contact" | "agent"; q?: string; relationship?: string; state?: string; limit?: number; offset?: number };

export interface ContactStore {
  readonly kind: string;
  findDuplicate(ownerUserId: string, phone: string | null, email: string | null): Promise<Contact | null>;
  /** Every contact with this phone, across all loan officers (for inbound texts and opt-outs). */
  findByPhone(phone: string): Promise<Contact[]>;
  put(c: Contact): Promise<void>;
  get(id: string): Promise<Contact | null>;
  list(f: ContactFilter): Promise<{ contacts: Contact[]; total: number }>;
  addConsent(e: ConsentEntry): Promise<void>;
  consents(contactId: string): Promise<ConsentEntry[]>;
  consentsFor(contactIds: string[]): Promise<ConsentEntry[]>;
  remove(id: string): Promise<void>;
}

const matches = (c: Contact, f: ContactFilter) => {
  if (f.ownerUserId && c.ownerUserId !== f.ownerUserId) return false;
  if (f.kind && c.kind !== f.kind) return false;
  if (f.relationship && c.relationship !== f.relationship) return false;
  if (f.state && c.state !== f.state) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [c.firstName, c.lastName, c.email, c.phone, c.city, c.agent?.brokerage, ...c.tags].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
};
const byName = (a: Contact, b: Contact) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

export class MemoryContactStore implements ContactStore {
  readonly kind = "memory";
  private rows = new Map<string, Contact>();
  private log: ConsentEntry[] = [];
  async findDuplicate(owner: string, phone: string | null, email: string | null) {
    return [...this.rows.values()].find((c) => c.ownerUserId === owner && ((phone && c.phone === phone) || (email && c.email === email))) ?? null;
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
  async remove(id: string) {
    this.rows.delete(id);
    this.log = this.log.filter((e) => e.contactId !== id);
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
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number((await this.q(`SELECT count(*)::int AS n FROM cc_contacts ${w}`, p))[0]?.n ?? 0);
    const rows = await this.q(`SELECT body FROM cc_contacts ${w} ORDER BY sort_name LIMIT ${Math.min(f.limit ?? 50, 500)} OFFSET ${Math.max(0, f.offset ?? 0)}`, p);
    return { contacts: rows.map(toContact), total };
  }
  async addConsent(e: ConsentEntry) {
    await this.init();
    await this.q(`INSERT INTO cc_consents (contact_id, channel, purpose, granted, evidence, proof, at, actor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [e.contactId, e.channel, e.purpose, e.granted, e.evidence, e.proof, e.at, e.actor]);
  }
  async consents(id: string) {
    return this.consentsFor([id]);
  }
  async consentsFor(ids: string[]) {
    await this.init();
    if (!ids.length) return [];
    const r = await this.q(`SELECT * FROM cc_consents WHERE contact_id = ANY($1) ORDER BY at, id`, [ids]);
    return r.map((x) => ({ contactId: x.contact_id as string, channel: x.channel as Channel, purpose: x.purpose as Purpose, granted: x.granted as boolean, evidence: x.evidence as Evidence, proof: x.proof as string, at: new Date(x.at as string).toISOString(), actor: x.actor as string }));
  }
  async remove(id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_consents WHERE contact_id = $1`, [id]);
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
