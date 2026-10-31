/**
 * lib/records.ts — the one private record store behind L4 (v37).
 *
 * Quote requests, posted weeks, pricing snapshots and their source
 * screenshots all live here. Three back ends behind one interface:
 *  - BlobRecords: Vercel Blob with PRIVATE access, when
 *    BLOB_READ_WRITE_TOKEN is set (production and previews).
 *  - FileRecords: a local folder (.data/records, gitignored) for dev.
 *  - MemoryRecords: tests.
 * On Vercel without a Blob token the store is read-only and says why.
 *
 * Records are write-once by default: state changes are new records, never
 * edits, so the history of a quote or a posted week is its own audit log.
 * Nothing in here is ever served publicly; pages read it server-side.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export interface RecordStore {
  readonly kind: "blob" | "file" | "memory";
  readonly writable: boolean;
  readonly reason?: string;
  /** Write bytes at `key`. Throws if the key exists (write-once). */
  put(key: string, bytes: Uint8Array | string, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Keys under `prefix`, sorted ascending. */
  list(prefix: string): Promise<string[]>;
}

const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,300}$/;
export function assertKey(key: string): string {
  if (!KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error(`bad record key: ${key}`);
  return key;
}

const enc = (b: Uint8Array | string) => (typeof b === "string" ? new TextEncoder().encode(b) : b);

export class MemoryRecords implements RecordStore {
  readonly kind = "memory" as const;
  readonly writable = true;
  private m = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array | string) {
    assertKey(key);
    if (this.m.has(key)) throw new Error(`record exists: ${key}`);
    this.m.set(key, enc(bytes).slice());
  }
  async get(key: string) {
    const v = this.m.get(assertKey(key));
    return v ? v.slice() : null;
  }
  async list(prefix: string) {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

export class FileRecords implements RecordStore {
  readonly kind = "file" as const;
  constructor(private root: string, readonly writable: boolean, readonly reason?: string) {}
  private p(key: string) { return path.join(this.root, ...assertKey(key).split("/")); }
  async put(key: string, bytes: Uint8Array | string) {
    if (!this.writable) throw new Error(this.reason ?? "record store is read-only");
    const file = this.p(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, enc(bytes), { flag: "wx" });
  }
  async get(key: string) {
    try { return new Uint8Array(await fs.readFile(this.p(key))); } catch { return null; }
  }
  async list(prefix: string) {
    const out: string[] = [];
    const walk = async (dir: string, rel: string) => {
      let names: string[];
      try { names = await fs.readdir(dir); } catch { return; }
      for (const n of names) {
        const full = path.join(dir, n);
        const r = rel ? `${rel}/${n}` : n;
        if ((await fs.stat(full)).isDirectory()) await walk(full, r);
        else if (r.startsWith(prefix)) out.push(r);
      }
    };
    // Walk from the deepest folder the prefix names, to keep listings cheap.
    const base = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
    await walk(base ? path.join(this.root, ...base.split("/")) : this.root, base);
    return out.sort();
  }
}

export class BlobRecords implements RecordStore {
  readonly kind = "blob" as const;
  readonly writable = true;
  constructor(private prefix: string) {}
  private k(key: string) { return `${this.prefix}/${assertKey(key)}`; }
  async put(key: string, bytes: Uint8Array | string, contentType: string) {
    const { put } = await import("@vercel/blob");
    const body = typeof bytes === "string" ? bytes : Buffer.from(bytes);
    await put(this.k(key), body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  }
  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const r = await get(this.k(key), { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return new Uint8Array(await new Response(r.stream).arrayBuffer());
  }
  async list(prefix: string) {
    const { list } = await import("@vercel/blob");
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${this.prefix}/${prefix}`, cursor, limit: 1000 });
      for (const b of page.blobs) out.push(b.pathname.slice(this.prefix.length + 1));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out.sort();
  }
}

let override: RecordStore | null = null;
/** Tests swap the store. */
export function setRecordsForTests(s: RecordStore | null) { override = s; }

/** Records are namespaced by deployment so previews never touch production data. */
function namespace(): string {
  return process.env.VERCEL_ENV === "production" ? "prod" : "preview";
}

export function getRecords(): RecordStore {
  if (override) return override;
  if (process.env.BLOB_READ_WRITE_TOKEN) return new BlobRecords(`loanm8/${namespace()}`);
  const root = process.env.RECORDS_DIR ?? path.join(process.cwd(), ".data", "records");
  if (process.env.VERCEL) {
    return new FileRecords(root, false, "Private storage is not connected to this deployment. Connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN) to save quotes and pricing.");
  }
  return new FileRecords(root, true);
}

export async function putJson(store: RecordStore, key: string, value: unknown) {
  await store.put(key, JSON.stringify(value, null, 2), "application/json");
}

export async function getJson<T>(store: RecordStore, key: string): Promise<T | null> {
  const b = await store.get(key);
  if (!b) return null;
  try { return JSON.parse(new TextDecoder().decode(b)) as T; } catch { return null; }
}

/** Sortable, unique key fragment: ISO time plus random tail. */
export function stamp(now: Date = new Date()): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${now.toISOString().replace(/[:.]/g, "-")}-${rand}`;
}
