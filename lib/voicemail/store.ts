/**
 * lib/voicemail/store.ts — recorded voicemails and each drop (D57).
 * SERVER-ONLY. Neon tables cc_voicemails and cc_voicemail_drops when
 * DATABASE_URL is set, else memory. The audio lives in Vercel Blob.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type Voicemail = {
  id: string;
  ownerUserId: string;
  title: string;
  /** 8 kHz mono WAV in Blob (what the phone network plays). */
  url: string;
  seconds: number;
  status: "ok" | "deleted";
  transcript: string;
  createdAt: string;
};

/** queued → ringing → left (voicemail) / answered (a person) / no-answer / busy / failed. */
export type DropStatus = "queued" | "left" | "answered" | "no-answer" | "busy" | "failed" | "canceled";

export type Drop = {
  id: string;
  voicemailId: string;
  ownerUserId: string;
  contactId: string;
  contactName: string;
  phone: string;
  purpose: "service" | "marketing";
  callSid: string | null;
  /** The company's subaccount when the call went through one (D56). */
  account: string | null;
  from: string;
  status: DropStatus;
  answeredBy: string | null;
  optedOut: boolean;
  at: string;
  endedAt: string | null;
};

export interface VoicemailStore {
  voicemail(id: string): Promise<Voicemail | null>;
  putVoicemail(v: Voicemail): Promise<void>;
  voicemailsFor(owner: string): Promise<Voicemail[]>;
  drop(id: string): Promise<Drop | null>;
  putDrop(d: Drop): Promise<void>;
  dropsFor(owner: string, limit?: number): Promise<Drop[]>;
  dropsForContact(contactId: string, limit?: number): Promise<Drop[]>;
  /** The newest drop to this phone (for the company line's "reach the loan officer who called"). */
  latestToPhone(phone: string): Promise<Drop | null>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryVoicemailStore implements VoicemailStore {
  private v = new Map<string, Voicemail>();
  private d = new Map<string, Drop>();
  async voicemail(id: string) {
    const x = this.v.get(id);
    return x ? clone(x) : null;
  }
  async putVoicemail(x: Voicemail) {
    this.v.set(x.id, clone(x));
  }
  async voicemailsFor(owner: string) {
    return [...this.v.values()].filter((x) => x.ownerUserId === owner && x.status === "ok").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }
  async drop(id: string) {
    const x = this.d.get(id);
    return x ? clone(x) : null;
  }
  async putDrop(x: Drop) {
    this.d.set(x.id, clone(x));
  }
  async dropsFor(owner: string, limit = 100) {
    return [...this.d.values()].filter((x) => x.ownerUserId === owner).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
  }
  async dropsForContact(contactId: string, limit = 20) {
    return [...this.d.values()].filter((x) => x.contactId === contactId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
  }
  async latestToPhone(phone: string) {
    const x = [...this.d.values()].filter((y) => y.phone === phone).sort((a, b) => b.at.localeCompare(a.at))[0];
    return x ? clone(x) : null;
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

class NeonVoicemailStore implements VoicemailStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= Promise.all([
      this.q(`CREATE TABLE IF NOT EXISTS cc_voicemails (id text PRIMARY KEY, owner_user_id text NOT NULL, status text NOT NULL, created_at text NOT NULL, data jsonb NOT NULL)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_voicemail_drops (id text PRIMARY KEY, owner_user_id text NOT NULL, contact_id text NOT NULL, phone text NOT NULL, at text NOT NULL, data jsonb NOT NULL)`),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async voicemail(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_voicemails WHERE id = $1`, [id]);
    return r[0] ? parse<Voicemail>(r[0].data) : null;
  }
  async putVoicemail(x: Voicemail) {
    await this.init();
    await this.q(`INSERT INTO cc_voicemails (id, owner_user_id, status, created_at, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data`, [x.id, x.ownerUserId, x.status, x.createdAt, JSON.stringify(x)]);
  }
  async voicemailsFor(owner: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_voicemails WHERE owner_user_id = $1 AND status = 'ok' ORDER BY created_at DESC LIMIT 100`, [owner])).map((x) => parse<Voicemail>(x.data));
  }
  async drop(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_voicemail_drops WHERE id = $1`, [id]);
    return r[0] ? parse<Drop>(r[0].data) : null;
  }
  async putDrop(x: Drop) {
    await this.init();
    await this.q(`INSERT INTO cc_voicemail_drops (id, owner_user_id, contact_id, phone, at, data) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [x.id, x.ownerUserId, x.contactId, x.phone, x.at, JSON.stringify(x)]);
  }
  async dropsFor(owner: string, limit = 100) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_voicemail_drops WHERE owner_user_id = $1 ORDER BY at DESC LIMIT $2`, [owner, limit])).map((x) => parse<Drop>(x.data));
  }
  async dropsForContact(contactId: string, limit = 20) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_voicemail_drops WHERE contact_id = $1 ORDER BY at DESC LIMIT $2`, [contactId, limit])).map((x) => parse<Drop>(x.data));
  }
  async latestToPhone(phone: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_voicemail_drops WHERE phone = $1 ORDER BY at DESC LIMIT 1`, [phone]);
    return r[0] ? parse<Drop>(r[0].data) : null;
  }
}

let override: VoicemailStore | null = null;
let neonStore: NeonVoicemailStore | null = null;
const g = globalThis as unknown as { __lm8VoicemailMemory?: MemoryVoicemailStore };
const memory = (g.__lm8VoicemailMemory ??= new MemoryVoicemailStore());
export const setVoicemailStoreForTests = (s: VoicemailStore | null) => void (override = s);
export const newMemoryVoicemailStore = (): VoicemailStore => new MemoryVoicemailStore();
export function voicemailStore(): VoicemailStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonVoicemailStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
