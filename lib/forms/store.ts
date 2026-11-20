/**
 * lib/forms/store.ts — the forms each loan officer keeps (D66). SERVER-ONLY.
 *
 * A form is either in the loan officer's library (loanId null: blank forms
 * they reuse) or on one loan (dropped in, filled from the file, or a letter
 * written from it). The record lives in Neon (cc_forms) or memory; the file
 * itself lives in the private Blob store when it's connected, otherwise in
 * Neon (cc_form_files), sealed, so nothing needs the Blob store to work.
 */
import { neon } from "@neondatabase/serverless";
import { del as blobDel, get as blobGet, put as blobPut } from "@vercel/blob";
import { blobOn } from "@/lib/blob/private";
import { databaseUrl } from "@/lib/m8/server";
import { seal, unseal } from "@/lib/mail/seal";
import type { FormKind } from "./catalog";

export type FormDoc = {
  id: string;
  ownerUserId: string;
  /** Null: in the library. */
  loanId: string | null;
  name: string;
  kind: FormKind;
  source: "upload" | "filled" | "letter";
  /** Where the bytes are: a private Blob address, or "db:<id>". */
  ref: string;
  bytes: number;
  /** Names of its fillable fields (empty: not fillable). */
  fields: string[];
  /** The library form this one was filled from. */
  fromId: string | null;
  createdAt: string;
};

export interface FormStore {
  get(id: string): Promise<FormDoc | null>;
  put(f: FormDoc): Promise<void>;
  list(owner: string, loanId: string | null): Promise<FormDoc[]>;
  remove(id: string): Promise<void>;
  putBytes(id: string, data: string): Promise<void>;
  getBytes(id: string): Promise<string | null>;
  removeBytes(id: string): Promise<void>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class Memory implements FormStore {
  private f = new Map<string, FormDoc>();
  private b = new Map<string, string>();
  async get(id: string) {
    const x = this.f.get(id);
    return x ? clone(x) : null;
  }
  async put(x: FormDoc) {
    this.f.set(x.id, clone(x));
  }
  async list(owner: string, loanId: string | null) {
    return [...this.f.values()].filter((x) => x.ownerUserId === owner && x.loanId === loanId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
  }
  async remove(id: string) {
    this.f.delete(id);
  }
  async putBytes(id: string, data: string) {
    this.b.set(id, data);
  }
  async getBytes(id: string) {
    return this.b.get(id) ?? null;
  }
  async removeBytes(id: string) {
    this.b.delete(id);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
class Neon implements FormStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= Promise.all([
      this.q(`CREATE TABLE IF NOT EXISTS cc_forms (id text PRIMARY KEY, owner_user_id text NOT NULL, loan_id text, data jsonb NOT NULL)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_form_files (id text PRIMARY KEY, data text NOT NULL)`),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_forms WHERE id = $1`, [id]);
    return r[0] ? parse<FormDoc>(r[0].data) : null;
  }
  async put(x: FormDoc) {
    await this.init();
    await this.q(`INSERT INTO cc_forms (id, owner_user_id, loan_id, data) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, loan_id = EXCLUDED.loan_id`, [x.id, x.ownerUserId, x.loanId, JSON.stringify(x)]);
  }
  async list(owner: string, loanId: string | null) {
    await this.init();
    const r = loanId === null ? await this.q(`SELECT data FROM cc_forms WHERE owner_user_id = $1 AND loan_id IS NULL`, [owner]) : await this.q(`SELECT data FROM cc_forms WHERE owner_user_id = $1 AND loan_id = $2`, [owner, loanId]);
    return r.map((x) => parse<FormDoc>(x.data)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async remove(id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_forms WHERE id = $1`, [id]);
  }
  async putBytes(id: string, data: string) {
    await this.init();
    await this.q(`INSERT INTO cc_form_files (id, data) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [id, data]);
  }
  async getBytes(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_form_files WHERE id = $1`, [id]);
    return r[0] ? String(r[0].data) : null;
  }
  async removeBytes(id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_form_files WHERE id = $1`, [id]);
  }
}

let override: FormStore | null = null;
let neonStore: Neon | null = null;
const g = globalThis as unknown as { __lm8FormMemory?: Memory };
const memory = (g.__lm8FormMemory ??= new Memory());
export const setFormStoreForTests = (s: FormStore | null) => void (override = s);
export const newMemoryFormStore = (): FormStore => new Memory();
export function formStore(): FormStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new Neon((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}

// ---- The files themselves ----

export type FileBox = {
  put(id: string, owner: string, bytes: Uint8Array): Promise<string>;
  get(ref: string): Promise<Uint8Array | null>;
  del(ref: string): Promise<void>;
};

/** Sealed in the database: for when there's no Blob store, and for tests. */
export const dbBox = (): FileBox => ({
  async put(id, _owner, bytes) {
    await formStore().putBytes(id, seal(Buffer.from(bytes).toString("base64")));
    return `db:${id}`;
  },
  async get(ref) {
    if (!ref.startsWith("db:")) return null;
    const b64 = unseal(await formStore().getBytes(ref.slice(3)));
    return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
  },
  async del(ref) {
    if (ref.startsWith("db:")) await formStore().removeBytes(ref.slice(3));
  },
});

async function readStream(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** The private Blob store when it's connected (reads of older db: files still work). */
export const realBox = (): FileBox => {
  const db = dbBox();
  if (!blobOn()) return db;
  return {
    async put(id, owner, bytes) {
      const r = await blobPut(`forms/${owner.replace(/[^A-Za-z0-9_-]/g, "")}/${id}.pdf`, Buffer.from(bytes), { access: "private", contentType: "application/pdf", addRandomSuffix: true });
      return r.url;
    },
    async get(ref) {
      if (ref.startsWith("db:")) return db.get(ref);
      const r = await blobGet(ref, { access: "private" });
      return r && r.statusCode === 200 ? readStream(r.stream) : null;
    },
    async del(ref) {
      if (ref.startsWith("db:")) return db.del(ref);
      await blobDel(ref);
    },
  };
};
