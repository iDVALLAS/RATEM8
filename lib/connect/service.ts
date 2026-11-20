/**
 * lib/connect/service.ts — stored connections to loan systems and CRMs
 * (D63). SERVER-ONLY. Neon table cc_connections when DATABASE_URL is set,
 * else memory. Secrets are sealed (AES-256-GCM, lib/mail/seal.ts) and never
 * shown again: the page shows only that a field is saved.
 */
import { neon } from "@neondatabase/serverless";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { databaseUrl } from "@/lib/m8/server";
import { seal, unseal } from "@/lib/mail/seal";
import { systemByKey } from "./catalog";

export type Connection = { ownerUserId: string; system: string; fields: Record<string, string>; status: "saved" | "tested" | "failed"; note: string; savedAt: string; testedAt: string | null };

export interface ConnectionStore {
  get(owner: string, system: string): Promise<Connection | null>;
  put(c: Connection): Promise<void>;
  list(owner: string): Promise<Connection[]>;
  remove(owner: string, system: string): Promise<void>;
}

class Memory implements ConnectionStore {
  private m = new Map<string, Connection>();
  async get(o: string, s: string) {
    const x = this.m.get(`${o}:${s}`);
    return x ? structuredClone(x) : null;
  }
  async put(c: Connection) {
    this.m.set(`${c.ownerUserId}:${c.system}`, structuredClone(c));
  }
  async list(o: string) {
    return [...this.m.values()].filter((c) => c.ownerUserId === o).map((c) => structuredClone(c));
  }
  async remove(o: string, s: string) {
    this.m.delete(`${o}:${s}`);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
class Neon implements ConnectionStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_connections (owner_user_id text NOT NULL, system text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (owner_user_id, system))`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async get(o: string, s: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_connections WHERE owner_user_id = $1 AND system = $2`, [o, s]);
    return r[0] ? parse<Connection>(r[0].data) : null;
  }
  async put(c: Connection) {
    await this.init();
    await this.q(`INSERT INTO cc_connections (owner_user_id, system, data) VALUES ($1,$2,$3) ON CONFLICT (owner_user_id, system) DO UPDATE SET data = EXCLUDED.data`, [c.ownerUserId, c.system, JSON.stringify(c)]);
  }
  async list(o: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_connections WHERE owner_user_id = $1`, [o])).map((x) => parse<Connection>(x.data));
  }
  async remove(o: string, s: string) {
    await this.init();
    await this.q(`DELETE FROM cc_connections WHERE owner_user_id = $1 AND system = $2`, [o, s]);
  }
}

let override: ConnectionStore | null = null;
let neonStore: Neon | null = null;
const g = globalThis as unknown as { __lm8ConnMemory?: Memory };
const memory = (g.__lm8ConnMemory ??= new Memory());
export const setConnectionStoreForTests = (s: ConnectionStore | null) => void (override = s);
export const newMemoryConnectionStore = (): ConnectionStore => new Memory();
export function connectionStore(): ConnectionStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new Neon((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}

const iso = (d: Date) => d.toISOString();

/** Saves the credentials a vendor issued. Blank secret fields keep what's saved. */
export async function saveConnection(user: User, system: string, input: Record<string, string>, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = systemByKey(system);
  if (!s?.credentials) return { ok: false, error: "That system doesn't take stored credentials." };
  const old = await connectionStore().get(user.id, system);
  const fields: Record<string, string> = {};
  for (const f of s.credentials) {
    const v = String(input[f.key] ?? "").trim().slice(0, 500);
    if (f.secret) fields[f.key] = v ? seal(v) : old?.fields[f.key] ?? "";
    else fields[f.key] = v || (old?.fields[f.key] ?? "");
  }
  if (!Object.values(fields).some(Boolean)) return { ok: false, error: "Fill in at least one field." };
  await connectionStore().put({ ownerUserId: user.id, system, fields, status: "saved", note: "", savedAt: iso(now), testedAt: null });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "connect.save", detail: { system } });
  return { ok: true };
}

export async function removeConnection(user: User, system: string, now = new Date()): Promise<void> {
  await connectionStore().remove(user.id, system);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "connect.remove", detail: { system } });
}

/** A field's real value, for the server only. */
export function fieldValue(c: Connection, key: string): string {
  const s = systemByKey(c.system)?.credentials?.find((f) => f.key === key);
  return s?.secret ? unseal(c.fields[key]) ?? "" : c.fields[key] ?? "";
}

/**
 * Encompass: signs in to Developer Connect with the saved credentials
 * (OAuth 2.0, the API user as user@encompass:instance). A pass means the
 * credentials work; the loan sync is then finished against the instance.
 */
export async function testConnection(user: User, system: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  const c = await connectionStore().get(user.id, system);
  if (!c) return { ok: false, error: "Save the credentials first." };
  if (system !== "encompass") return { ok: false, error: "There's no test for this system yet: its API is opened by the vendor per account." };
  const v = (k: string) => fieldValue(c, k);
  if (!v("instanceId") || !v("user") || !v("password") || !v("clientId") || !v("clientSecret")) return { ok: false, error: "Fill in all five fields." };
  let ok = false;
  let note = "";
  try {
    const res = await fetcher("https://api.elliemae.com/oauth2/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username: `${v("user")}@encompass:${v("instanceId")}`, password: v("password"), client_id: v("clientId"), client_secret: v("clientSecret"), scope: "lp" }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
    ok = res.ok && !!body.access_token;
    note = ok ? "Signed in to Encompass." : `Encompass said: ${(body.error_description ?? body.error ?? `HTTP ${res.status}`).slice(0, 160)}`;
  } catch {
    note = "Couldn't reach Encompass.";
  }
  await connectionStore().put({ ...c, status: ok ? "tested" : "failed", note, testedAt: iso(now) });
  return ok ? { ok: true, note } : { ok: false, error: note };
}
