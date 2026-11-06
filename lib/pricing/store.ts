/**
 * lib/pricing/store.ts — where manual snapshots, their source files, and
 * tenant settings live.
 *
 * Stand-in for the v11a schema and the Ledger, which do not exist in this
 * repo yet. Behind one interface so a hosted store (Postgres, KV, Blob
 * with private access) can replace the file store without touching
 * callers. Records are write-once: a snapshot, a source file, or a
 * settings version is never overwritten. Every write appends an audit
 * line (who, what, when, hashes). Source files hold real lender names, so
 * the store is never served publicly.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import { canonicalJson, sha256Hex } from "./canonical";
import type { PlaybookEntry } from "./playbook";
import type { CompRule } from "./compRule";
import type { PricingRun, RunInputs } from "./types";

export type StoredSnapshot = {
  run: PricingRun;
  inputs: RunInputs;
  /** label → lenderKey. Server-side only. */
  mapping: Record<string, string>;
  sourceSha256: string;
  sourceMime: string;
  enteredBy: string;
  enteredAt: string;
};

export type TenantSettings = {
  tenantId: string;
  version: number;
  activeLenderKeys: string[];
  playbook: PlaybookEntry[];
  /** C8: the loan officer's rate rule (lib/pricing/compRule.ts). Absent means the default (1.7%, 1.5% points cap). */
  comp?: CompRule;
  updatedBy: string;
  updatedAt: string;
};

export type AuditEvent = {
  at: string;
  actor: string;
  action: "snapshot.publish" | "source.put" | "settings.save";
  tenantId: string;
  detail: Record<string, string | number | boolean>;
};

export interface SnapshotStore {
  readonly kind: string;
  readonly writable: boolean;
  readonly reason?: string;
  putSource(bytes: Uint8Array, mime: string, actor: string, tenantId: string): Promise<string>;
  hasSource(sha256: string): Promise<boolean>;
  putSnapshot(s: StoredSnapshot): Promise<void>;
  latestSnapshot(tenantId: string, scenarioId: string): Promise<StoredSnapshot | null>;
  listSnapshots(tenantId: string, scenarioId: string): Promise<StoredSnapshot[]>;
  latestSettings(tenantId: string): Promise<TenantSettings | null>;
  putSettings(s: Omit<TenantSettings, "version">): Promise<TenantSettings>;
  audit(): Promise<AuditEvent[]>;
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");

/** In-memory store for tests. */
export class MemoryStore implements SnapshotStore {
  readonly kind = "memory";
  readonly writable = true;
  private sources = new Map<string, { bytes: Uint8Array; mime: string }>();
  private snaps: StoredSnapshot[] = [];
  private settings: TenantSettings[] = [];
  private log: AuditEvent[] = [];

  async putSource(bytes: Uint8Array, mime: string, actor: string, tenantId: string) {
    const h = sha256Hex(bytes);
    if (!this.sources.has(h)) {
      this.sources.set(h, { bytes, mime });
      this.log.push({ at: new Date().toISOString(), actor, action: "source.put", tenantId, detail: { sha256: h, mime, bytes: bytes.length } });
    }
    return h;
  }
  async hasSource(h: string) { return this.sources.has(h); }
  async putSnapshot(s: StoredSnapshot) {
    if (this.snaps.some((x) => x.run.runId === s.run.runId)) throw new Error("snapshot already exists");
    this.snaps.push(structuredClone(s));
    this.log.push({ at: s.enteredAt, actor: s.enteredBy, action: "snapshot.publish", tenantId: s.run.tenantId, detail: { runId: s.run.runId, scenario: s.run.scenario.id, inputsHash: s.run.inputsHash, sourceSha256: s.sourceSha256 } });
  }
  async latestSnapshot(t: string, sc: string) { return (await this.listSnapshots(t, sc))[0] ?? null; }
  async listSnapshots(t: string, sc: string) {
    return this.snaps.filter((x) => x.run.tenantId === t && x.run.scenario.id === sc).sort((a, b) => b.run.pricedAt.localeCompare(a.run.pricedAt)).map((x) => structuredClone(x));
  }
  async latestSettings(t: string) {
    const v = this.settings.filter((x) => x.tenantId === t).sort((a, b) => b.version - a.version)[0];
    return v ? structuredClone(v) : null;
  }
  async putSettings(s: Omit<TenantSettings, "version">) {
    const prev = await this.latestSettings(s.tenantId);
    const rec: TenantSettings = { ...structuredClone(s), version: (prev?.version ?? 0) + 1 };
    this.settings.push(rec);
    this.log.push({ at: s.updatedAt, actor: s.updatedBy, action: "settings.save", tenantId: s.tenantId, detail: { version: rec.version, hash: sha256Hex(canonicalJson(rec)) } });
    return structuredClone(rec);
  }
  async audit() { return structuredClone(this.log); }
}

/**
 * File store for local development and a self-hosted server. On Vercel the
 * filesystem is not persistent, so the file store reports itself read-only
 * there unless PRICING_STORE_DIR points at a mounted volume.
 */
export class FileStore implements SnapshotStore {
  readonly kind = "file";
  readonly writable: boolean;
  readonly reason?: string;
  constructor(private root: string, writable: boolean, reason?: string) {
    this.writable = writable;
    this.reason = reason;
  }
  private p(...parts: string[]) { return path.join(this.root, ...parts); }
  private async writeOnce(file: string, data: string | Uint8Array) {
    if (!this.writable) throw new Error(this.reason ?? "store is read-only");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data, { flag: "wx" });
  }
  private async appendAudit(e: AuditEvent) {
    await fs.mkdir(this.root, { recursive: true });
    await fs.appendFile(this.p("audit.jsonl"), JSON.stringify(e) + "\n");
  }
  private async readJsonDir<T>(dir: string): Promise<T[]> {
    try {
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
      return Promise.all(names.map(async (n) => JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as T));
    } catch {
      return [];
    }
  }

  async putSource(bytes: Uint8Array, mime: string, actor: string, tenantId: string) {
    const h = sha256Hex(bytes);
    if (await this.hasSource(h)) return h;
    await this.writeOnce(this.p("sources", `${h}.bin`), bytes);
    await this.writeOnce(this.p("sources", `${h}.json`), JSON.stringify({ sha256: h, mime, bytes: bytes.length, tenantId }));
    await this.appendAudit({ at: new Date().toISOString(), actor, action: "source.put", tenantId, detail: { sha256: h, mime, bytes: bytes.length } });
    return h;
  }
  async hasSource(h: string) {
    try { await fs.access(this.p("sources", `${h}.bin`)); return true; } catch { return false; }
  }
  async putSnapshot(s: StoredSnapshot) {
    const dir = this.p("tenants", safe(s.run.tenantId), "snapshots", safe(s.run.scenario.id));
    await this.writeOnce(path.join(dir, `${safe(s.run.pricedAt)}-${s.run.inputsHash.slice(0, 12)}.json`), JSON.stringify(s, null, 2));
    await this.appendAudit({ at: s.enteredAt, actor: s.enteredBy, action: "snapshot.publish", tenantId: s.run.tenantId, detail: { runId: s.run.runId, scenario: s.run.scenario.id, inputsHash: s.run.inputsHash, sourceSha256: s.sourceSha256 } });
  }
  async latestSnapshot(t: string, sc: string) { return (await this.listSnapshots(t, sc))[0] ?? null; }
  async listSnapshots(t: string, sc: string) {
    const all = await this.readJsonDir<StoredSnapshot>(this.p("tenants", safe(t), "snapshots", safe(sc)));
    return all.sort((a, b) => b.run.pricedAt.localeCompare(a.run.pricedAt));
  }
  async latestSettings(t: string) {
    const all = await this.readJsonDir<TenantSettings>(this.p("tenants", safe(t), "settings"));
    return all.sort((a, b) => b.version - a.version)[0] ?? null;
  }
  async putSettings(s: Omit<TenantSettings, "version">) {
    const prev = await this.latestSettings(s.tenantId);
    const rec: TenantSettings = { ...s, version: (prev?.version ?? 0) + 1 };
    await this.writeOnce(this.p("tenants", safe(s.tenantId), "settings", `${String(rec.version).padStart(6, "0")}.json`), JSON.stringify(rec, null, 2));
    await this.appendAudit({ at: s.updatedAt, actor: s.updatedBy, action: "settings.save", tenantId: s.tenantId, detail: { version: rec.version, hash: sha256Hex(canonicalJson(rec)) } });
    return rec;
  }
  async audit() {
    try {
      return (await fs.readFile(this.p("audit.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditEvent);
    } catch {
      return [];
    }
  }
}

/** The query function the Neon store needs: text with $1… parameters, rows back. */
export type SqlQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * C7: Neon Postgres store, used on Vercel once DATABASE_URL (or
 * POSTGRES_URL) is set: the same database as the chat transcripts.
 * Write-once like the file store: a snapshot or settings version is
 * inserted, never updated. Source screenshots are kept as base64 text.
 * Tables are created on first use. Never served publicly.
 */
export class NeonStore implements SnapshotStore {
  readonly kind = "neon";
  readonly writable = true;
  private ready: Promise<void> | null = null;
  constructor(private q: SqlQuery) {}

  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS pricing_sources (sha256 text PRIMARY KEY, tenant_id text NOT NULL, mime text NOT NULL, size integer NOT NULL, bytes_b64 text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
        await this.q(`CREATE TABLE IF NOT EXISTS pricing_snapshots (run_id text PRIMARY KEY, tenant_id text NOT NULL, scenario_id text NOT NULL, priced_at timestamptz NOT NULL, inputs_hash text NOT NULL, body jsonb NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS pricing_snapshots_lookup ON pricing_snapshots (tenant_id, scenario_id, priced_at DESC)`);
        await this.q(`CREATE TABLE IF NOT EXISTS pricing_settings (tenant_id text NOT NULL, version integer NOT NULL, body jsonb NOT NULL, PRIMARY KEY (tenant_id, version))`);
        await this.q(`CREATE TABLE IF NOT EXISTS pricing_audit (id bigserial PRIMARY KEY, at timestamptz NOT NULL, actor text NOT NULL, action text NOT NULL, tenant_id text NOT NULL, detail jsonb NOT NULL)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  private async audit_(e: AuditEvent) {
    await this.q(`INSERT INTO pricing_audit (at, actor, action, tenant_id, detail) VALUES ($1, $2, $3, $4, $5)`, [e.at, e.actor, e.action, e.tenantId, JSON.stringify(e.detail)]);
  }

  async putSource(bytes: Uint8Array, mime: string, actor: string, tenantId: string) {
    await this.init();
    const h = sha256Hex(bytes);
    const rows = await this.q(
      `INSERT INTO pricing_sources (sha256, tenant_id, mime, size, bytes_b64, created_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (sha256) DO NOTHING RETURNING sha256`,
      [h, tenantId, mime, bytes.length, Buffer.from(bytes).toString("base64"), actor],
    );
    if (rows.length) await this.audit_({ at: new Date().toISOString(), actor, action: "source.put", tenantId, detail: { sha256: h, mime, bytes: bytes.length } });
    return h;
  }
  async hasSource(h: string) {
    await this.init();
    return (await this.q(`SELECT 1 FROM pricing_sources WHERE sha256 = $1`, [h])).length > 0;
  }
  async putSnapshot(s: StoredSnapshot) {
    await this.init();
    await this.q(`INSERT INTO pricing_snapshots (run_id, tenant_id, scenario_id, priced_at, inputs_hash, body) VALUES ($1, $2, $3, $4, $5, $6)`, [
      s.run.runId, s.run.tenantId, s.run.scenario.id, s.run.pricedAt, s.run.inputsHash, JSON.stringify(s),
    ]);
    await this.audit_({ at: s.enteredAt, actor: s.enteredBy, action: "snapshot.publish", tenantId: s.run.tenantId, detail: { runId: s.run.runId, scenario: s.run.scenario.id, inputsHash: s.run.inputsHash, sourceSha256: s.sourceSha256 } });
  }
  async latestSnapshot(t: string, sc: string) {
    return (await this.listSnapshots(t, sc, 1))[0] ?? null;
  }
  async listSnapshots(t: string, sc: string, limit = 50) {
    await this.init();
    const rows = await this.q(`SELECT body FROM pricing_snapshots WHERE tenant_id = $1 AND scenario_id = $2 ORDER BY priced_at DESC LIMIT $3`, [t, sc, limit]);
    return rows.map((r) => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as StoredSnapshot);
  }
  async latestSettings(t: string) {
    await this.init();
    const rows = await this.q(`SELECT body FROM pricing_settings WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1`, [t]);
    const b = rows[0]?.body;
    return b ? ((typeof b === "string" ? JSON.parse(b) : b) as TenantSettings) : null;
  }
  async putSettings(s: Omit<TenantSettings, "version">) {
    const prev = await this.latestSettings(s.tenantId);
    const rec: TenantSettings = { ...s, version: (prev?.version ?? 0) + 1 };
    await this.q(`INSERT INTO pricing_settings (tenant_id, version, body) VALUES ($1, $2, $3)`, [rec.tenantId, rec.version, JSON.stringify(rec)]);
    await this.audit_({ at: s.updatedAt, actor: s.updatedBy, action: "settings.save", tenantId: s.tenantId, detail: { version: rec.version, hash: sha256Hex(canonicalJson(rec)) } });
    return rec;
  }
  async audit() {
    await this.init();
    const rows = await this.q(`SELECT at, actor, action, tenant_id, detail FROM pricing_audit ORDER BY id`);
    return rows.map((r) => ({
      at: new Date(r.at as string).toISOString(),
      actor: r.actor as string,
      action: r.action as AuditEvent["action"],
      tenantId: r.tenant_id as string,
      detail: (typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail) as AuditEvent["detail"],
    }));
  }
}

let neonStore: NeonStore | null = null;

let override: SnapshotStore | null = null;
/** Tests swap the store. */
export function setStoreForTests(s: SnapshotStore | null) { override = s; }

export function getStore(): SnapshotStore {
  if (override) return override;
  const dir = process.env.PRICING_STORE_DIR;
  if (dir) return new FileStore(dir, true);
  // C7: Neon when the deployment has a database (the same one as the chat transcripts).
  const url = databaseUrl();
  if (url) {
    if (!neonStore) {
      const sql = neon(url);
      neonStore = new NeonStore((text, params) => sql.query(text, params ?? []) as Promise<Record<string, unknown>[]>);
    }
    return neonStore;
  }
  const root = path.join(process.cwd(), ".data", "pricing");
  if (process.env.VERCEL) {
    return new FileStore(root, false, "Snapshot storage is not configured for this deployment. Connect Neon (it sets DATABASE_URL) and redeploy; Vercel's filesystem does not persist.");
  }
  return new FileStore(root, true);
}
