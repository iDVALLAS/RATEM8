/**
 * lib/accounts/store.ts — Command Center accounts (D1). SERVER-ONLY.
 *
 * Users, one-time sign-in links, sessions and an append-only audit log.
 * Neon Postgres when DATABASE_URL is set (tables made on first use), an
 * in-memory store for tests and local runs without a database.
 *
 * Only hashes of sign-in tokens and session tokens are stored, never the
 * tokens themselves, so a database leak can't be used to sign in.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export const ROLES = ["owner", "team_lead", "lo", "assistant"] as const;
export type Role = (typeof ROLES)[number];

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** The loan officer record this account is (lib/config.ts ids like "mlo-001"), or null for staff. */
  mloId: string | null;
  /** D8.1: for an assistant, the loan officer whose book they work. Without one an assistant sees no clients. */
  assistsUserId?: string | null;
  status: "active" | "disabled";
  createdAt: string;
  createdBy: string;
};

/** D34: a second sign-in step. The secret is stored encrypted; recovery codes only as hashes. */
export type MfaRecord = { userId: string; secretEnc: string; enabledAt: string | null; lastStep: number; recoveryHashes: string[]; createdAt: string };

export type AuditEntry = { at: string; actor: string; action: string; detail: Record<string, string | number | boolean | null> };

export interface AccountStore {
  readonly kind: string;
  userByEmail(email: string): Promise<User | null>;
  userById(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  putUser(u: User): Promise<void>;
  putLoginToken(hash: string, userId: string, expiresAt: string): Promise<void>;
  /** Marks the token used and returns its user id, or null if missing, used or expired. */
  consumeLoginToken(hash: string, now: string): Promise<string | null>;
  /** D34: the token's user id without using it up (the code step). */
  peekLoginToken(hash: string, now: string): Promise<string | null>;
  getMfa(userId: string): Promise<MfaRecord | null>;
  putMfa(r: MfaRecord): Promise<void>;
  deleteMfa(userId: string): Promise<void>;
  putSession(hash: string, userId: string, expiresAt: string): Promise<void>;
  sessionUser(hash: string, now: string): Promise<string | null>;
  deleteSession(hash: string): Promise<void>;
  deleteSessionsFor(userId: string): Promise<void>;
  audit(e: AuditEntry): Promise<void>;
  recentAudit(limit: number): Promise<AuditEntry[]>;
}

export class MemoryAccountStore implements AccountStore {
  readonly kind = "memory";
  private users = new Map<string, User>();
  private tokens = new Map<string, { userId: string; expiresAt: string; used: boolean }>();
  private sessions = new Map<string, { userId: string; expiresAt: string }>();
  private log: AuditEntry[] = [];
  private mfa = new Map<string, MfaRecord>();

  async userByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async userById(id: string) {
    return this.users.get(id) ?? null;
  }
  async listUsers() {
    return [...this.users.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async putUser(u: User) {
    this.users.set(u.id, { ...u, email: u.email.toLowerCase() });
  }
  async putLoginToken(hash: string, userId: string, expiresAt: string) {
    this.tokens.set(hash, { userId, expiresAt, used: false });
  }
  async consumeLoginToken(hash: string, now: string) {
    const t = this.tokens.get(hash);
    if (!t || t.used || t.expiresAt <= now) return null;
    t.used = true;
    return t.userId;
  }
  async peekLoginToken(hash: string, now: string) {
    const t = this.tokens.get(hash);
    return t && !t.used && t.expiresAt > now ? t.userId : null;
  }
  async getMfa(userId: string) {
    const r = this.mfa.get(userId);
    return r ? { ...r, recoveryHashes: [...r.recoveryHashes] } : null;
  }
  async putMfa(r: MfaRecord) {
    this.mfa.set(r.userId, { ...r, recoveryHashes: [...r.recoveryHashes] });
  }
  async deleteMfa(userId: string) {
    this.mfa.delete(userId);
  }
  async putSession(hash: string, userId: string, expiresAt: string) {
    this.sessions.set(hash, { userId, expiresAt });
  }
  async sessionUser(hash: string, now: string) {
    const s = this.sessions.get(hash);
    return s && s.expiresAt > now ? s.userId : null;
  }
  async deleteSession(hash: string) {
    this.sessions.delete(hash);
  }
  async deleteSessionsFor(userId: string) {
    for (const [k, s] of this.sessions) if (s.userId === userId) this.sessions.delete(k);
  }
  async audit(e: AuditEntry) {
    this.log.push(e);
  }
  async recentAudit(limit: number) {
    return this.log.slice(-limit).reverse();
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

const toUser = (r: Row): User => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  role: r.role as Role,
  mloId: (r.mlo_id as string | null) ?? null,
  assistsUserId: (r.assists_user_id as string | null) ?? null,
  status: r.status as User["status"],
  createdAt: new Date(r.created_at as string).toISOString(),
  createdBy: r.created_by as string,
});

export class NeonAccountStore implements AccountStore {
  readonly kind = "neon";
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}

  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_users (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, role text NOT NULL, mlo_id text, status text NOT NULL, created_at timestamptz NOT NULL, created_by text NOT NULL)`);
        await this.q(`ALTER TABLE cc_users ADD COLUMN IF NOT EXISTS assists_user_id text`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_login_tokens (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_sessions_user ON cc_sessions (user_id)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_mfa (user_id text PRIMARY KEY, secret_enc text NOT NULL, enabled_at timestamptz, last_step bigint NOT NULL DEFAULT -1, recovery_hashes jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_audit (id bigserial PRIMARY KEY, at timestamptz NOT NULL, actor text NOT NULL, action text NOT NULL, detail jsonb NOT NULL)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  async userByEmail(email: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_users WHERE email = $1`, [email.toLowerCase()]);
    return r[0] ? toUser(r[0]) : null;
  }
  async userById(id: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_users WHERE id = $1`, [id]);
    return r[0] ? toUser(r[0]) : null;
  }
  async listUsers() {
    await this.init();
    return (await this.q(`SELECT * FROM cc_users ORDER BY created_at`)).map(toUser);
  }
  async putUser(u: User) {
    await this.init();
    await this.q(
      `INSERT INTO cc_users (id, email, name, role, mlo_id, status, created_at, created_by, assists_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, mlo_id = EXCLUDED.mlo_id, status = EXCLUDED.status, assists_user_id = EXCLUDED.assists_user_id`,
      [u.id, u.email.toLowerCase(), u.name, u.role, u.mloId, u.status, u.createdAt, u.createdBy, u.assistsUserId ?? null],
    );
  }
  async putLoginToken(hash: string, userId: string, expiresAt: string) {
    await this.init();
    await this.q(`INSERT INTO cc_login_tokens (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`, [hash, userId, expiresAt]);
    await this.q(`DELETE FROM cc_login_tokens WHERE expires_at < now() - interval '1 day'`);
  }
  async consumeLoginToken(hash: string, now: string) {
    await this.init();
    const r = await this.q(`UPDATE cc_login_tokens SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING user_id`, [hash, now]);
    return (r[0]?.user_id as string | undefined) ?? null;
  }
  async peekLoginToken(hash: string, now: string) {
    await this.init();
    const r = await this.q(`SELECT user_id FROM cc_login_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2`, [hash, now]);
    return (r[0]?.user_id as string | undefined) ?? null;
  }
  async getMfa(userId: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_mfa WHERE user_id = $1`, [userId]);
    if (!r[0]) return null;
    const x = r[0];
    return { userId: x.user_id as string, secretEnc: x.secret_enc as string, enabledAt: x.enabled_at ? new Date(x.enabled_at as string).toISOString() : null, lastStep: Number(x.last_step), recoveryHashes: (typeof x.recovery_hashes === "string" ? JSON.parse(x.recovery_hashes) : x.recovery_hashes) as string[], createdAt: new Date(x.created_at as string).toISOString() };
  }
  async putMfa(m: MfaRecord) {
    await this.init();
    await this.q(
      `INSERT INTO cc_mfa (user_id, secret_enc, enabled_at, last_step, recovery_hashes, created_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled_at = EXCLUDED.enabled_at, last_step = EXCLUDED.last_step, recovery_hashes = EXCLUDED.recovery_hashes`,
      [m.userId, m.secretEnc, m.enabledAt, m.lastStep, JSON.stringify(m.recoveryHashes), m.createdAt],
    );
  }
  async deleteMfa(userId: string) {
    await this.init();
    await this.q(`DELETE FROM cc_mfa WHERE user_id = $1`, [userId]);
  }
  async putSession(hash: string, userId: string, expiresAt: string) {
    await this.init();
    await this.q(`INSERT INTO cc_sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`, [hash, userId, expiresAt]);
    await this.q(`DELETE FROM cc_sessions WHERE expires_at < now()`);
  }
  async sessionUser(hash: string, now: string) {
    await this.init();
    const r = await this.q(`SELECT user_id FROM cc_sessions WHERE token_hash = $1 AND expires_at > $2`, [hash, now]);
    return (r[0]?.user_id as string | undefined) ?? null;
  }
  async deleteSession(hash: string) {
    await this.init();
    await this.q(`DELETE FROM cc_sessions WHERE token_hash = $1`, [hash]);
  }
  async deleteSessionsFor(userId: string) {
    await this.init();
    await this.q(`DELETE FROM cc_sessions WHERE user_id = $1`, [userId]);
  }
  async audit(e: AuditEntry) {
    await this.init();
    await this.q(`INSERT INTO cc_audit (at, actor, action, detail) VALUES ($1,$2,$3,$4)`, [e.at, e.actor, e.action, JSON.stringify(e.detail)]);
  }
  async recentAudit(limit: number) {
    await this.init();
    const r = await this.q(`SELECT at, actor, action, detail FROM cc_audit ORDER BY id DESC LIMIT $1`, [limit]);
    return r.map((x) => ({ at: new Date(x.at as string).toISOString(), actor: x.actor as string, action: x.action as string, detail: (typeof x.detail === "string" ? JSON.parse(x.detail) : x.detail) as AuditEntry["detail"] }));
  }
}

let override: AccountStore | null = null;
let neonStore: NeonAccountStore | null = null;
// One copy per server process, shared by pages, actions and routes (Next bundles them separately).
const g = globalThis as unknown as { __lm8AccountMemory?: MemoryAccountStore };
const memory = (g.__lm8AccountMemory ??= new MemoryAccountStore());

/** Tests swap the store. */
export function setAccountStoreForTests(s: AccountStore | null) {
  override = s;
}

export function accountStore(): AccountStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonAccountStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
